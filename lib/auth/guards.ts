import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface CurrentUser {
    id: number;
    email: string | null;
    accessLevel: string;
}

/**
 * Resolves the signed-in user authoritatively from the DB (keyed off the session
 * email), so authorization never trusts a stale/forged token field. Returns null
 * when there's no valid session.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;
    return prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, accessLevel: true },
    });
}

export function isAdmin(level: string | null | undefined): boolean {
    return level === 'admin' || level === 'super_admin';
}

type RouteCtx = { params?: Promise<Record<string, string>> };
type GuardedHandler = (
    req: NextRequest,
    ctx: RouteCtx & { me: CurrentUser }
) => Promise<Response> | Response;
type RouteHandler = (req: NextRequest, ctx: RouteCtx) => Promise<Response> | Response;

/** Wrap a handler to require any authenticated user. Passes `me` through ctx. */
export function withAuth(handler: GuardedHandler): RouteHandler {
    return async (req, ctx) => {
        const me = await getCurrentUser();
        if (!me) return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        return handler(req, { ...ctx, me });
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
        return handler(req, { ...ctx, me });
    };
}