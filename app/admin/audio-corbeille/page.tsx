import { notFound } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { AUDIO_TRASH_RETENTION_DAYS } from '@/lib/audio/purge';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { buildDeletedAudioSearchWhere } from '@/lib/search';
import TrashClient, { type TrashGroup, type TrashRow, type TrashTab } from './trash-client';
import { rescueEmptySearch, RESCUE_CANDIDATES } from '@/lib/search-rescue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Livres (groupes) par page, pas fichiers — voir le commentaire sur GROUP_BY.
const PER_PAGE = 25;

/** Un fichier à ce nombre de jours ou moins de sa purge est signalé en ambre. */
const URGENT_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * Ce qui identifie « le même livre » pour une ligne de corbeille : la fiche si
 * elle existe encore, sinon l'empreinte laissée par markTrashOrigin. Les trois
 * colonnes ensemble forment la clé de regroupement (voir son usage plus bas,
 * dans `AudioCorbeillePage`).
 */
const GROUP_BY: Prisma.DeletedAudioTrackScalarFieldEnum[] = ['bookId', 'originBookId', 'originBookTitle'];

function groupKey(row: { bookId: number | null; originBookId: number | null; originBookTitle: string | null }): string {
    return `${row.bookId ?? ''}|${row.originBookId ?? ''}|${row.originBookTitle ?? ''}`;
}

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

/**
 * Filtre libre : un nom de fichier, un titre de livre, un identifiant.
 *
 * Rendu au moteur commun (buildDeletedAudioSearchWhere) : tokens, apostrophes
 * et « # » s'y comportent comme dans toutes les autres barres. Le résultat est
 * une clause AND et non OR — c'est ce qui lui permet de se combiner avec le
 * filtre d'onglet au lieu de l'écraser.
 */
