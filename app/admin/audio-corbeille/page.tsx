import { notFound } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { AUDIO_TRASH_RETENTION_DAYS } from '@/lib/audio/purge';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import TrashClient, { type TrashRow, type TrashTab } from './trash-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PER_PAGE = 25;

/**
 * La corbeille audio de TOUT le corpus.
 *
 * POURQUOI CET ÉCRAN EXISTE
 *
 * La corbeille ne se lisait que livre par livre, depuis l'éditeur audio — donc
 * uniquement pour un livre qui existe encore. Or `DeletedAudioTrack.bookId` est
 * `onDelete: SetNull` : dès que la fiche partait, ses lignes de corbeille
 * n'apparaissaient plus nulle part, alors que la purge nocturne
 * (lib/audio/purge.ts) effaçait l'objet pour de bon 14 jours plus tard sans
 * regarder ce null. Un enregistrement qui est souvent l'unique copie disparaissait
 * ainsi sans que personne ne puisse le voir partir.
 *
 * Deux colonnes le réparent côté données (`originBookId` / `originBookTitle`,
 * écrites par markTrashOrigin au moment de la suppression) ; cet écran est la
 * moitié qui se regarde. Il répond aussi à une question que rien ne posait
 * jusqu'ici : QU'EST-CE QUI VA ÊTRE PURGÉ dans les prochains jours.
 */
const TABS = ['a-purger', 'sans-fiche', 'restaurees', 'purgees'] as const;

/**
 * Une ligne « vivante » : le fichier est dans la corbeille, ni restauré, ni
 * purgé. C'est la seule population sur laquelle « Restaurer » a un sens.
 */
const ACTIVE: Prisma.DeletedAudioTrackWhereInput = { restoredAt: null, purgedAt: null };

const TAB_WHERE: Record<TrashTab, Prisma.DeletedAudioTrackWhereInput> = {
    'a-purger': ACTIVE,
    // La fiche a disparu : ces lignes étaient invisibles de partout.
    'sans-fiche': { ...ACTIVE, bookId: null },
    restaurees: { restoredAt: { not: null } },
    purgees: { purgedAt: { not: null } },
};

/** Filtre libre : un nom de fichier, un titre de livre, un identifiant. */
function buildSearchWhere(q: string): Prisma.DeletedAudioTrackWhereInput | undefined {
    const term = q.trim().replace(/^#/, '');
    if (!term) return undefined;

    const asNumber = Number(term);
    const isNumeric = Number.isInteger(asNumber) && asNumber > 0;

    return {
        OR: [
            { filename: { contains: term, mode: 'insensitive' } },
            { originalKey: { contains: term, mode: 'insensitive' } },
            { originBookTitle: { contains: term, mode: 'insensitive' } },
            { book: { title: { contains: term, mode: 'insensitive' } } },
            ...(isNumeric ? [{ originBookId: asNumber }, { bookId: asNumber }] : []),
        ],
    };
}

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AudioCorbeillePage({ searchParams }: PageProps) {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) notFound();

    const params = await searchParams;
    const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]) || '';
    const rawTab = one('tab');
    const tab: TrashTab = (TABS as readonly string[]).includes(rawTab)
        ? (rawTab as TrashTab)
        : 'a-purger';
    const page = parsePageParam(one('page'));
    const q = one('q');

    const searchWhere = buildSearchWhere(q);
    const where: Prisma.DeletedAudioTrackWhereInput = {
        ...TAB_WHERE[tab],
        ...(searchWhere ?? {}),
    };

    const [rows, total, counts] = await Promise.all([
        prisma.deletedAudioTrack.findMany({
            where,
            // La plus ancienne suppression d'abord dans les onglets actifs :
            // c'est celle que la purge prendra la première.
            orderBy: tab === 'a-purger' || tab === 'sans-fiche'
                ? [{ deletedAt: 'asc' }, { id: 'asc' }]
                : [{ deletedAt: 'desc' }, { id: 'desc' }],
            skip: pageSkip(page, PER_PAGE),
            take: PER_PAGE,
            include: {
                book: { select: { id: true, title: true } },
                deletedBy: { select: { name: true, email: true } },
                restoredBy: { select: { name: true, email: true } },
            },
        }),
        prisma.deletedAudioTrack.count({ where }),
        Promise.all(TABS.map((t) => prisma.deletedAudioTrack.count({ where: TAB_WHERE[t] }))),
    ]);

    const items: TrashRow[] = rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        originalKey: r.originalKey,
        // BigInt ne survit pas à la sérialisation vers le client.
        sizeBytes: Number(r.sizeBytes),
        deletedAt: r.deletedAt.toISOString(),
        restoredAt: r.restoredAt?.toISOString() ?? null,
        purgedAt: r.purgedAt?.toISOString() ?? null,
        retainForever: r.retainForever,
        purgeEligibleAt: r.retainForever
            ? null
            : new Date(
                  r.deletedAt.getTime() + AUDIO_TRASH_RETENTION_DAYS * 86_400_000,
              ).toISOString(),
        book: r.book,
        // L'empreinte laissée par markTrashOrigin : c'est tout ce qui reste du
        // livre quand sa fiche a été supprimée.
        originBookId: r.originBookId,
        originBookTitle: r.originBookTitle,
        deletedBy: r.deletedBy,
        restoredBy: r.restoredBy,
    }));

    return (
        <TrashClient
            items={items}
            tab={tab}
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            tabCounts={{
                'a-purger': counts[0],
                'sans-fiche': counts[1],
                restaurees: counts[2],
                purgees: counts[3],
            }}
            retentionDays={AUDIO_TRASH_RETENTION_DAYS}
            search={q}
        />
    );
}
