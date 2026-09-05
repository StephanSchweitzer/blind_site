/**
 * Lecture des paramètres `page` / `limit`, en un seul endroit.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * `Math.max(1, parseInt(x))` a l'air d'une borne. Ce n'en est pas une :
 * `parseInt('abc')` vaut `NaN`, et `Math.max(1, NaN)` vaut `NaN` — pas 1. Toute
 * comparaison avec NaN étant fausse, le clamp le laisse passer intact, il file
 * dans `skip: (page - 1) * n` et Prisma refuse la requête. Le même piège vaut
 * pour `Math.max(0, NaN)`.
 *
 * Concrètement, avant ce fichier : `?page=abc` renvoyait 500 sur /api/bills et
 * /api/payments, et faisait tomber les trois onglets du dossier d'une personne
 * (demandes, paiements, attributions) sur « Application error ». Les pages qui
 * s'en tiraient le devaient à un `|| 1` glissé avant le clamp — c'est-à-dire à
 * une idiome correcte appliquée à cinq endroits sur onze.
 *
 * Une URL bricolée ou un lien périmé n'est pas une erreur serveur : on retombe
 * sur la première page.
 */

/** Numéro de page ≥ 1. Toute saisie non entière retombe sur 1. */
export function parsePageParam(raw: string | string[] | null | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Taille de page, bornée des deux côtés.
 *
 * Le plafond n'est pas décoratif : /api/books est servi au public, et un
 * `limit` non borné y transformait une requête anonyme en export du catalogue
 * entier. Le plancher évite `Math.ceil(total / 0)` → `Infinity`, que
 * `JSON.stringify` sérialise en `null` — c'est ce que `totalPages` valait pour
 * `?limit=0`. Un `limit` négatif, lui, devenait un `take` négatif, que Prisma
 * interprète comme « les N derniers », donc une pagination à l'envers.
 */
export function parseLimitParam(
    raw: string | string[] | null | undefined,
    fallback: number,
    max = 100,
): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
}

/** Décalage SQL correspondant, toujours ≥ 0. */
export function pageSkip(page: number, limit: number): number {
    return (page - 1) * limit;
}
