import type { MetadataRoute } from 'next';

const siteUrl = 'https://eca-aveugles.fr';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/api', '/auth', '/formulaire-adhesion'],
        },
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
