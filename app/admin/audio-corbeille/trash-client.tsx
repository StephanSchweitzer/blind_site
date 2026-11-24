'use client';

import { useEffect, useState, useTransition } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Loader2,
    RotateCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminSearchField } from '@/components/ui/admin/AdminSearchField';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { AideLink } from '@/components/ui/admin/AideLink';
import { AdminPageHeader } from "@/components/ui/admin/AdminPageHeader";
import { formatBytes, formatDate } from '../audio-orphelins/format';
import {
    purgeTrashedTracks,
    readTrashStorage,
    restoreTrashedGroup,
    restoreTrashedTrack,
    type ActionResult,
} from './actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { PageInfo } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';
import { getUserNameOnly, type UserNameParts } from '@/lib/users/displayName';

export type TrashTab = 'a-purger' | 'restaurees' | 'purgees';

export interface TrashRow {
    id: number;
    filename: string;
    originalKey: string;
    sizeBytes: number;
    deletedAt: string;
    restoredAt: string | null;
    purgedAt: string | null;
    retainForever: boolean;
    /** Quand la purge prendra ce fichier — null pour une ligne exemptée. */
    purgeEligibleAt: string | null;
    /** Purge imminente — calculé côté serveur, même seuil que `urgentCount`. */
    urgent: boolean;
    /**
     * La fiche, si la ligne existe encore — `deletedAt` posé quand elle a été
     * supprimée (soft delete) : elle reste alors ouvrable et restaurable.
     */
    book: TrashBook | null;
    /** Ce qu'il en reste sinon (markTrashOrigin, lib/audio/trash.ts). */
    originBookId: number | null;
    originBookTitle: string | null;
    deletedBy: { firstName: string | null; lastName: string | null; email: string | null } | null;
    restoredBy: { firstName: string | null; lastName: string | null; email: string | null } | null;
    /** Null pour la purge nocturne — voir purgeTrashNow (lib/audio/purge.ts). */
    purgedBy: { firstName: string | null; lastName: string | null; email: string | null } | null;
}

/**
 * Toutes les lignes de corbeille du même livre, dans le même onglet (donc au
 * même statut — voir la note dans page.tsx). Un livre supprimé en bloc peut en
 * tenir 60-80 : c'est ce groupe, pas la ligne individuelle, qui est l'unité de
 * pagination et d'affichage par défaut.
 */
/**
 * Pourquoi une ligne ne peut pas revenir, d'après le stockage (readTrashStorage) :
 * `occupied`, un fichier porte de nouveau son nom ; `missing`, sa copie de
 * corbeille a disparu. null : rien d'anormal, ou pas encore lu.
 */
export type RowStorage = 'occupied' | 'missing' | null;

export interface TrashBook {
    id: number;
    title: string;
    deletedAt: string | null;
}

export interface TrashGroup {
    key: string;
    book: TrashBook | null;
    originBookId: number | null;
    originBookTitle: string | null;
    rows: TrashRow[];
}

interface Props {
    groups: TrashGroup[];
    tab: TrashTab;
    /** Page courante, taille, total de livres — lib/pagination.ts `pageInfo`. */
    pagination: PageInfo;
    tabCounts: Record<TrashTab, number>;
    retentionDays: number;
    /** Fichiers de l'onglet que la purge prendra d'ici `urgentDays` jours. */
    urgentCount: number;
    urgentDays: number;
    /** `?purge=proche` : seuls les fichiers que compte le bandeau sont affichés. */
    urgentOnly: boolean;
    search: string;
    /** « Vouliez-vous dire … ? », computed only when the search found nothing. */
    searchSuggestions?: RescueSuggestion[];
}

const TAB_LABELS: Record<TrashTab, string> = {
    'a-purger': 'Dans la corbeille',
    restaurees: 'Restaurées',
    purgees: 'Purgées',
};

const personLabel = (p: UserNameParts | null) =>
    getUserNameOnly(p) || p?.email || 'inconnu';

/** Jours restants avant la purge — négatif veut dire « au prochain passage ». */
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/**
 * Ce qui va arriver à ce fichier, en une phrase. Reprend la règle de
 * lib/audio/purge.ts : une ligne antérieure à la mise en place de la purge est
 * exemptée pour toujours (`retainForever`), les autres partent au bout de
 * AUDIO_TRASH_RETENTION_DAYS jours.
 */
