import type { Metadata } from 'next';

export const SITE_URL = 'https://eca-aveugles.fr';

/**
 * L'aperçu d'un lien partagé (Facebook, WhatsApp, LinkedIn…) : 1200 × 630,
 * le format que ces sites attendent. L'ancien aperçu était la bannière du logo,
 * 750 × 141 (annoncée 1024 × 168), rognée en vignette illisible.
 *
 * Une image fixe dans public/, pas un app/opengraph-image : Next n'applique un
 * fichier d'aperçu qu'au segment qui le porte, et chaque page publique déclare
 * son propre `openGraph` (pour son `og:url`) — l'image en aurait disparu.
 */
const OG_IMAGE = {
    url: '/og-image.png',
    width: 1200,
    height: 630,
    alt: 'ECA - Enregistrements à la Carte pour les Aveugles',
};

/**
 * Ce que tous les aperçus partagent. Ni titre ni description : Next reprend
 * ceux de la page (resolve-metadata, `inheritFromMetadata`). Écrits ici, ils
 * l'emportaient, et chaque page partagée s'annonçait comme l'accueil.
 */
export const SHARED_OPEN_GRAPH = {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'ECA Aveugles',
    images: [OG_IMAGE],
} satisfies Metadata['openGraph'];

/**
 * Les métadonnées d'une page publique : son titre, sa description, son adresse
 * canonique et son `og:url`. Un `openGraph` de page remplace celui du layout en
 * entier, d'où le socle commun recopié.
 */
export function publicPageMetadata({
    title,
    description,
    path,
}: {
    title: Metadata['title'];
    description: string;
    path: string;
}): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: { ...SHARED_OPEN_GRAPH, url: path },
    };
}