function buildSearchWhere(q: string): Prisma.DeletedAudioTrackWhereInput | undefined {
    const tokenClauses = buildDeletedAudioSearchWhere(q);
    return tokenClauses ? { AND: tokenClauses } : undefined;
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

    const whereFor = (term: string): Prisma.DeletedAudioTrackWhereInput => ({
        ...TAB_WHERE[tab],
        ...(buildSearchWhere(term) ?? {}),
    });
    const where = whereFor(q);
    const trashScopeWhere = (term: string, scope?: string): Prisma.DeletedAudioTrackWhereInput => ({
        ...TAB_WHERE[(TABS as readonly string[]).includes(scope ?? '') ? (scope as TrashTab) : tab],
        ...(buildSearchWhere(term) ?? {}),
    });

    const active = tab === 'a-purger' || tab === 'sans-fiche';
    const now = new Date();

    /**
     * Un livre supprimé en bloc peut laisser 60-80 lignes dans la corbeille —
     * les lister une par une noie les autres livres sous des doublons du même
     * dossier et éclate un seul livre sur plusieurs pages. La pagination porte
     * donc sur les LIVRES (groupés sur bookId/originBookId/originBookTitle,
     * seule combinaison qui identifie "le même livre" une fois la fiche
     * partie — voir GROUP_BY), pas sur les lignes : un `groupBy` choisit les
     * groupes de cette page et leur ordre, puis une seconde requête ramène
     * toutes les lignes de ces groupes-là pour le détail dépliable.
     *
     * La suppression la plus récente d'abord, dans tous les onglets : on ouvre
     * la corbeille pour rattraper une erreur qu'on vient de faire, et on la
     * cherche en haut. Les onglets actifs triaient autrefois du plus ancien au
     * plus récent (ce que la purge prendra en premier) ; cette urgence-là est
     * désormais portée par le bandeau `urgentCount` et le liseré ambre, plus
     * par l'ordre.
     */
    const [pageGroups, allGroups, counts, urgentCount] = await Promise.all([
        prisma.deletedAudioTrack.groupBy({
            by: GROUP_BY,
            where,
            orderBy: { _max: { deletedAt: 'desc' } },
            skip: pageSkip(page, PER_PAGE),
            take: PER_PAGE,
        }),
        // Compte des groupes distincts pour la pagination — une seule ligne
        // d'agrégats par livre, donc un résultat de la taille du nombre de
        // livres jamais passés par la corbeille, pas du nombre de fichiers.
        prisma.deletedAudioTrack.groupBy({ by: GROUP_BY, where }),
        Promise.all(TABS.map((t) => prisma.deletedAudioTrack.count({ where: TAB_WHERE[t] }))),
        // Ce que la purge prendra d'ici URGENT_DAYS jours, dans tout l'onglet —
        // pas seulement la page affichée, puisque le tri met ces fichiers-là en
        // fin de liste. Même seuil que `urgent` dans toTrashRow.
        active
            ? prisma.deletedAudioTrack.count({
                  where: {
                      ...TAB_WHERE[tab],
                      retainForever: false,
                      deletedAt: {
                          lte: new Date(
                              now.getTime() - (AUDIO_TRASH_RETENTION_DAYS - URGENT_DAYS) * DAY_MS,
                          ),
                      },
                  },
              })
            : Promise.resolve(0),
    ]);

    const rows = pageGroups.length
        ? await prisma.deletedAudioTrack.findMany({
              where: {
                  ...where,
                  OR: pageGroups.map((g) => ({
                      bookId: g.bookId,
                      originBookId: g.originBookId,
                      originBookTitle: g.originBookTitle,
                  })),
              },
              orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
              include: {
                  book: { select: { id: true, title: true } },
                  deletedBy: { select: { name: true, email: true } },
                  restoredBy: { select: { name: true, email: true } },
              },
          })
        : [];

    const toTrashRow = (r: (typeof rows)[number]): TrashRow => {
        const purgeEligibleAt = r.retainForever
            ? null
            : new Date(r.deletedAt.getTime() + AUDIO_TRASH_RETENTION_DAYS * DAY_MS);
        return {
            id: r.id,
            filename: r.filename,
            originalKey: r.originalKey,
            // BigInt ne survit pas à la sérialisation vers le client.
            sizeBytes: Number(r.sizeBytes),
            deletedAt: r.deletedAt.toISOString(),
            restoredAt: r.restoredAt?.toISOString() ?? null,
            purgedAt: r.purgedAt?.toISOString() ?? null,
            retainForever: r.retainForever,
            purgeEligibleAt: purgeEligibleAt?.toISOString() ?? null,
            // Calculé ici plutôt que dans le client : c'est le même seuil que le
            // compte `urgentCount`, et le bandeau ne doit pas dire autre chose que
            // les liserés.
            urgent:
                purgeEligibleAt !== null &&
                r.restoredAt === null &&
                r.purgedAt === null &&
                purgeEligibleAt.getTime() - now.getTime() <= URGENT_DAYS * DAY_MS,
            book: r.book,
            // L'empreinte laissée par markTrashOrigin : c'est tout ce qui reste du
            // livre quand sa fiche a été supprimée.
            originBookId: r.originBookId,
            originBookTitle: r.originBookTitle,
            deletedBy: r.deletedBy,
            restoredBy: r.restoredBy,
        };
    };

    const rowsByGroup = new Map<string, TrashRow[]>();
    for (const r of rows) {
        const key = groupKey(r);
        const list = rowsByGroup.get(key);
        if (list) list.push(toTrashRow(r));
        else rowsByGroup.set(key, [toTrashRow(r)]);
    }
    // Dans un livre, l'ordre des pistes et non celui des suppressions : une
    // suppression en bloc donne à 60-80 fichiers le même instant à la
    // milliseconde près, ce qui revenait à un ordre quelconque. Tri « naturel »
    // pour que « 2 » passe avant « 10 » ; à nom égal (un même fichier supprimé
    // deux fois), la suppression la plus récente d'abord, ordre de la requête.
    const byTrack = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
    for (const list of rowsByGroup.values()) {
        list.sort((a, b) => byTrack.compare(a.filename, b.filename));
    }

    const groups: TrashGroup[] = pageGroups.map((g) => {
        const key = groupKey(g);
        const groupRows = rowsByGroup.get(key) ?? [];
        return {
            key,
            book: groupRows.find((r) => r.book)?.book ?? null,
            originBookId: g.originBookId,
            originBookTitle: g.originBookTitle,
            rows: groupRows,
        };
    });

    const totalFiles = groups.reduce((sum, g) => sum + g.rows.length, 0);

    // Only when the search found nothing in this tab — see lib/search-suggest.ts.
    // Counted in files, not books: only « finds something or not » matters here.
    const searchSuggestions =
        allGroups.length === 0 && q
            ? await rescueEmptySearch({
                search: q,
                domains: ['trash', 'books'],
                // The other tabs: a file restored or already purged is not lost,
                // and « Trouvé dans « Restaurées » » says where it went.
                scopes: TABS.filter((t) => t !== tab).map((t) => ({ key: t, label: t })),
                count: (s) => prisma.deletedAudioTrack.count({ where: trashScopeWhere(s.query, s.scope) }),
                find: (s) =>
                    prisma.deletedAudioTrack.findMany({
                        where: trashScopeWhere(s.query, s.scope),
                        orderBy: { deletedAt: 'desc' },
                        take: RESCUE_CANDIDATES,
                        select: { id: true, filename: true, originBookTitle: true, book: { select: { title: true } } },
                    }),
                rankText: (t) => `${t.originBookTitle ?? t.book?.title ?? ''} ${t.filename}`,
                toRow: (t) => ({ id: t.id, title: t.originBookTitle ?? t.book?.title ?? 'Livre inconnu', detail: t.filename }),
            })
            : [];

    return (
        <TrashClient
            searchSuggestions={searchSuggestions}
            groups={groups}
            tab={tab}
            page={page}
            totalPages={Math.max(1, Math.ceil(allGroups.length / PER_PAGE))}
            totalGroups={allGroups.length}
            totalFiles={totalFiles}
            tabCounts={{
                'a-purger': counts[0],
                'sans-fiche': counts[1],
                restaurees: counts[2],
                purgees: counts[3],
            }}
            urgentCount={urgentCount}
            urgentDays={URGENT_DAYS}
            retentionDays={AUDIO_TRASH_RETENTION_DAYS}
            search={q}
        />
    );
}
