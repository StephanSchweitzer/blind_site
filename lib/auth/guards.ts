import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runWithAuditActor, setAuditActor } from '@/lib/audit/context';
// The server build of `unstable_rethrow`, not `next/navigation`: that entry
// point pulls in the client router (React.createContext) outside Next's
// bundler, which breaks every script and test that runs these guards under Node.
import { unstable_rethrow } from 'next/dist/client/components/unstable-rethrow.server';
import { unexpectedErrorResponse } from '@/lib/api-errors';
import { OUTCOME_NOTHING_CHANGED } from '@/lib/user-error';

export interface CurrentUser {
    id: number;
    email: string | null;
    accessLevel: string;
}

/**
 * Resolves the signed-in user authoritatively from the DB (keyed off the session
 * email), so authorization never trusts a stale/forged token field. Returns null
 * when there's no valid session.
 *
 * Also stamps the audit actor for the rest of the request, which is what lets
 * the routes that authenticate by hand (they don't use the guards below) still
 * attribute their writes — see lib/audit/context.ts.
 *
 * findFirst, not findUnique: only list reads carry the soft-delete filter
 * (lib/prisma.ts), and a by-id read deliberately resolves deleted rows. Here
 * that meant a permanent deleted while signed in kept passing withAdmin for
 * the rest of their JWT's life (30 days) — sign-in refused them, the session
 * they already held did not. `email` is unique, so nothing else changes.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;
    const me = await prisma.user.findFirst({
        where: { email: session.user.email },
        select: { id: true, email: true, accessLevel: true },
    });
    if (me) setAuditActor({ actorId: me.id, actorEmail: me.email });
    return me;
}

export function isAdmin(level: string | null | undefined): boolean {
    return level === 'admin' || level === 'super_admin';
}

export function isSuperAdmin(level: string | null | undefined): boolean {
    return level === 'super_admin';
}

type RouteCtx = { params?: Promise<Record<string, string>> };
type GuardedHandler = (
    req: NextRequest,
    ctx: RouteCtx & { me: CurrentUser }
) => Promise<Response> | Response;
type RouteHandler = (req: NextRequest, ctx: RouteCtx) => Promise<Response> | Response;

/**
 * Runs the guarded handler inside the audit-actor scope, so every write it makes
 * — however deep — is attributed without any call site passing an actorId.
 *
 * Also the last net under every guarded route: an exception nobody caught used
 * to reach Next, which answers 500 with an empty body — and the toast then fell
 * back to a « Échec de la suppression » that said nothing, not even that the
 * cause was unknown. It now becomes an `unexpectedErrorResponse`: logged with a
 * reference, and worded so the permanent knows to write in with it. A read can
 * say nothing changed; a write can't know how far it got.
 */
async function runAttributed(
    me: CurrentUser,
    handler: GuardedHandler,
    req: NextRequest,
    ctx: RouteCtx
): Promise<Response> {
    try {
        return await runWithAuditActor({ actorId: me.id, actorEmail: me.email }, () =>
            handler(req, { ...ctx, me })
        );
    } catch (error) {
        // notFound()/redirect() and Next's dynamic-rendering signals travel as
        // exceptions and are Next's to handle.
        unstable_rethrow(error);
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        return unexpectedErrorResponse({
            where: `${req.method} ${req.nextUrl?.pathname ?? req.url}`,
            error,
            ...(isRead ? { outcome: OUTCOME_NOTHING_CHANGED } : {}),
        });
    }
}

/** Wrap a handler to require any authenticated user. Passes `me` through ctx. */
export function withAuth(handler: GuardedHandler): RouteHandler {
    return async (req, ctx) => {
        const me = await getCurrentUser();
        if (!me) return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        return runAttributed(me, handler, req, ctx);
    };
}

/** Wrap a handler to require admin or super_admin. Passes `me` through ctx. */
export function withAdmin(handler: GuardedHandler): RouteHandler {
    return async (req, ctx) => {
        const me = await getCurrentUser();
        if (!me) return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        if (!isAdmin(me.accessLevel)) {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }
        return runAttributed(me, handler, req, ctx);
    };
}

/** Wrap a handler to require super_admin specifically. Passes `me` through ctx. */
export function withSuperAdmin(handler: GuardedHandler): RouteHandler {
    return async (req, ctx) => {
        const me = await getCurrentUser();
        if (!me) return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        if (!isSuperAdmin(me.accessLevel)) {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }
        return runAttributed(me, handler, req, ctx);
    };
}

/**
 * `withAdmin` for a **server action**: runs `body` only for an admin, and inside
 * the audit-actor scope so its writes carry a name.
 *
 * Server actions are not wrapped by the guards above, so they used to
 * authenticate with a bare `getCurrentUser()` and lean on the `enterWith`
 * fallback in setAuditActor to attribute what followed. That fallback does not
 * survive the function it is called in once Node runs AsyncLocalStorage on
 * AsyncContextFrame — the default from Node 24 — because the caller resumes from
 * a frame captured before the call. The store is silently empty from there on,
 * and every write landed in the trail as « Système »: 29 % of it in production,
 * including all twelve book deletions and every doublon fusion.
 *
 * `runWithAuditActor` wraps the body instead of mutating an ambient store, so it
 * holds on either implementation. Actions must go through here rather than call
 * getCurrentUser() themselves.
 *
 * `onDenied` is what the action returns when the caller is not an admin — each
 * action has its own result shape, so it supplies its own refusal.
 */
export async function asAdmin<T>(
    onDenied: T,
    body: (me: CurrentUser) => Promise<T>
): Promise<T> {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) return onDenied;
    // The await is load-bearing, as in withoutAudit: it keeps the scope open
    // until the body's lazy PrismaPromises have actually run.
    return runWithAuditActor({ actorId: me.id, actorEmail: me.email }, async () => await body(me));
}