function retentionLabel(item: TrashRow): string {
    if (item.retainForever || !item.purgeEligibleAt) {
        return 'conservé indéfiniment (supprimé avant la mise en place de la purge)';
    }
    const left = daysUntil(item.purgeEligibleAt);
    if (left <= 0) return 'sera supprimé du stockage au prochain passage de la purge';
    return `supprimé du stockage dans ${left} jour${left > 1 ? 's' : ''}`;
}

/**
 * Quand et par qui les fichiers d'un livre ont été supprimés, en une ligne.
 * Une suppression en bloc tient en une date et une personne ; un livre vidé en
 * plusieurs fois montre l'intervalle plutôt que de choisir une date au hasard.
 */
function deletionSummary(rows: TrashRow[]): string {
    const days = [...new Set(rows.map((r) => formatDate(r.deletedAt)))];
    // Les lignes arrivent triées par piste, pas par date : extrêmes explicites.
    const times = rows.map((r) => r.deletedAt).sort();
    const when =
        days.length === 1
            ? `Supprimés le ${days[0]}`
            : `Supprimés entre le ${formatDate(times[0])} et le ${formatDate(times[times.length - 1])}`;
    const people = [...new Set(rows.map((r) => personLabel(r.deletedBy)))];
    const others = people.length - 1;
    const who =
        others === 0 ? people[0] : `${people[0]} et ${others} autre${others > 1 ? 's' : ''}`;
    return `${when} par ${who}`;
}

/**
 * Un fichier sans fiche ne retourne pas dans un livre : restaurer le remet
 * dans le stockage, où il ressort comme dossier orphelin (voir actions.ts).
 * Le dire avant le clic plutôt que laisser chercher où il est passé.
 */
function OrphanRestoreHint({ plural = false }: { plural?: boolean }) {
    return (
        <p className="text-xs text-muted-foreground">
            {plural ? 'seront restaurés' : 'sera restauré'} dans{' '}
            <IntentLink
                href="/admin/audio-orphelins"
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
            >
                Audio orphelin
            </IntentLink>
            , faute de fiche où le rattacher
        </p>
    );
}

/**
 * Une fiche supprimée qui existe encore (soft delete) : restaurer un fichier le
 * remet dans SON dossier, que plus rien ne montre tant que la fiche est
 * supprimée. Le chemin qui ramène le livre et ses fichiers ensemble, c'est la
 * restauration de la fiche — le dire avant le clic.
 */
function DeletedBookRestoreHint({ book, plural = false }: { book: TrashBook; plural?: boolean }) {
    return (
        <p className="text-xs text-muted-foreground">
            {plural ? 'reviendront' : 'reviendra'} dans le dossier de cette fiche supprimée, qui reste invisible
            tant qu’elle l’est. Pour retrouver le livre avec ses fichiers,{' '}
            <IntentLink
                href={`/admin/books?book=${book.id}`}
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
            >
                ouvrez la fiche
            </IntentLink>{' '}
            et cliquez sur « Restaurer » : sa fenêtre propose ces fichiers.
        </p>
    );
}

interface Identity {
    book: TrashBook | null;
    originBookId: number | null;
    originBookTitle: string | null;
}

/** À quel livre ces fichiers appartenaient — la fiche si elle existe encore
 *  (supprimée ou non), sinon l'empreinte laissée à la suppression, sinon rien. */
