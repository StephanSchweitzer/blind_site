import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        domains: ['api.dicebear.com'],
    },
    /**
     * The « listes de livres » pages used to live under /coups-de-coeur (and
     * /admin/manage_coups_de_coeur, /api/coups-de-coeur). The public one was in
     * the sitemap and has been indexed, so the old paths have to keep
     * resolving: 308 preserves the method and body, which matters for the API.
     *
     * These are permanent — keep them. Search results, printed documents and
     * mail sent before the rename all point at the old URL.
     *
     * Each prefix needs BOTH an exact rule and a `:path+` (one-or-more) rule.
     * A single `:path*` looks tempting but matches the bare path with an empty
     * segment, and the destination then compiles to a trailing slash —
     * /admin/listes-de-livres/ — which Next immediately strips again under the
     * default trailingSlash: false. That is a redirect loop, not a redirect.
     *
     * NEVER let a source equal its own destination here: bulk find-and-replace
     * over this repo's paths has already turned these sources into self-
     * redirects once, which takes the whole page down with ERR_TOO_MANY_REDIRECTS.
     */
    async redirects() {
        return [
            {
                source: '/coups-de-coeur',
                destination: '/listes-de-livres',
                permanent: true,
            },
            {
                source: '/admin/manage_coups_de_coeur',
                destination: '/admin/listes-de-livres',
                permanent: true,
            },
            {
                source: '/admin/manage_coups_de_coeur/:path+',
                destination: '/admin/listes-de-livres/:path+',
                permanent: true,
            },
            {
                source: '/api/coups-de-coeur',
                destination: '/api/listes-de-livres',
                permanent: true,
            },
            {
                source: '/api/coups-de-coeur/:path+',
                destination: '/api/listes-de-livres/:path+',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
