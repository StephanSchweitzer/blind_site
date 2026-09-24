import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Whether the account behind this token may see the back office RIGHT NOW.
 *
 * Read from the database, never from the token: the JWT carries the access
 * level it was issued with, for 30 days, and a demotion or a deletion does not
 * rewrite it. `findFirst` so the soft-delete filter applies (lib/prisma.ts).
 *
 * This is the one gate for every page under /admin. The pages themselves read
 * Prisma directly and almost none of them checked the level — /admin/bills,
 * the dossier tabs and the rest rendered for any signed-in account. A check in
 * app/admin/layout.tsx would not be enough either: a layout is not re-run for
 * every request (client navigations and RSC fetches render only the segment
 * that changed), whereas the proxy sees each one. Proxy runs on Node.js in
 * Next 16, so Prisma is available here.
 *
 * The same read answers the forced password change for /admin: the token's
 * flag is the one stamped at sign-in, so a reset made by a super admin while
 * the person was signed in never reached it. The API side is enforced by the
 * admin guards (lib/auth/guards.ts), on the same column.
 */
async function readBackOfficeAccess(
    email: string | null | undefined
): Promise<{ allowed: boolean; mustChangePassword: boolean }> {
    if (!email) return { allowed: false, mustChangePassword: false };
    const user = await prisma.user.findFirst({
        where: { email: { mode: 'insensitive', equals: email.trim() } },
        select: { accessLevel: true, passwordNeedsChange: true },
    });
    return {
        allowed: user?.accessLevel === 'admin' || user?.accessLevel === 'super_admin',
        mustChangePassword: user?.passwordNeedsChange === true,
    };
}

/**
 * How long /admin waits on that read before giving up.
 *
 * When Supabase runs out of connections the query does not fail, it queues —
 * `connectionTimeoutMillis` only bounds reaching the pooler, not the pooler
 * finding a backend. The proxy then held every /admin request until Vercel cut
 * it at its own limit with a bare 504 MIDDLEWARE_INVOCATION_TIMEOUT
 * (2026-09-24). Well under that limit, and it fails closed: no read, no entry.
 */
const ACCESS_CHECK_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`délai dépassé (${ms} ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function serviceUnavailable(): NextResponse {
    const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Service momentanément indisponible</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
<h1>Service momentanément indisponible</h1>
<p>La base de données ne répond pas pour le moment. Réessayez dans quelques instants.</p>
<p><a href="">Réessayer</a></p>
</body>
</html>`;
    return new NextResponse(html, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' },
    });
}

const CHANGE_PASSWORD_PATH = '/auth/change-password';

export default withAuth(
    async function proxy(req) {
        const token = req.nextauth.token;

        if (req.nextUrl.pathname.startsWith('/admin')) {
            let access: Awaited<ReturnType<typeof readBackOfficeAccess>>;
            try {
                access = await withTimeout(readBackOfficeAccess(token?.email), ACCESS_CHECK_TIMEOUT_MS);
            } catch (error) {
                console.error('[proxy] contrôle d’accès /admin impossible :', error);
                return serviceUnavailable();
            }
            if (!access.allowed) {
                // Vers l'accueil et non la page de connexion : la session existe, c'est
                // l'accès qui manque, et la page de connexion renverrait ici. Même
                // réponse pour toutes les URL, /admin/stats comprise, qui ne doit pas
                // laisser deviner qu'elle existe.
                return NextResponse.redirect(new URL('/', req.url));
            }
            if (access.mustChangePassword) {
                return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.url));
            }
            // The database is the authority for /admin: a stale token flag below
            // must not bounce someone who has already changed their password.
            return NextResponse.next();
        }

        if (token?.passwordNeedsChange === true) {
            const changePasswordPath = CHANGE_PASSWORD_PATH;

            if (
                req.nextUrl.pathname === changePasswordPath ||
                req.nextUrl.pathname.startsWith('/api/user/change-password') ||
                req.nextUrl.pathname.startsWith('/api/user/password-status') ||
                req.nextUrl.pathname.startsWith('/api/auth')
            ) {
                return NextResponse.next();
            }

            const url = new URL(changePasswordPath, req.url);
            return NextResponse.redirect(url);
        }

        return NextResponse.next();
    },
    {
        pages: {
            signIn: '/auth/signin',
        },
        callbacks: {
            authorized: ({ token }) => !!token
        }
    }
);

export const config = {
    matcher: [
        '/admin/:path*',
        '/auth/change-password',
        '/profile'
    ],
};