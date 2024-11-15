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
        // Protect all backend API routes except for GET requests
        '/api/news/:path*',
        '/api/books/:path*',
        // Protect backend pages and frontend pages
        '/dashboard/:path*', // Protect dashboard and its subroutes
        '/news/:path*', // Protect news pages
        '/books/:path*', // Protect books pages
    ],
};