function BookIdentity({ book, originBookId, originBookTitle }: Identity) {
    if (book) {
        const link = (
            <IntentLink
                href={`/admin/books?book=${book.id}`}
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
            >
                « {book.title} » (#{book.id})
            </IntentLink>
        );
        return book.deletedAt ? (
            <span className="text-muted-foreground">
                fiche supprimée le {formatDate(book.deletedAt)} — {link}
            </span>
        ) : (
            link
        );
    }
    if (originBookTitle) {
        return (
            <span className="text-muted-foreground">
                fiche supprimée — « {originBookTitle} »
                {originBookId != null && ` (#${originBookId})`}
            </span>
        );
    }
    return <span className="text-muted-foreground">fiche supprimée — livre inconnu</span>;
}

/** Ce qu'un clic sur Restaurer fera de ces fichiers, quand ce n'est pas l'évidence. */
function RestoreDestinationHint({ book, plural = false }: { book: TrashBook | null; plural?: boolean }) {
    if (!book) return <OrphanRestoreHint plural={plural} />;
    if (book.deletedAt) return <DeletedBookRestoreHint book={book} plural={plural} />;
    return null;
}

export default function TrashClient({
    groups,
    tab,
    pagination,
    tabCounts,
    retentionDays,
    urgentCount,
    urgentDays,
    urgentOnly,
    search,
    searchSuggestions,
}: Props) {
    const router = useRouter();
    const confirm = useConfirm();
    const [searchTerm, setSearchTerm] = useState(search);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [restoringGroupKey, setRestoringGroupKey] = useState<string | null>(null);
    const [purgingId, setPurgingId] = useState<number | null>(null);
    const [purgingGroupKey, setPurgingGroupKey] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isNavPending, startNav] = useTransition();

    const busy = isPending || isNavPending;

    // Lu après l'affichage, une LIST par dossier : la page ne l'attend pas, et
    // tant que la réponse n'est pas là, rien n'est signalé (comme avant).
    const activeIdsKey = groups
        .flatMap((g) => g.rows)
        .filter((r) => !r.restoredAt && !r.purgedAt)
        .map((r) => r.id)
        .join(',');
    const [storage, setStorage] = useState<{ key: string; occupied: Set<number>; missing: Set<number> } | null>(
        null,
    );
    useEffect(() => {
        if (!activeIdsKey) return;
        let cancelled = false;
        readTrashStorage(activeIdsKey.split(',').map(Number))
            .then((res) => {
                if (cancelled || !res.ok) return;
                setStorage({ key: activeIdsKey, occupied: new Set(res.occupied), missing: new Set(res.copyMissing) });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [activeIdsKey]);
    const storageOf = (id: number): RowStorage => {
        if (!storage || storage.key !== activeIdsKey) return null;
        if (storage.missing.has(id)) return 'missing';
        return storage.occupied.has(id) ? 'occupied' : null;
    };

    /**
     * La requête elle-même a échoué — délai de la page dépassé, connexion
     * coupée. L'action, elle, attrape ses propres erreurs ; ce qui arrive ici
     * n'a jamais reçu de réponse, et une promesse rejetée dans la transition
     * partait à la page d'erreur, le bouton figé. Ce qui a été fait reste
     * inconnu : on le dit, et on relit la liste.
     */
    const transportFailure = (done?: string) => {
        toast({
            variant: 'destructive',
            duration: Infinity,
            title: 'Connexion interrompue',
            description:
                (done ? `${done} ` : '') +
                'La réponse n’est pas arrivée : l’action a pu aboutir en tout ou en partie. La liste vient ' +
                'd’être relue — vérifiez-la avant de recommencer.',
        });
        router.refresh();
    };

    const run = (id: number, fn: () => Promise<ActionResult>) => {
        setRestoringId(id);
        startTransition(async () => {
            try {
                const res = await fn();
                // Le message de l'action dit déjà ce qui s'est passé : il fait le titre.
                toast({
                    title: res.message,
                    variant: res.ok ? undefined : 'destructive',
                });
                if (res.ok) router.refresh();
            } catch {
                transportFailure();
            } finally {
                setRestoringId(null);
            }
        });
    };

    const runGroup = (key: string, trashIds: number[]) => {
        setRestoringGroupKey(key);
        startTransition(async () => {
            // Un gros groupe revient en plusieurs appels : chacun rend ce qu'il
            // n'a pas commencé (remainingIds) et ce qu'il a déjà fait (carry).
            // Entre deux appels, un message dit où on en est : le bouton seul
            // tournait sans rien dire pendant des dizaines de secondes.
            let progress: ReturnType<typeof toast> | null = null;
            // Ce que les appels précédents ont déjà ramené, pour le dire si le
            // suivant n'aboutit pas.
            let restoredSoFar = 0;
            try {
                let res = await restoreTrashedGroup(trashIds);
                while (res.remainingIds?.length && res.carry) {
                    const done = res.carry.restored;
                    restoredSoFar = done;
                    const title = `${done} fichier${done > 1 ? 's' : ''} sur ${trashIds.length} restauré${done > 1 ? 's' : ''}…`;
                    if (progress) progress.update({ id: progress.id, title, duration: Infinity });
                    else progress = toast({ title, duration: Infinity });
                    res = await restoreTrashedGroup(res.remainingIds, res.carry);
                }
                progress?.dismiss();
                toast({
                    title: res.message,
                    variant: res.ok ? undefined : 'destructive',
                });
                if (res.ok) router.refresh();
            } catch {
                progress?.dismiss();
                transportFailure(
                    restoredSoFar
                        ? `${restoredSoFar} fichier${restoredSoFar > 1 ? 's' : ''} déjà restauré${restoredSoFar > 1 ? 's' : ''} avant l’interruption.`
                        : undefined,
                );
            } finally {
                setRestoringGroupKey(null);
            }
        });
    };

    /**
     * Supprimer définitivement, après confirmation. Contrairement au reste de
     * cet écran, il n'y a pas de retour en arrière : c'est souvent l'unique
     * copie de l'enregistrement.
     */
    const runPurge = async (
        trashIds: number[],
        target: { id: number } | { groupKey: string },
        what: string,
    ) => {
        const many = trashIds.length > 1;
        const ok = await confirm({
            title: many
                ? `Supprimer définitivement ces ${trashIds.length} fichiers ?`
                : 'Supprimer définitivement ce fichier ?',
            description:
                `${what}\n\n` +
                `${many ? 'Ils seront effacés' : 'Il sera effacé'} du stockage tout de suite, sans ` +
                'attendre la purge automatique. Cette action est irréversible : ' +
                (many ? 'ces fichiers ne pourront plus être restaurés.' : 'ce fichier ne pourra plus être restauré.'),
            confirmLabel: 'Supprimer définitivement',
            destructive: true,
            // Plusieurs fichiers — souvent tout un livre, et sa seule copie :
            // un clic de confirmation ne suffit plus. La suppression réversible
            // de l'éditeur audio demandait déjà de taper le nombre ; l'effacement
            // irréversible n'en demandait pas.
            ...(many
                ? {
                      requireText: {
                          label: (
                              <>
                                  Pour confirmer, tapez le nombre de fichiers :{' '}
                                  <span className="font-semibold">{trashIds.length}</span>
                              </>
                          ),
                          value: String(trashIds.length),
                      },
                  }
                : {}),
        });
        if (!ok) return;

        if ('id' in target) setPurgingId(target.id);
        else setPurgingGroupKey(target.groupKey);
        startTransition(async () => {
            try {
                const res = await purgeTrashedTracks(trashIds);
                toast({
                    title: res.message,
                    variant: res.ok ? undefined : 'destructive',
                });
                // Même en échec : une partie a pu partir, ou quelqu'un d'autre a
                // restauré entre-temps.
                router.refresh();
            } catch {
                transportFailure();
            } finally {
                setPurgingId(null);
                setPurgingGroupKey(null);
            }
        });
    };

    const purgeOne = (item: TrashRow) => {
        if (storageOf(item.id) === 'missing') {
            void retireMissing(item);
            return;
        }
        void runPurge([item.id], { id: item.id }, `« ${item.filename} » (${formatBytes(item.sizeBytes)})`);
    };

    /**
     * Une ligne dont la copie a disparu : rien à effacer, seulement à ranger.
     * Même action que « Supprimer définitivement » (la suppression d'une clé
     * absente réussit), sans l'avertissement d'irréversibilité, qui n'a plus
     * d'objet.
     */
    const retireMissing = async (item: TrashRow) => {
        const ok = await confirm({
            title: 'Retirer ce fichier de la corbeille ?',
            description:
                `La copie de sauvegarde de « ${item.filename} » n’est plus dans le stockage : ce fichier ne ` +
                'peut plus être restauré.\n\nLa ligne passe dans l’onglet « Purgées ». Rien d’autre n’est effacé.',
            confirmLabel: 'Retirer de la corbeille',
        });
        if (!ok) return;
        setPurgingId(item.id);
        startTransition(async () => {
            try {
                const res = await purgeTrashedTracks([item.id]);
                toast({
                    title: res.ok ? 'Retiré de la corbeille.' : res.message,
                    variant: res.ok ? undefined : 'destructive',
                });
                router.refresh();
            } catch {
                transportFailure();
            } finally {
                setPurgingId(null);
            }
        });
    };

    const purgeGroup = (group: TrashGroup, trashIds: number[]) => {
        const size = group.rows
            .filter((r) => trashIds.includes(r.id))
            .reduce((sum, r) => sum + r.sizeBytes, 0);
        const title = group.book?.title ?? group.originBookTitle;
        void runPurge(
            trashIds,
            { groupKey: group.key },
            `${trashIds.length} fichier${trashIds.length > 1 ? 's' : ''} (${formatBytes(size)})` +
                (title ? ` du livre « ${title} »` : ''),
        );
    };

    const navigate = (mutate: (sp: URLSearchParams) => void) => {
        const sp = new URLSearchParams(window.location.search);
        mutate(sp);
        startNav(() => router.push(`/admin/audio-corbeille?${sp.toString()}`));
    };

    // Barre de pages : un clic simple navigue dans la transition de navigation.
    const goHref = (href: string) => startNav(() => router.push(href, { scroll: false }));

    const selectTab = (t: TrashTab) =>
        navigate((sp) => {
            sp.set('tab', t);
            sp.delete('page');
            sp.delete('purge');
        });

    const showUrgentOnly = (on: boolean) =>
        navigate((sp) => {
            if (on) sp.set('purge', 'proche');
            else sp.delete('purge');
            sp.delete('page');
        });

    const runSearch = (term: string) =>
        navigate((sp) => {
            if (term.trim()) sp.set('q', term.trim());
            else sp.delete('q');
            sp.delete('page');
        });

    const toggle = (key: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="space-y-4 border-b border-border">
                    <AdminPageHeader
                        title="Corbeille audio"
                        section="Corbeille audio"
                        aide={<AideLink section="corbeille-audio" />}
                        description={<>
                            Les fichiers audio supprimés restent restaurables {retentionDays} jours, puis
                            sont effacés définitivement.
                        </>}
                    />

                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(TAB_LABELS) as TrashTab[]).map((t) => (
                            <Button
                                key={t}
                                type="button"
                                size="sm"
                                variant={tab === t ? 'default' : 'outline'}
                                disabled={busy}
                                onClick={() => selectTab(t)}
                            >
                                {TAB_LABELS[t]} ({tabCounts[t]})
                            </Button>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <AdminSearchField
                            id="trash-search"
                            label="Rechercher dans la corbeille audio"
                            placeholder="Rechercher un fichier, un titre de livre ou un identifiant…"
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') runSearch(searchTerm);
                            }}
                            onClear={() => {
                                setSearchTerm('');
                                runSearch('');
                            }}
                            disabled={busy}
                        />
                        <Button variant="outline" disabled={busy} onClick={() => runSearch(searchTerm)}>
                            Rechercher
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Le tri met les suppressions les plus anciennes — celles que la
                purge prendra d'abord — en fin de liste, parfois sur la dernière
                page : ce bandeau les empêche de partir sans que personne ne les
                voie, et son lien les affiche seules, la plus proche de sa purge
                d'abord. Compté sur tout l'onglet, indépendamment de la recherche. */}
            {urgentCount > 0 && (
                <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                    <p className="flex-1">
                        {urgentCount === 1
                            ? '1 fichier de cet onglet sera supprimé'
                            : `${urgentCount} fichiers de cet onglet seront supprimés`}{' '}
                        définitivement dans les {urgentDays} prochains jours
                        {urgentOnly ? ' — seuls ceux-là sont affichés, le plus proche de sa purge d’abord.' : '.'}
                    </p>
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={busy}
                        onClick={() => showUrgentOnly(!urgentOnly)}
                        className="h-auto p-0 text-amber-800 underline underline-offset-2 dark:text-amber-300"
                    >
                        {urgentOnly ? 'Tout afficher' : urgentCount === 1 ? 'Afficher ce fichier' : 'Afficher ces fichiers'}
                    </Button>
                </div>
            )}

            <AdminPaginatedList
                info={pagination}
                noun={{ one: 'livre', many: 'livres' }}
                label="Pages de la corbeille"
                onNavigate={goHref}
                pending={isNavPending}
            >
            <div className="space-y-4">
            {groups.length === 0 && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        {search
                            ? `Aucun fichier ne correspond à « ${search} ».`
                            : 'Aucun fichier dans cet onglet.'}
                        <SearchRescue
                            suggestions={searchSuggestions}
                            unit={{ one: 'fichier', many: 'fichiers' }}
                            scopeLabel={(t) => TAB_LABELS[t as TrashTab] ?? t}
                            onApply={(s) => {
                                setSearchTerm(s.query);
                                navigate((sp) => {
                                    sp.set('q', s.query);
                                    if (s.scope) sp.set('tab', s.scope);
                                    sp.delete('page');
                                });
                            }}
                        />
                    </CardContent>
                </Card>
            )}

            {groups.map((group) =>
                group.rows.length === 1 ? (
                    <FileCard
                        key={group.key}
                        item={group.rows[0]}
                        storage={storageOf(group.rows[0].id)}
                        restoringId={restoringId}
                        purgingId={purgingId}
                        busy={busy}
                        onRestore={(id) => run(id, () => restoreTrashedTrack(id))}
                        onPurge={purgeOne}
                    />
                ) : (
                    <GroupCard
                        key={group.key}
                        group={group}
                        isOpen={expanded.has(group.key)}
                        onToggle={() => toggle(group.key)}
                        restoringId={restoringId}
                        purgingId={purgingId}
                        isRestoringGroup={restoringGroupKey === group.key}
                        isPurgingGroup={purgingGroupKey === group.key}
                        storageOf={storageOf}
                        busy={busy}
                        onRestore={(id) => run(id, () => restoreTrashedTrack(id))}
                        onPurge={purgeOne}
                        onRestoreGroup={(ids) => runGroup(group.key, ids)}
                        onPurgeGroup={(ids) => purgeGroup(group, ids)}
                    />
                ),
            )}

            </div>
            </AdminPaginatedList>
        </div>
    );
}

