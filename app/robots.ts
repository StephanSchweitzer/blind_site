import type { MetadataRoute } from 'next';
import { SITE_URL as siteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/api', '/auth'],
        },
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
