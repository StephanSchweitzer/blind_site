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

/**
 * Lignes par page des listes du back-office — une seule valeur pour toutes.
 * À 10, les demandes tenaient sur plus de 2 000 pages et une journée de travail
 * se passait à cliquer « suivant » ; 25 tient encore dans un écran ou deux, avec
 * l'en-tête du tableau qui reste collé en haut.
 */
export const ADMIN_PAGE_SIZE = 25;

/** Numéro de page ≥ 1. Toute saisie non entière retombe sur 1. */
export function parsePageParam(raw: string | string[] | null | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Taille de page, bornée des deux côtés.
 *
 * Le plafond n'est pas décoratif : /api/catalogue est servi au public, et un
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

/**
 * Tailles proposées par le sélecteur « Lignes par page ». Une liste fermée
 * plutôt qu'un nombre libre : `?perPage=` se partage dans un lien, et chaque
 * valeur admise est une taille qu'on a regardée à l'écran.
 */
export const ADMIN_PAGE_SIZES = [25, 50, 100] as const;

/** `?perPage=` ramené à l'une des tailles proposées ; sinon la taille par défaut. */
export function parsePageSizeParam(raw: string | string[] | null | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(value ?? '', 10);
    return (ADMIN_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : ADMIN_PAGE_SIZE;
}

/** Tout ce qu'une liste paginée affiche d'elle-même, calculé en un seul endroit. */
export interface PageInfo {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    /** Rang de la première ligne affichée (1-based), 0 quand la liste est vide. */
    from: number;
    /** Rang de la dernière ligne affichée. */
    to: number;
}

export function pageInfo(page: number, pageSize: number, total: number): PageInfo {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : Math.min(pageSkip(page, pageSize) + 1, total);
    const to = Math.min(page * pageSize, total);
    return { page, pageSize, total, totalPages, from, to };
}

/**
 * La page à laquelle renvoyer quand `?page=` dépasse la fin, ou `null`.
 *
 * Un lien vers la page 40 survit au filtre qui ramène la liste à trois pages,
 * ou aux suppressions qui la raccourcissent. La requête revient alors vide et
 * la liste affichait « Aucune demande trouvée » — faux : il y en a, simplement
 * pas si loin. On le détecte après coup (lignes vides, total non nul) plutôt
 * que de compter avant de lire : la lecture et le comptage restent parallèles.
 */
export function outOfRangePage(info: PageInfo, rowCount: number): number | null {
    return rowCount === 0 && info.total > 0 && info.page > info.totalPages ? info.totalPages : null;
}

/** Une case de la barre de pages : un numéro, ou un saut « … ». */
export type PageSlot = number | 'gap-start' | 'gap-end';

/**
 * Les numéros à montrer autour de la page courante : la première, la dernière,
 * la courante et ses deux voisines, des « … » pour le reste.
 *
 * Toujours sept cases dès qu'il y a plus de sept pages — un « … » remplace un
 * seul numéro ou plusieurs, mais la barre ne change jamais de largeur : les
 * boutons ne glissent pas sous le pointeur d'une page à l'autre.
 */
export function pageSlots(page: number, totalPages: number): PageSlot[] {
    const SLOTS = 7;
    if (totalPages <= SLOTS) return Array.from({ length: totalPages }, (_, i) => i + 1);

    // Fenêtre de trois numéros, collée au bord quand la courante s'en approche.
    const start = Math.min(Math.max(page - 1, 3), totalPages - 4);
    const end = start + 2;
    const slots: PageSlot[] = [1];
    slots.push(start === 3 ? 2 : 'gap-start');
    for (let p = start; p <= end; p++) slots.push(p);
    slots.push(end === totalPages - 2 ? totalPages - 1 : 'gap-end');
    slots.push(totalPages);
    return slots;
}

/**
 * La même URL, sur une autre page — pour la redirection d'une page hors limites.
 * Les autres paramètres (recherche, filtres, tri, taille) sont gardés tels quels.
 */
export function hrefForPage(
    pathname: string,
    sp: Record<string, string | string[] | undefined>,
    page: number,
): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
        if (key === 'page' || value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
}
