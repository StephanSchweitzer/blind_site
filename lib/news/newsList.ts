import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { newsTypesMatchingLabel, searchTokens } from '@/lib/search';
import { normalizeApostrophes, searchKeyVariants, searchVariants } from '@/lib/search-normalize';
import { parseEntityId } from '@/lib/search-query';
import { parseLimitParam, parsePageParam } from '@/lib/pagination';
import { suggestSearches } from '@/lib/search-suggest';
import { newsTypeLabels, type NewsResponse, type NewsType } from '@/types/news';
import {
    ADMIN_NEWS_PAGE_SIZE,
    NEWS_SEARCH_FIELDS,
    type AdminNewsQuery,
    type AdminNewsResult,
    type AdminNewsRow,
    type NewsSearchField,
} from './news-list-types';

export * from './news-list-types';

/**
 * La liste des dernières infos du back-office : recherche, filtres, pagination.
 *
 * Même moteur que la table des livres (lib/books/bookList.ts), et pour la même
 * raison : la recherche passait par un `contains` Prisma, qui compare les
 * octets. « evenement » ne trouvait pas « Événement », « noel » pas « Noël » —
 * dans des textes rédigés en français, c'est-à-dire presque toujours accentués.
 * Ici chaque colonne de texte passe par `immutable_unaccent` des deux côtés,
 * comme le catalogue, et l'auteur par `User.searchKey`, la clé déjà repliée
 * (accents, casse, apostrophes) qui sert toutes les recherches de personnes.
 *
 * Servie deux fois, depuis un seul endroit : au premier rendu de
 * /admin/news (page.tsx) et par GET /api/news/search pendant la frappe. Deux
 * copies d'une recherche, ce sont deux recherches qui divergent.
 *
 * Le site public (/api/news et le premier rendu de /dernieres-infos) passe par
 * le même moteur, via `listPublicNews`. Deux moteurs, c'était une recherche
 * insensible aux accents pour les permanents et pas pour les visiteurs.
 *
 * L'AUDIENCE EST ÉCRITE DANS LE MOTEUR, pas passée en drapeau par l'appelant :
 * `listPublicNews` cherche l'auteur par son nom AFFICHÉ seulement. `User.searchKey`
 * contient aussi le prénom, le nom et l'e-mail — l'ouvrir au public ferait de la
 * recherche un oracle (« jean@… a-t-il écrit une info ? »). Elle ne propose pas
 * non plus de personnes en « Vouliez-vous dire », et ne renvoie jamais
 * d'identifiant d'auteur.
 */

type Audience = 'admin' | 'public';

const NEWS_TYPES = Object.keys(newsTypeLabels) as NewsType[];