interface FileRowProps {
    item: TrashRow;
    storage: RowStorage;
    restoringId: number | null;
    purgingId: number | null;
    busy: boolean;
    onRestore: (id: number) => void;
    onPurge: (item: TrashRow) => void;
}

interface FileRowBodyProps extends FileRowProps {
    /** Dans un groupe déplié, la carte du livre porte déjà la mention. */
    hideOrphanHint?: boolean;
}

/** Le corps d'une ligne de corbeille : détails du fichier + boutons Restaurer
 *  et Supprimer définitivement. */
const STORAGE_NOTE: Record<Exclude<RowStorage, null>, string> = {
    occupied:
        'Un fichier du dossier porte aujourd’hui ce nom — souvent la nouvelle version qui l’a remplacé. ' +
        'Pour restaurer celui-ci, renommez ou supprimez d’abord ce fichier depuis l’éditeur audio du livre.',
    missing:
        'La copie de sauvegarde n’est plus dans le stockage : ce fichier ne peut plus être restauré. ' +
        '« Retirer de la corbeille » range la ligne dans « Purgées ».',
};

function FileRowBody({
    item,
    storage,
    restoringId,
    purgingId,
    busy,
    onRestore,
    onPurge,
    hideOrphanHint,
}: FileRowBodyProps) {
    const noteId = `trash-storage-${item.id}`;
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
                <p className="font-mono text-sm text-foreground break-all">{item.filename}</p>
                <p className="text-sm text-foreground">
                    Supprimé le {formatDate(item.deletedAt)} par {personLabel(item.deletedBy)}
                    <span className="text-xs text-muted-foreground"> · {formatBytes(item.sizeBytes)}</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground break-all">{item.originalKey}</p>

                {item.restoredAt ? (
                    <p className="text-xs text-muted-foreground">
                        restauré le {formatDate(item.restoredAt)} par {personLabel(item.restoredBy)}
                    </p>
                ) : item.purgedAt ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                        supprimé définitivement du stockage le {formatDate(item.purgedAt)}
                        {item.purgedBy ? ` par ${personLabel(item.purgedBy)}` : ' par la purge automatique'}
                    </p>
                ) : (
                    <>
                        <p
                            className={
                                item.urgent
                                    ? 'flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300'
                                    : 'text-xs text-muted-foreground'
                            }
                        >
                            {item.urgent && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                            {retentionLabel(item)}
                        </p>
                        {storage ? (
                            <p id={noteId} className="text-xs text-amber-700 dark:text-amber-300">
                                {STORAGE_NOTE[storage]}
                            </p>
                        ) : (
                            !hideOrphanHint && <RestoreDestinationHint book={item.book} />
                        )}
                    </>
                )}
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-2">
                {item.restoredAt ? (
                    <span className="text-xs text-muted-foreground">Restauré</span>
                ) : item.purgedAt ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Purgé
                    </span>
                ) : (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || storage !== null}
                            aria-describedby={storage ? noteId : undefined}
                            onClick={() => onRestore(item.id)}
                        >
                            {restoringId === item.id ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Restauration…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" /> Restaurer
                                </span>
                            )}
                        </Button>
                        <PurgeButton
                            busy={busy}
                            pending={purgingId === item.id}
                            onClick={() => onPurge(item)}
                            {...(storage === 'missing' ? { label: 'Retirer de la corbeille' } : {})}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

