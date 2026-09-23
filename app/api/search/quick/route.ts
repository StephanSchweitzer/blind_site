import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { buildUserNameSearch, searchTokens } from '@/lib/search';
import { meetsSearchMinLength, normalizeSearchQuery, parseEntityId } from '@/lib/search-query';
import { searchVariants } from '@/lib/search-normalize';
import { getUserNameOnly } from '@/lib/users/displayName';
import { ACCESS_LEVEL_LABELS, MEMBER_TYPE_LABELS, type AccessLevel, type MemberType } from '@/lib/user-enums';

/**
 * « Recherche rapide » — the Ctrl+K box of the back office:
 * GET /api/search/quick?q=morvan
 *
 * Every list already has its own search bar, but each one only searches
 * itself: to reach an auditeur's facture, staff opened the members list,
 * searched, opened the dossier, then the facture tab. This answers « where is
 * X? » from anywhere, and hands back a link to the record itself — the dossier,
 * or the list opened on that one row (the `?order=` / `?bill=`… deep links the
 * lists already honour).
 *
 * People go through the members lists' own name search (lib/search.ts). Books
 * do NOT reuse the catalogue's field map: that one also reads descriptions,
 * publishers and genres, right for a filtered list but noise in a box that
 * shows five lines — « morvan » returned books whose blurb named him above
 * the ones he wrote. Here it is title, sous-titre, author and ISBN, accent-
 * insensitive and ranked by resemblance (`findBooks`). Kept deliberately
 * small — five people, five books, and the records a number names — because
 * it is a way in, not a results page.
 *
 * Admin-only, like every list it points into.
 */

export type QuickSearchHit = {
    /** Group heading in the box: « Membres », « Livres », « Numéros ». */
    group: 'Membres' | 'Livres' | 'Numéros';
    label: string;
    detail: string;
    href: string;
};

const PER_GROUP = 5;

/** `%` and `_` typed by someone are letters, not LIKE wildcards. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

/**
 * Books whose title, sous-titre, author or ISBN hold every word typed, accents
 * ignored, best resemblance first.
 *
 * Raw SQL for the one thing Prisma cannot do: `immutable_unaccent` on the
 * column, so « etranger » finds « L'Étranger » (the catalogue list uses the
 * same function — lib/books/bookList.ts). Each word is tried in every
 * typographic spelling `searchVariants` gives, as the lists do. Raw SQL
 * bypasses the soft-delete extension, hence the explicit `deletedAt`.
 */
async function findBooks(q: string): Promise<{ id: number; title: string; author: string | null }[]> {
    const tokens = searchTokens(q).slice(0, 8);
    if (tokens.length === 0) return [];
    const params: string[] = [];
    const haystack = `LOWER(immutable_unaccent(concat_ws(' ', b.title, b.subtitle, b.author, b.isbn)))`;
    const conditions = tokens.map((token) => {
        const alternatives = searchVariants(token).map((variant) => {
            params.push(`%${escapeLike(variant)}%`);
            return `${haystack} LIKE LOWER(immutable_unaccent($${params.length}))`;
        });
        return `(${alternatives.join(' OR ')})`;
    });
    params.push(q);
    return prisma.$queryRawUnsafe(
        `SELECT b.id, b.title, b.author
           FROM "Book" b
          WHERE b."deletedAt" IS NULL AND ${conditions.join(' AND ')}
          ORDER BY similarity(LOWER(immutable_unaccent(concat_ws(' ', b.title, b.author))),
                              LOWER(immutable_unaccent($${params.length}))) DESC,
                   b.title ASC
          LIMIT ${PER_GROUP}`,
        ...params,
    );
}

const memberRole = (u: { memberType: string | null; accessLevel: string | null }) => {
    // A permanent is identified by access level, not role — see CLAUDE.md,
    // « two separate admin axes ».
    if (u.accessLevel === 'admin' || u.accessLevel === 'super_admin') {
        return ACCESS_LEVEL_LABELS[u.accessLevel as AccessLevel];
    }
    const type = u.memberType === 'ecouteur' ? 'auditeur' : u.memberType;
    return (type && MEMBER_TYPE_LABELS[type as MemberType]) || 'Membre';
};

export const GET = withAdmin(async (request) => {
    const q = normalizeSearchQuery(new URL(request.url).searchParams.get('q') ?? '');
    if (!meetsSearchMinLength(q, 2)) return NextResponse.json({ hits: [] });

    const id = parseEntityId(q);
    const userWhere = buildUserNameSearch(q);

    const [users, books, bookById, order, assignment, bill, payment] = await Promise.all([
        userWhere
            ? prisma.user.findMany({
                where: userWhere,
                select: {
                    id: true, name: true, firstName: true, lastName: true, email: true,
                    memberType: true, accessLevel: true,
                },
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                take: PER_GROUP,
            })
            : [],
        findBooks(q),
        id ? prisma.book.findFirst({ where: { id }, select: { id: true, title: true } }) : null,
        // A number can name any of these at once — « 412 » is demande 412 AND
        // facture 412. Each one found is offered; none replaces the others.
        id ? prisma.orders.findFirst({
            where: { id },
            select: { id: true, catalogue: { select: { title: true } }, aveugle: { select: { name: true, firstName: true, lastName: true, email: true } } },
        }) : null,
        id ? prisma.assignment.findFirst({
            where: { id },
            select: { id: true, catalogue: { select: { title: true } } },
        }) : null,
        id ? prisma.bill.findFirst({
            where: { id, isActive: true },
            select: { id: true, client: { select: { name: true, firstName: true, lastName: true, email: true } } },
        }) : null,
        id ? prisma.payment.findFirst({
            where: { id },
            select: { id: true, client: { select: { name: true, firstName: true, lastName: true, email: true } } },
        }) : null,
    ]);

    const hits: QuickSearchHit[] = [];

    if (order) hits.push({
        group: 'Numéros',
        label: `Demande n°${order.id}`,
        detail: [order.catalogue?.title, getUserNameOnly(order.aveugle)].filter(Boolean).join(' · '),
        href: `/admin/orders?order=${order.id}`,
    });
    if (assignment) hits.push({
        group: 'Numéros',
        label: `Attribution n°${assignment.id}`,
        detail: assignment.catalogue?.title ?? '',
        href: `/admin/assignments?assignment=${assignment.id}`,
    });
    if (bill) hits.push({
        group: 'Numéros',
        label: `Facture n°${bill.id}`,
        detail: getUserNameOnly(bill.client),
        href: `/admin/bills?bill=${bill.id}`,
    });
    if (bookById) hits.push({
        group: 'Numéros',
        label: `Livre n°${bookById.id}`,
        detail: bookById.title,
        href: `/admin/books?book=${bookById.id}`,
    });
    if (payment) hits.push({
        group: 'Numéros',
        label: `Paiement n°${payment.id}`,
        detail: getUserNameOnly(payment.client),
        href: `/admin/payments?payment=${payment.id}`,
    });

    for (const u of users) {
        hits.push({
            group: 'Membres',
            label: getUserNameOnly(u) || u.email || `Membre n°${u.id}`,
            detail: [memberRole(u), u.email].filter(Boolean).join(' · '),
            href: `/admin/users/dossier/${u.id}`,
        });
    }
    for (const b of books) {
        hits.push({
            group: 'Livres',
            label: b.title,
            detail: b.author ?? '',
            href: `/admin/books?book=${b.id}`,
        });
    }

    return NextResponse.json({ hits });
});