const single = (value: string | string[] | null | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value ?? undefined;

/** Lit la requête depuis une URL ou depuis les searchParams d'une page. */
export function parseAdminNewsQuery(
    get: (key: string) => string | string[] | null | undefined,
): AdminNewsQuery {
    const field = single(get('field'));
    const type = single(get('type'));
    return {
        search: single(get('search')) ?? '',
        field: (NEWS_SEARCH_FIELDS as readonly string[]).includes(field ?? '')
            ? (field as NewsSearchField)
            : 'all',
        type: type && (NEWS_TYPES as string[]).includes(type) ? (type as NewsType) : null,
        page: parsePageParam(single(get('page'))),
        limit: parseLimitParam(single(get('limit')) ?? null, ADMIN_NEWS_PAGE_SIZE),
        suggest: single(get('suggest')) === '1',
    };
}

/** `%` et `_` tapés par le permanent sont des caractères, pas des jokers. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Une colonne de texte, n'importe quelle graphie du token, accents et casse repliés. */
function unaccentedContains(column: Prisma.Sql, token: string): Prisma.Sql[] {
    return searchVariants(token).map(
        (variant) =>
            Prisma.sql`LOWER(immutable_unaccent(${column})) LIKE LOWER(immutable_unaccent(${`%${escapeLike(variant)}%`}))`,
    );
}

/** L'auteur, par la clé repliée qui sert toutes les recherches de personnes. */
function authorContains(token: string): Prisma.Sql[] {
    return searchKeyVariants(token).map(
        (variant) => Prisma.sql`COALESCE(u."searchKey", '') LIKE ${`%${escapeLike(variant)}%`}`,
    );
}

/** L'auteur tel qu'un visiteur le voit : son nom affiché, jamais l'e-mail ni le nom civil. */
function publicAuthorContains(token: string): Prisma.Sql[] {
    return unaccentedContains(Prisma.sql`COALESCE(u.name, '')`, token);
}

function tokenClause(token: string, field: NewsSearchField, audience: Audience): Prisma.Sql {
    const authorClauses = audience === 'admin' ? authorContains : publicAuthorContains;
    const title = Prisma.sql`n.title`;
    const content = Prisma.sql`n.content`;
    let clauses: Prisma.Sql[];
    switch (field) {
        case 'title':
            clauses = unaccentedContains(title, token);
            break;
        case 'content':
            clauses = unaccentedContains(content, token);
            break;
        case 'author':
            clauses = authorClauses(token);
            break;
        default: {
            clauses = [
                ...unaccentedContains(title, token),
                ...unaccentedContains(content, token),
                ...authorClauses(token),
                // La valeur brute (« gen » trouve GENERAL) et le libellé affiché
                // (« evenement » trouve EVENEMENT), comme buildNewsSearchWhere.
                Prisma.sql`LOWER(n.type) LIKE LOWER(${`%${escapeLike(token)}%`})`,
            ];
            const labelled = newsTypesMatchingLabel(token);
            if (labelled.length) clauses.push(Prisma.sql`n.type IN (${Prisma.join(labelled)})`);
            // « #42 » ou « 42 » : l'identifiant affiché dans « Modifier la dernière info ».
            const id = parseEntityId(token);
            if (id !== null) clauses.push(Prisma.sql`n.id = ${id}`);
        }
    }
    return clauses.length ? Prisma.sql`(${Prisma.join(clauses, ' OR ')})` : Prisma.sql`FALSE`;
}

/** Tous les mots doivent trouver quelque chose — pas forcément dans le même champ. */
function searchWhere(search: string, field: NewsSearchField, audience: Audience): Prisma.Sql {
    const tokens = searchTokens(search);
    if (!tokens.length) return Prisma.sql`TRUE`;
    return Prisma.join(tokens.map((token) => tokenClause(token, field, audience)), ' AND ');
}

const FROM = Prisma.sql`FROM "News" n LEFT JOIN "User" u ON u.id = n."authorId"`;

async function countFor(
    search: string,
    field: NewsSearchField,
    type: string | null,
    audience: Audience,
): Promise<number> {
    const typeWhere = type ? Prisma.sql`AND n.type = ${type}` : Prisma.empty;
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count ${FROM} WHERE ${searchWhere(search, field, audience)} ${typeWhere}`;
    return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Extrait
// ---------------------------------------------------------------------------

/** Un caractère replié comme la recherche le voit : minuscule, sans accent, apostrophe droite. */
const foldChar = (ch: string) =>
    normalizeApostrophes(ch).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le Markdown affiché en clair : titres, emphase et liens réduits à leur texte. */
function plainText(markdown: string): string {
    return markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_`~|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const EXCERPT_RADIUS = 70;

/**
 * Le passage autour du premier token trouvé dans le contenu — le texte seul
 * dit rarement pourquoi une info sans le mot dans son titre est remontée.
 * Au mieux : un token introuvable ici (variante à trait d'union, par exemple)
 * ne donne simplement pas d'extrait.
 */
function excerptFor(content: string, tokens: string[]): string | null {
    const text = plainText(content);
    // Plié caractère par caractère, avec pour chaque position pliée l'indice
    // d'origine : un « é » décomposé reste UN caractère du texte affiché.
    let folded = '';
    const origin: number[] = [];
    for (let i = 0; i < text.length; i++) {
        for (const ch of foldChar(text[i])) {
            folded += ch;
            origin.push(i);
        }
    }
    for (const token of tokens) {
        const needle = [...token].map(foldChar).join('');
        if (!needle) continue;
        const at = folded.indexOf(needle);
        if (at === -1) continue;
        const start = origin[at];
        const end = origin[Math.min(at + needle.length, origin.length) - 1] + 1;
        const from = Math.max(0, start - EXCERPT_RADIUS);
        const to = Math.min(text.length, end + EXCERPT_RADIUS);
        return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
    }
    return null;
}

const titleHasEveryToken = (title: string, tokens: string[]) => {
    const folded = [...title].map(foldChar).join('');
    return tokens.every((token) => folded.includes([...token].map(foldChar).join('')));
};

// ---------------------------------------------------------------------------

export async function listAdminNews(query: AdminNewsQuery): Promise<AdminNewsResult> {
    const { search, field, type, page, limit } = query;
    const where = searchWhere(search, field, 'admin');
    const typeWhere = type ? Prisma.sql`AND n.type = ${type}` : Prisma.empty;

    const [rows, perType] = await Promise.all([
        prisma.$queryRaw<{
            id: number;
            title: string;
            content: string;
            type: string;
            publishedAt: Date;
            authorName: string | null;
        }[]>`
            SELECT n.id, n.title, n.content, n.type, n."publishedAt", u.name AS "authorName"
            ${FROM}
            WHERE ${where} ${typeWhere}
            ORDER BY n."publishedAt" DESC, n.id DESC
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        prisma.$queryRaw<{ type: string; count: number }[]>`
            SELECT n.type, COUNT(*)::int AS count ${FROM} WHERE ${where} GROUP BY n.type`,
    ]);

    const typeCounts = Object.fromEntries(NEWS_TYPES.map((t) => [t, 0])) as Record<NewsType, number>;
    let allCount = 0;
    for (const { type: t, count } of perType) {
        if (t in typeCounts) typeCounts[t as NewsType] = count;
        allCount += count;
    }
    const total = type ? typeCounts[type] : allCount;

    const tokens = searchTokens(search);
    const wantsExcerpt = tokens.length > 0 && (field === 'all' || field === 'content');
    const items: AdminNewsRow[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        publishedAt: row.publishedAt.toISOString(),
        type: row.type as NewsType,
        author: row.authorName !== null ? { name: row.authorName } : null,
        excerpt:
            wantsExcerpt && (field === 'content' || !titleHasEveryToken(row.title, tokens))
                ? excerptFor(row.content, tokens)
                : null,
    }));

    const searchSuggestions =
        query.suggest && total === 0 && search.trim()
            ? await suggestSearches(search, ['news', 'people'], (q) => countFor(q, field, type, 'admin'))
            : undefined;

    return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        typeCounts,
        allCount,
        ...(searchSuggestions ? { searchSuggestions } : {}),
    };
}

// ---------------------------------------------------------------------------
// Côté public
// ---------------------------------------------------------------------------

export const PUBLIC_NEWS_PAGE_SIZE = 5;

export interface PublicNewsQuery {
    search: string;
    /** Une valeur brute (« EVENEMENT »), ou null pour tous les types. Inconnue : aucun résultat. */
    type: string | null;
    page: number;
    limit: number;
    suggest: boolean;
}

/** Lit la requête publique : `type=all` ou absent veut dire tous les types. */
export function parsePublicNewsQuery(get: (key: string) => string | null | undefined): PublicNewsQuery {
    const type = get('type');
    return {
        search: get('search') ?? '',
        type: type && type !== 'all' ? type : null,
        page: parsePageParam(get('page')),
        limit: parseLimitParam(get('limit') ?? null, PUBLIC_NEWS_PAGE_SIZE),
        suggest: get('suggest') === '1',
    };
}

/**
 * Les dernières infos du site public. Une liste blanche de champs — titre,
 * contenu, type, date, nom affiché de l'auteur — écrite ici pour qu'une colonne
 * ajoutée un jour à `News` ne parte pas au public sans que quelqu'un le décide.
 */
export async function listPublicNews(query: PublicNewsQuery): Promise<NewsResponse> {
    const { search, type, page, limit } = query;
    const where = searchWhere(search, 'all', 'public');
    const typeWhere = type ? Prisma.sql`AND n.type = ${type}` : Prisma.empty;

    const [rows, total] = await Promise.all([
        prisma.$queryRaw<{
            id: number;
            title: string;
            content: string;
            type: string;
            publishedAt: Date;
            authorName: string | null;
        }[]>`
            SELECT n.id, n.title, n.content, n.type, n."publishedAt", u.name AS "authorName"
            ${FROM}
            WHERE ${where} ${typeWhere}
            ORDER BY n."publishedAt" DESC, n.id DESC
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        countFor(search, 'all', type, 'public'),
    ]);

    // Titres seulement : la route est publique.
    const searchSuggestions =
        query.suggest && total === 0 && search.trim()
            ? await suggestSearches(search, ['news'], (q) => countFor(q, 'all', type, 'public'))
            : undefined;

    return {
        items: rows.map((row) => ({
            id: row.id,
            title: row.title,
            content: row.content,
            type: row.type as NewsType,
            publishedAt: row.publishedAt,
            author: { name: row.authorName ?? '' },
        })),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        ...(searchSuggestions ? { searchSuggestions } : {}),
    };
}
