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
 */
async function hasBackOfficeAccess(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;
    const user = await prisma.user.findFirst({
        where: { email: { mode: 'insensitive', equals: email.trim() } },
        select: { accessLevel: true },
    });
    return user?.accessLevel === 'admin' || user?.accessLevel === 'super_admin';
}

export default withAuth(
    async function proxy(req) {
        const token = req.nextauth.token;

        if (req.nextUrl.pathname.startsWith('/admin') && !(await hasBackOfficeAccess(token?.email))) {
            // Vers l'accueil et non la page de connexion : la session existe, c'est
            // l'accès qui manque, et la page de connexion renverrait ici. Même
            // réponse pour toutes les URL, /admin/stats comprise, qui ne doit pas
            // laisser deviner qu'elle existe.
            return NextResponse.redirect(new URL('/', req.url));
        }

        if (token?.passwordNeedsChange === true) {
            const changePasswordPath = '/auth/change-password';

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