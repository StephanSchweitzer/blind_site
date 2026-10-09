/**
 * Central registry of on-demand cache tags for the public, statically-served
 * pages. One tag per content domain. Cached reads (unstable_cache) attach a
 * tag; write routes invalidate it via revalidatePublic() after a successful
 * mutation.
 */
export const CACHE_TAGS = {
    catalogue: 'catalogue',
    coupsDeCoeur: 'coups-de-coeur',
    news: 'news',
    siteContact: 'site-contact',
    team: 'team',
    historique: 'historique',
    informationsPratiques: 'informations-pratiques',
    nousRejoindre: 'nous-rejoindre',
    // Back-office only: the statuts / formats / civilités / genres the admin
    // forms list in their selects (lib/reference-data.ts). Invalidated through
    // revalidateReferenceData(), not revalidatePublic() — no public page reads it.
    referenceData: 'reference-data',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