/** En rouge et sans contour : le geste irréversible ne doit pas ressembler à
 *  Restaurer, juste au-dessus. */
function PurgeButton({
    busy,
    pending,
    onClick,
    label = 'Supprimer définitivement',
}: {
    busy: boolean;
    pending: boolean;
    onClick: () => void;
    label?: string;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onClick}
            className="text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
            {pending ? (
                <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Suppression…
                </span>
            ) : (
                <span className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4" aria-hidden /> {label}
                </span>
            )}
        </Button>
    );
}

/** Un livre qui n'a qu'un seul fichier en corbeille : pas de dépliant, c'est
 *  déjà toute l'information — livre compris. La carte ne le nommait pas : il
 *  fallait le deviner à la clé du fichier. */
function FileCard(props: FileRowProps) {
    const { item } = props;
    return (
        <Card>
            <CardContent className="space-y-2 py-4">
                <p className="text-sm text-foreground">
                    <BookIdentity
                        book={item.book}
                        originBookId={item.originBookId}
                        originBookTitle={item.originBookTitle}
                    />
                </p>
                <FileRowBody {...props} />
            </CardContent>
        </Card>
    );
}

interface GroupCardProps {
    group: TrashGroup;
    isOpen: boolean;
    onToggle: () => void;
    restoringId: number | null;
    purgingId: number | null;
    isRestoringGroup: boolean;
    isPurgingGroup: boolean;
    storageOf: (id: number) => RowStorage;
    busy: boolean;
    onRestore: (id: number) => void;
    onPurge: (item: TrashRow) => void;
    onRestoreGroup: (trashIds: number[]) => void;
    onPurgeGroup: (trashIds: number[]) => void;
}

