import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped context for the audit trail.
 *
 * Two things travel here instead of being threaded through every call site:
 *
 *   - the ACTOR (who is writing). Set once by the auth layer — the withAuth /
 *     withAdmin / withSuperAdmin guards, and getCurrentUser() for the handful of
 *     routes and server actions that resolve the session by hand. Nothing below
 *     that has to know or pass an actorId.
 *   - the BYPASS flag, so imports, backfills and bulk scripts can run without
 *     writing one AuditEvent per touched record.
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

const actorStorage = new AsyncLocalStorage<ActorBox>();
const bypassStorage = new AsyncLocalStorage<true>();

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
