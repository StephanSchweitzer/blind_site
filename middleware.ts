import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token;

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
            signIn: '/api/auth/signin',
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