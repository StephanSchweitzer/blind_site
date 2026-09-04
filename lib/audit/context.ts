import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped context for the audit trail.
 *
 * Four things travel here instead of being threaded through every call site:
 *
 *   - the ACTOR (who is writing). Set once by the auth layer — the withAuth /
 *     withAdmin / withSuperAdmin guards, and getCurrentUser() for the handful of
 *     routes and server actions that resolve the session by hand. Nothing below
 *     that has to know or pass an actorId.
 *   - the BYPASS flag, so imports, backfills and bulk scripts can run without
 *     writing one AuditEvent per touched record.
 *   - the current interactive TRANSACTION CLIENT, so the trail reads and writes
 *     inside the caller's transaction instead of beside it (see
 *     runInAuditTransaction).
 *   - the AUDIT-READ flag, which tells the soft-delete extension to stand aside
 *     while the trail reads a row's « avant » state (see isAuditRead).
 *
 * Node runtime only (node:async_hooks). Everything that reaches Prisma already
 * runs on Node — middleware.ts, which is on Edge, never touches this module.
 */

export interface AuditActor {
    actorId: number | null;
    /** Denormalized so the trail keeps naming its author after a user deletion. */
    actorEmail: string | null;
}

/**
 * The store is a mutable box rather than the actor itself: the guards open the
 * scope, but a later getCurrentUser() inside the same request must be able to
 * fill in (or refine) the actor without reopening it.
 */
interface ActorBox {
    actor: AuditActor | null;
}

/**
 * Pinned to globalThis, for the same reason the Prisma client is in lib/prisma.ts.
 *
 * Next bundles route handlers and server actions into separate server layers, and
 * a module imported from both is instantiated once per layer. Module-local
 * storages therefore gave the actions one AsyncLocalStorage and the audit
 * extension — reading through the client that lib/prisma.ts caches globally —
 * another. The scope was opened on one and read from the other, so the trail saw
 * no actor and wrote « Système ». One instance per process fixes that for every
 * caller at once.
 */
const STORAGES = Symbol.for('eca.audit.context');

/**
 * The interactive-transaction client the audit path borrows. Kept structural —
 * this module stays free of Prisma types, and the extension casts it back.
 */
export type AuditTransactionClient = object;

interface AuditStorages {
    actor: AsyncLocalStorage<ActorBox>;
    bypass: AsyncLocalStorage<true>;
    tx: AsyncLocalStorage<AuditTransactionClient>;
    auditRead: AsyncLocalStorage<true>;
}

const globalForAudit = globalThis as typeof globalThis & { [STORAGES]?: Partial<AuditStorages> };

// One `??=` per storage rather than one for the whole object: a process that
// already holds an older shape of this box (a dev server that hot-reloaded
// across a change to this file) would otherwise keep it and leave the newer
// storages undefined.
const storages: Partial<AuditStorages> = (globalForAudit[STORAGES] ??= {});

const actorStorage = (storages.actor ??= new AsyncLocalStorage<ActorBox>());
const bypassStorage = (storages.bypass ??= new AsyncLocalStorage<true>());
const txStorage = (storages.tx ??= new AsyncLocalStorage<AuditTransactionClient>());
const auditReadStorage = (storages.auditRead ??= new AsyncLocalStorage<true>());

/** Run `fn` with `actor` attributed to every audited write it performs. */
export function runWithAuditActor<T>(actor: AuditActor | null, fn: () => T): T {
    return actorStorage.run({ actor }, fn);
}

/**
 * Attribute the rest of the current async context to `actor`.
 *
 * Inside a runWithAuditActor scope this just updates the box. Outside one (a
 * route that resolves the session itself, a server action) it falls back to
 * enterWith, which binds the store to the current async resource — one
 * request handler invocation — without needing a callback wrapper.
 */
export function setAuditActor(actor: AuditActor): void {
    const box = actorStorage.getStore();
    if (box) {
        box.actor = actor;
        return;
    }
    actorStorage.enterWith({ actor });
}

export function getAuditActor(): AuditActor | null {
    return actorStorage.getStore()?.actor ?? null;
}

/**
 * Escape hatch for migrations, imports and maintenance scripts: writes inside
 * `fn` are performed normally but produce no AuditEvent rows.
 *
 * The offline scripts (prisma/seed.ts, prisma/dev-claude-user.ts, scripts/*)
 * each build their own bare PrismaClient and never touch the extended client in
 * lib/prisma.ts, so they are already outside the trail and don't need this. It
 * is here for in-app bulk work — an import route, a backfill run from a handler.
 *
 * The `await` is load-bearing. A Prisma call is a lazy PrismaPromise: it only
 * reaches the query pipeline when something awaits it. Returning `fn()` straight
 * out of `run` would leave the scope before that happened, and the writes would
 * be audited after all.
 */
export function withoutAudit<T>(fn: () => Promise<T>): Promise<T> {
    return bypassStorage.run(true, async () => await fn());
}

export function isAuditBypassed(): boolean {
    return bypassStorage.getStore() === true;
}

/**
 * Lend the audit trail the transaction it is being written inside.
 *
 * WHY THIS EXISTS
 *
 * The extension used to read « avant » states and write AuditEvent rows through
 * the bare client, which is not the caller's transaction. Three things followed,
 * all of them wrong and none of them visible:
 *
 *   - a transaction that rolled back left its events behind, so the journal
 *     reported a création or — worse, since it carries a snapshot and a restore
 *     button — a suppression that never happened;
 *   - a row created and then updated inside one transaction produced NO event
 *     for the update at all: the « avant » read could not see the uncommitted
 *     row, and an update with no prior state is dropped. A demande attached to
 *     its facture in the transaction that created it was traced as if it had
 *     never been attached;
 *   - a row written twice in one transaction had the SAME « avant » on both
 *     events — the pre-transaction value — so the journal showed two competing
 *     edits from one starting point instead of a sequence, and a second
 *     statement whose `where` no longer matched still produced an event.
 *
 * lib/prisma.ts opens this scope around every interactive $transaction callback,
 * so nothing at a call site has to know. Outside a transaction there is no store
 * and the extension falls back to the bare client, exactly as before.
 *
 * CONSEQUENCE WORTH KNOWING
 *
 * Audit writes now commit — and roll back — with the work they describe. If one
 * ever fails, it poisons the transaction it is in: the caller's write fails too,
 * loudly, instead of succeeding untraced. That is the intended direction for a
 * trail that exists to be trusted.
 */
export function runInAuditTransaction<T>(client: AuditTransactionClient, fn: () => T): T {
    return txStorage.run(client, fn);
}

/** The transaction the current write is inside, or null outside one. */
export function getAuditTransactionClient(): AuditTransactionClient | null {
    return txStorage.getStore() ?? null;
}

/**
 * Mark a read as the trail's own, so the soft-delete extension in lib/prisma.ts
 * leaves its `where` alone.
 *
 * Borrowing the caller's transaction client means borrowing the extensions on
 * it, and one of them hides soft-deleted users from every list read. A deletion
 * must stay traceable: without this, deleting an already soft-deleted user
 * would read no « avant » row and produce no event.
 */
export function runAsAuditRead<T>(fn: () => Promise<T>): Promise<T> {
    return auditReadStorage.run(true, async () => await fn());
}

export function isAuditRead(): boolean {
    return auditReadStorage.getStore() === true;
}
