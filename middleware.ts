import { withAuth } from 'next-auth/middleware';

export default withAuth(
    function middleware() {
        return;
    },
    {
        pages: {
            signIn: '/api/auth/signin', // Default NextAuth sign-in page
        },
    }
);

export const config = {
    matcher: [
        '/admin/:path*',
    ],
};
