import { notFound } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import OrphansClient, {
    type OrphanRow,
    type SuggestedBook,
    type OrphanTab,
} from './orphans-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PER_PAGE = 10;

const TABS = ['a-traiter', 'rattaches', 'ecartes'] as const;

/**
 * The three states an orphaned folder can be in, as stored on the row:
 *
 *   à traiter  — nobody has decided anything yet
 *   rattachés  — resolvedAt + linkedBookId: a book now points at the folder
 *   écartés    — dismissedAt: junk, kept so the sync job stops re-queueing it
 */
const TAB_WHERE: Record<OrphanTab, Prisma.OrphanAudioFolderWhereInput> = {
    'a-traiter': { resolvedAt: null, dismissedAt: null },
    rattaches: { resolvedAt: { not: null } },
    ecartes: { dismissedAt: { not: null }, resolvedAt: null },
};

/**
 * Free-text filter. A bare number matches the folder number — that number is
 * what the permanent reads off the folder name and off the Access import, so it
 * is the natural thing to type.
 */
function buildSearchWhere(q: string): Prisma.OrphanAudioFolderWhereInput | undefined {
    const term = q.trim().replace(/^#/, '');
    if (!term) return undefined;

    const asNumber = Number(term);
    const isNumeric = Number.isInteger(asNumber) && asNumber > 0;

    return {
        OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { prefix: { contains: term, mode: 'insensitive' } },
            ...(isNumeric ? [{ folderNum: asNumber }] : []),
        ],
    };
}

/**
 * Case/accent-insensitive key used to match a folder title against a book title.
 * Mirrors scripts/audio-match-rules.ts `normalise` — including the apostrophe
 * family, because sync tools rewrite `l’abbé` as `l!abbé` on the way to the
 * bucket and the two must collapse onto the same string.
 */
function normalise(v: string): string {
    return v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’`!]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const bookSelect = {
    id: true,
    title: true,
    author: true,
    audio_filepath: true,
    audioLinkStatus: true,
    audioTrackCount: true,
    source_access_id: true,
} as const;

type BookRow = Prisma.BookGetPayload<{ select: typeof bookSelect }>;

const toSuggestion = (b: BookRow, reason: SuggestedBook['reason']): SuggestedBook => ({
    id: b.id,
    title: b.title,
    author: b.author,
    audioFilepath: b.audio_filepath,
    audioLinkStatus: b.audioLinkStatus,
    audioTrackCount: b.audioTrackCount,
    sourceAccessId: b.source_access_id,
    reason,
});

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AudioOrphansPage({ searchParams }: PageProps) {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) notFound();

    const params = await searchParams;
    const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]) || '';
    const rawTab = one('tab');
    const tab: OrphanTab = (TABS as readonly string[]).includes(rawTab)
        ? (rawTab as OrphanTab)
        : 'a-traiter';
    const page = Math.max(1, parseInt(one('page') || '1') || 1);
    const q = one('q');

    const searchWhere = buildSearchWhere(q);
    const where: Prisma.OrphanAudioFolderWhereInput = {
        ...TAB_WHERE[tab],
        ...(searchWhere ?? {}),
    };

    const [rows, total, counts] = await Promise.all([
        prisma.orphanAudioFolder.findMany({
            where,
            // Biggest folders first: a 700 Mo orphan is a whole book nobody can
            // reach, a 3 Mo one is usually a stray file.
            orderBy: [{ bytes: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * PER_PAGE,
            take: PER_PAGE,
            include: { linkedBook: { select: { id: true, title: true, author: true } } },
        }),
        prisma.orphanAudioFolder.count({ where }),
        Promise.all(
            TABS.map((t) => prisma.orphanAudioFolder.count({ where: TAB_WHERE[t] })),
        ),
    ]);

    // --- Suggestions --------------------------------------------------------
    // Two queries for the whole page rather than two per row.
    const nums = [...new Set(rows.map((r) => r.folderNum).filter((n): n is number => n != null))];
    const titles = [...new Set(rows.map((r) => r.title).filter(Boolean))];

    const [byNumber, byTitle] = await Promise.all([
        nums.length
            ? prisma.book.findMany({ where: { source_access_id: { in: nums } }, select: bookSelect })
            : Promise.resolve([]),
        titles.length
            ? prisma.book.findMany({
                  where: { OR: titles.map((t) => ({ title: { equals: t, mode: 'insensitive' as const } })) },
                  select: bookSelect,
                  take: 200,
              })
            : Promise.resolve([]),
    ]);

    const numberIndex = new Map<number, BookRow[]>();
    for (const b of byNumber) {
        if (b.source_access_id == null) continue;
        const list = numberIndex.get(b.source_access_id) ?? [];
        list.push(b);
        numberIndex.set(b.source_access_id, list);
    }

    const titleIndex = new Map<string, BookRow[]>();
    for (const b of byTitle) {
        const key = normalise(b.title);
        const list = titleIndex.get(key) ?? [];
        list.push(b);
        titleIndex.set(key, list);
    }

    const orphans: OrphanRow[] = rows.map((r) => {
        const seen = new Set<number>();
        const suggestions: SuggestedBook[] = [];

        // The folder number is the Access identifier, so a hit here is an
        // identity match, not a resemblance — always offered first.
        for (const b of r.folderNum != null ? (numberIndex.get(r.folderNum) ?? []) : []) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            suggestions.push(toSuggestion(b, 'numero'));
        }
        for (const b of titleIndex.get(normalise(r.title)) ?? []) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            suggestions.push(toSuggestion(b, 'titre'));
        }

        return {
            id: r.id,
            prefix: r.prefix,
            year: r.year,
            folderNum: r.folderNum,
            title: r.title,
            trackCount: r.trackCount,
            bytes: Number(r.bytes),
            firstSeenAt: r.firstSeenAt.toISOString(),
            lastSeenAt: r.lastSeenAt.toISOString(),
            resolvedAt: r.resolvedAt?.toISOString() ?? null,
            dismissedAt: r.dismissedAt?.toISOString() ?? null,
            note: r.note,
            linkedBook: r.linkedBook,
            suggestions,
        };
    });

    return (
        <OrphansClient
            orphans={orphans}
            tab={tab}
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            tabCounts={{ 'a-traiter': counts[0], rattaches: counts[1], ecartes: counts[2] }}
            search={q}
        />
    );
}
