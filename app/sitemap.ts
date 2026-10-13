import type { MetadataRoute } from 'next';
import { SITE_URL as siteUrl } from '@/lib/seo';

// Sans `lastModified` : il valait l'heure de la génération, si bien que chaque
// page se disait modifiée à chaque lecture — et Google cesse de croire une date
// qui ment. Mieux vaut n'en donner aucune.
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${siteUrl}/`, changeFrequency: 'monthly', priority: 1 },
        { url: `${siteUrl}/catalogue`, changeFrequency: 'daily', priority: 0.9 },
        { url: `${siteUrl}/listes-de-livres`, changeFrequency: 'weekly', priority: 0.7 },
        { url: `${siteUrl}/dernieres-infos`, changeFrequency: 'weekly', priority: 0.7 },
        { url: `${siteUrl}/nous-rejoindre`, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${siteUrl}/contact`, changeFrequency: 'yearly', priority: 0.5 },
        { url: `${siteUrl}/nous-connaitre/historique`, changeFrequency: 'yearly', priority: 0.4 },
        { url: `${siteUrl}/nous-connaitre/informations-pratiques`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${siteUrl}/nous-connaitre/equipe`, changeFrequency: 'monthly', priority: 0.4 },
        { url: `${siteUrl}/accessibilite`, changeFrequency: 'yearly', priority: 0.3 },
    ];
}
