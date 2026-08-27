import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        domains: ['api.dicebear.com'],
    },
    /**
     * The « listes de livres » pages used to live under /coups-de-coeur (and
     * /admin/listes-de-livres). The public one was in the sitemap and has
     * been indexed, so the old path has to keep resolving: 308 preserves the
     * method and body, which matters for the API paths below.
     *
     * These are permanent — keep them. Search results, printed documents and
     * mail sent before the rename all point at the old URL.
     */
    async redirects() {
        return [
            {
                source: '/coups-de-coeur',
                destination: '/listes-de-livres',
                permanent: true,
            },
            {
                source: '/admin/listes-de-livres/:path*',
                destination: '/admin/listes-de-livres/:path*',
                permanent: true,
            },
            {
                source: '/api/listes-de-livres/:path*',
                destination: '/api/listes-de-livres/:path*',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
