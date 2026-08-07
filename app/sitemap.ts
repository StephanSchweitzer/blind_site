import type { MetadataRoute } from 'next';

const siteUrl = 'https://eca-aveugles.fr';

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();

    return [
        { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
        { url: `${siteUrl}/catalogue`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
        { url: `${siteUrl}/coups-de-coeur`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
        { url: `${siteUrl}/dernieres-infos`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
        { url: `${siteUrl}/nous-rejoindre`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    ];
}
