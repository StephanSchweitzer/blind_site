import { withAuth } from 'next-auth/middleware';

export default withAuth(
    function middleware(req) {
        // Default behavior to redirect unauthorized users to the sign-in page
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
        '/api/news/:path*',
        '/api/books/:path*',
        '/dashboard/:path*',
        '/news/:path*',
        '/books/:path*',
    ],
};
