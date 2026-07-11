import { notFound } from 'next/navigation';
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
    source_access_id: true,
    needsReview: true,
    id_arbre: true,
} as const;

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminReviewPage({ searchParams }: PageProps) {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) notFound();

    const params = await searchParams;
    const page = Math.max(1, parseInt((Array.isArray(params.page) ? params.page[0] : params.page) || '1') || 1);

    const [flagged, total] = await Promise.all([
        prisma.book.findMany({
            where: { needsReview: true },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * PER_PAGE,
            take: PER_PAGE,
            select: BOOK_SELECT,
        }),
        prisma.book.count({ where: { needsReview: true } }),
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
        />
    );
}
