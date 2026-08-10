import { notFound } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import ReviewClient, { type ReviewBook, type ReviewPair } from './review-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PER_PAGE = 10;

const BOOK_SELECT = {
    id: true,
    title: true,
    author: true,
    subtitle: true,
    publishedDate: true,
    isbn: true,
    description: true,
    publisher: true,
    pageCount: true,
    readingDurationMinutes: true,
    audio_filepath: true,
    audioLinkStatus: true,
    // Needed by isDoubleRecording: a path alone does not mean a recording exists,
    // and that distinction is what decides whether this card is merge-able.
    audioTrackCount: true,
    source_access_id: true,
    needsReview: true,
    id_arbre: true,
    escalatedAt: true,
} as const;

/**
 * Free-text filter over the queue. A permanent looking for one book knows its
 * title, its author or its number — paging through hundreds of pairs to reach it
 * is not a search. A bare number matches the id (and the Access source id), so
 * the "#123" written everywhere else in the back office works here too.
 */
function buildSearchWhere(q: string): Prisma.BookWhereInput | undefined {
    const raw = q.trim();
    const term = raw.replace(/^#/, '');
    if (!term) return undefined;

    const asNumber = Number(term);
    const isNumeric = Number.isInteger(asNumber) && asNumber > 0;
    const idMatches: Prisma.BookWhereInput[] = isNumeric
        ? [{ id: asNumber }, { source_access_id: asNumber }, { id_arbre: asNumber }]
        : [];

    // "#123" is unambiguous: the permanent wants that record, not every title
    // containing "123". Without the hash, a number searches the text too.
    if (raw.startsWith('#') && isNumeric) return { OR: idMatches };

    return {
        OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { author: { contains: term, mode: 'insensitive' } },
            { isbn: { contains: term, mode: 'insensitive' } },
            ...idMatches,
        ],
    };
}

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminReviewPage({ searchParams }: PageProps) {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) notFound();

    const params = await searchParams;
    const page = Math.max(1, parseInt((Array.isArray(params.page) ? params.page[0] : params.page) || '1') || 1);
    const q = (Array.isArray(params.q) ? params.q[0] : params.q) || '';

    const searchWhere = buildSearchWhere(q);
    const where: Prisma.BookWhereInput = { needsReview: true, ...(searchWhere ?? {}) };

    const [flagged, total, queueTotal] = await Promise.all([
        prisma.book.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * PER_PAGE,
            take: PER_PAGE,
            select: BOOK_SELECT,
        }),
        prisma.book.count({ where }),
        // The full queue size, so the header can still say how much is left
        // to review while a search is narrowing the list.
        searchWhere ? prisma.book.count({ where: { needsReview: true } }) : Promise.resolve(0),
    ]);

    // Batch-resolve matches: a flagged book's `id_arbre` points at the `source_access_id`
    // of the book it should be compared against. One query, then map (first match wins).
    const arbreIds = [...new Set(flagged.map((b) => b.id_arbre).filter((v): v is number => v != null))];
    const matches = arbreIds.length
        ? await prisma.book.findMany({ where: { source_access_id: { in: arbreIds } }, select: BOOK_SELECT })
        : [];
    const matchBySource = new Map<number, ReviewBook>();
    for (const m of matches) {
        if (m.source_access_id != null && !matchBySource.has(m.source_access_id)) {
            matchBySource.set(m.source_access_id, m);
        }
    }

    const pairs: ReviewPair[] = flagged.map((flaggedBook) => {
        const match = flaggedBook.id_arbre != null ? matchBySource.get(flaggedBook.id_arbre) ?? null : null;
        // A book never matches itself.
        return { flagged: flaggedBook, matched: match && match.id !== flaggedBook.id ? match : null };
    });

    return (
        <ReviewClient
            pairs={pairs}
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            queueTotal={searchWhere ? queueTotal : total}
            search={q}
        />
    );
}