/**
 * Un livre avec plusieurs fichiers en corbeille — le cas d'une suppression en
 * bloc, jusqu'à 60-80 pistes vues dans le corpus. Replié par défaut : seul le
 * résumé (nombre de fichiers, poids total, échéance la plus proche) s'affiche
 * tant qu'on ne déplie pas, pour ne pas noyer les autres livres de la page
 * sous les fichiers d'un seul.
 */
function GroupCard({
    group,
    isOpen,
    onToggle,
    restoringId,
    purgingId,
    isRestoringGroup,
    isPurgingGroup,
    storageOf,
    busy,
    onRestore,
    onPurge,
    onRestoreGroup,
    onPurgeGroup,
}: GroupCardProps) {
    const { rows } = group;
    const totalSize = rows.reduce((sum, r) => sum + r.sizeBytes, 0);
    const anyUrgent = rows.some((r) => r.urgent);
    const allRestored = rows.every((r) => r.restoredAt !== null);
    const allPurged = rows.every((r) => r.purgedAt !== null);
    // Un groupe n'est restaurable en bloc que dans les onglets actifs — même
    // condition que le bouton Restaurer par fichier ci-dessous, appliquée à
    // l'ensemble du groupe plutôt qu'à une ligne.
    // « Restaurer tout » laisse de côté ce que le stockage dit irrécupérable
    // (storageOf) ; « Tout supprimer définitivement » prend tout ce qui est
    // encore en corbeille.
    const activeIds = rows.filter((r) => !r.restoredAt && !r.purgedAt).map((r) => r.id);
    const restorableIds = activeIds.filter((id) => storageOf(id) === null);
    const occupiedCount = activeIds.filter((id) => storageOf(id) === 'occupied').length;
    const missingCount = activeIds.filter((id) => storageOf(id) === 'missing').length;

    // La ligne la plus proche de sa purge résume l'urgence du groupe entier.
    const eligible = rows
        .filter((r) => !r.retainForever && r.purgeEligibleAt && !r.restoredAt && !r.purgedAt)
        .map((r) => r.purgeEligibleAt as string)
        .sort();
    const soonestPurgeEligible = eligible[0];
    // Un livre vidé d'un coup : tous partent le même jour. « Le plus ancien »
    // y désignait un fichier que rien ne distinguait des autres.
    const leaveTogether =
        eligible.length === rows.length &&
        daysUntil(eligible[0]) === daysUntil(eligible[eligible.length - 1]);

    let statusLine: string;
    if (allRestored) {
        statusLine = `${rows.length} fichiers restaurés`;
    } else if (allPurged) {
        statusLine = `${rows.length} fichiers supprimés définitivement du stockage`;
    } else if (soonestPurgeEligible) {
        const left = daysUntil(soonestPurgeEligible);
        statusLine = leaveTogether
            ? left <= 0
                ? 'seront supprimés du stockage au prochain passage de la purge'
                : `seront supprimés du stockage dans ${left} jour${left > 1 ? 's' : ''}`
            : left <= 0
              ? 'le plus ancien sera supprimé du stockage au prochain passage de la purge'
              : `le plus ancien part dans ${left} jour${left > 1 ? 's' : ''}`;
    } else {
        statusLine = 'conservés indéfiniment (supprimés avant la mise en place de la purge)';
    }

    return (
        <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-foreground">
                        <BookIdentity
                            book={group.book}
                            originBookId={group.originBookId}
                            originBookTitle={group.originBookTitle}
                        />
                    </p>
                    <p className="text-sm text-foreground">
                        {deletionSummary(rows)}
                        <span className="text-xs text-muted-foreground">
                            {' '}
                            · {rows.length} fichiers · {formatBytes(totalSize)}
                        </span>
                    </p>
                    <p
                        className={
                            anyUrgent
                                ? 'flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300'
                                : 'text-xs text-muted-foreground'
                        }
                    >
                        {anyUrgent && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                        {statusLine}
                    </p>
                    {restorableIds.length > 0 && <RestoreDestinationHint book={group.book} plural />}
                    {(occupiedCount > 0 || missingCount > 0) && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            {occupiedCount > 0 &&
                                `${occupiedCount} fichier${occupiedCount > 1 ? 's' : ''} ne ${occupiedCount > 1 ? 'peuvent' : 'peut'} pas revenir : ` +
                                    `un fichier du dossier porte de nouveau ${occupiedCount > 1 ? 'leur' : 'son'} nom. `}
                            {missingCount > 0 &&
                                `${missingCount} copie${missingCount > 1 ? 's' : ''} de sauvegarde ${missingCount > 1 ? 'ne sont' : 'n’est'} plus dans le stockage. `}
                            {restorableIds.length > 0 && '« Restaurer tout » les laisse de côté. '}
                            Dépliez pour le détail.
                        </p>
                    )}
                </div>

                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    {restorableIds.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRestoreGroup(restorableIds)}
                        >
                            {isRestoringGroup ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Restauration…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" /> Restaurer tout
                                </span>
                            )}
                        </Button>
                    )}
                    {activeIds.length > 0 && (
                        <PurgeButton
                            busy={busy}
                            pending={isPurgingGroup}
                            onClick={() => onPurgeGroup(activeIds)}
                            label="Tout supprimer définitivement"
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={onToggle}
                        className="text-xs text-muted-foreground"
                    >
                        {isOpen ? (
                            <>
                                Réduire <ChevronUp className="h-4 w-4" aria-hidden />
                            </>
                        ) : (
                            <>
                                Voir les fichiers <ChevronDown className="h-4 w-4" aria-hidden />
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>

            {isOpen && (
                <CardContent className="space-y-3 border-t pt-4">
                    {rows.map((item) => (
                        <div key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                            <FileRowBody
                                item={item}
                                storage={storageOf(item.id)}
                                restoringId={restoringId}
                                purgingId={purgingId}
                                busy={busy}
                                onRestore={onRestore}
                                onPurge={onPurge}
                                hideOrphanHint
                            />
                        </div>
                    ))}
                </CardContent>
            )}
        </Card>
    );
}
