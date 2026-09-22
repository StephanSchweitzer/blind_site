'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Loader2,
    RotateCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { AideLink } from '@/components/ui/admin/AideLink';
import { formatBytes, formatDate } from '../audio-orphelins/format';
import { restoreTrashedGroup, restoreTrashedTrack, type ActionResult } from './actions';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';

export type TrashTab = 'a-purger' | 'sans-fiche' | 'restaurees' | 'purgees';

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
    /** Le livre, s'il existe encore. */
    book: { id: number; title: string } | null;
    /** Ce qu'il en reste sinon (markTrashOrigin, lib/audio/trash.ts). */
    originBookId: number | null;
    originBookTitle: string | null;
    deletedBy: { name: string | null; email: string | null } | null;
    restoredBy: { name: string | null; email: string | null } | null;
}

/**
 * Toutes les lignes de corbeille du même livre, dans le même onglet (donc au
 * même statut — voir la note dans page.tsx). Un livre supprimé en bloc peut en
 * tenir 60-80 : c'est ce groupe, pas la ligne individuelle, qui est l'unité de
 * pagination et d'affichage par défaut.
 */
export interface TrashGroup {
    key: string;
    book: { id: number; title: string } | null;
    originBookId: number | null;
    originBookTitle: string | null;
    rows: TrashRow[];
}

interface Props {
    groups: TrashGroup[];
    tab: TrashTab;
    page: number;
    totalPages: number;
    totalGroups: number;
    totalFiles: number;
    tabCounts: Record<TrashTab, number>;
    retentionDays: number;
    /** Fichiers de l'onglet que la purge prendra d'ici `urgentDays` jours. */
    urgentCount: number;
    urgentDays: number;
    search: string;
    /** « Vouliez-vous dire … ? », computed only when the search found nothing. */
    searchSuggestions?: RescueSuggestion[];
}

const TAB_LABELS: Record<TrashTab, string> = {
    'a-purger': 'Dans la corbeille',
    'sans-fiche': 'Sans fiche',
    restaurees: 'Restaurées',
    purgees: 'Purgées',
};

const personLabel = (p: { name: string | null; email: string | null } | null) =>
    p?.name || p?.email || 'inconnu';

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
            <Link
                href="/admin/audio-orphelins"
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
            >
                Audio orphelin
            </Link>
            , faute de fiche où le rattacher
        </p>
    );
}

/** À quel livre ce groupe appartenait — la fiche si elle existe encore, sinon
 *  l'empreinte laissée à la suppression, sinon rien du tout. */
function BookIdentity({ group }: { group: TrashGroup }) {
    if (group.book) {
        return (
            <Link
                href={`/admin/books?book=${group.book.id}`}
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
            >
                « {group.book.title} » (#{group.book.id})
            </Link>
        );
    }
    if (group.originBookTitle) {
        return (
            <span className="text-muted-foreground">
                fiche supprimée — « {group.originBookTitle} »
                {group.originBookId != null && ` (#${group.originBookId})`}
            </span>
        );
    }
    return <span className="text-muted-foreground">fiche supprimée — livre inconnu</span>;
}

export default function TrashClient({
    groups,
    tab,
    page,
    totalPages,
    totalGroups,
    totalFiles,
    tabCounts,
    retentionDays,
    urgentCount,
    urgentDays,
    search,
    searchSuggestions,
}: Props) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState(search);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [restoringGroupKey, setRestoringGroupKey] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isNavPending, startNav] = useTransition();

    const busy = isPending || isNavPending;

    const run = (id: number, fn: () => Promise<ActionResult>) => {
        setRestoringId(id);
        startTransition(async () => {
            const res = await fn();
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            setRestoringId(null);
            if (res.ok) router.refresh();
        });
    };

    const runGroup = (key: string, trashIds: number[]) => {
        setRestoringGroupKey(key);
        startTransition(async () => {
            const res = await restoreTrashedGroup(trashIds);
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            setRestoringGroupKey(null);
            if (res.ok) router.refresh();
        });
    };

    const navigate = (mutate: (sp: URLSearchParams) => void) => {
        const sp = new URLSearchParams(window.location.search);
        mutate(sp);
        startNav(() => router.push(`/admin/audio-corbeille?${sp.toString()}`));
    };

    const goto = (p: number) => navigate((sp) => sp.set('page', String(p)));

    const selectTab = (t: TrashTab) =>
        navigate((sp) => {
            sp.set('tab', t);
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
                <CardHeader className="space-y-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle>Corbeille audio</CardTitle>
                            <AideLink section="corbeille-audio" />
                        </div>
                        <CardDescription>
                            Tous les fichiers audio supprimés du catalogue, livre par livre ou avec
                            leur fiche. Chacun a été copié dans la corbeille du stockage avant
                            d’être retiré de son dossier, et reste restaurable {retentionDays} jours
                            — après quoi une purge automatique le supprime définitivement. L’onglet
                            « Sans fiche » réunit ceux dont le livre a été supprimé depuis :
                            personne ne pouvait les voir avant cet écran.
                        </CardDescription>
                    </div>

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
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') runSearch(searchTerm);
                                }}
                                placeholder="Rechercher un fichier, un titre de livre ou un identifiant…"
                                className="pl-9 pr-9"
                                disabled={busy}
                            />
                            {searchTerm && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                                    disabled={busy}
                                    onClick={() => {
                                        setSearchTerm('');
                                        runSearch('');
                                    }}
                                    aria-label="Effacer la recherche"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <Button variant="outline" disabled={busy} onClick={() => runSearch(searchTerm)}>
                            Rechercher
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Le tri met les suppressions les plus anciennes — celles que la
                purge prendra d'abord — en fin de liste, parfois sur la dernière
                page : ce bandeau les empêche de partir sans que personne ne les
                voie. Compté sur tout l'onglet, indépendamment de la recherche. */}
            {urgentCount > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                    <p>
                        {urgentCount === 1
                            ? '1 fichier de cet onglet sera supprimé'
                            : `${urgentCount} fichiers de cet onglet seront supprimés`}{' '}
                        définitivement dans les {urgentDays} prochains jours. Ce sont les plus
                        anciens, en fin de liste, signalés en ambre.
                    </p>
                </div>
            )}

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
                        restoringId={restoringId}
                        busy={busy}
                        onRestore={(id) => run(id, () => restoreTrashedTrack(id))}
                    />
                ) : (
                    <GroupCard
                        key={group.key}
                        group={group}
                        isOpen={expanded.has(group.key)}
                        onToggle={() => toggle(group.key)}
                        restoringId={restoringId}
                        isRestoringGroup={restoringGroupKey === group.key}
                        busy={busy}
                        onRestore={(id) => run(id, () => restoreTrashedTrack(id))}
                        onRestoreGroup={(ids) => runGroup(group.key, ids)}
                    />
                ),
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || busy}
                        onClick={() => goto(page - 1)}
                    >
                        <ChevronLeft className="h-4 w-4" /> Précédent
                    </Button>
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        {isNavPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Page {page} / {totalPages} — {totalGroups} livre{totalGroups > 1 ? 's' : ''},{' '}
                        {totalFiles} fichier{totalFiles > 1 ? 's' : ''}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || busy}
                        onClick={() => goto(page + 1)}
                    >
                        Suivant <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}

interface FileRowProps {
    item: TrashRow;
    restoringId: number | null;
    busy: boolean;
    onRestore: (id: number) => void;
}

interface FileRowBodyProps extends FileRowProps {
    /** Dans un groupe déplié, la carte du livre porte déjà la mention. */
    hideOrphanHint?: boolean;
}

/** Le corps d'une ligne de corbeille : détails du fichier + bouton Restaurer. */
function FileRowBody({ item, restoringId, busy, onRestore, hideOrphanHint }: FileRowBodyProps) {
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
                        {!item.book && !hideOrphanHint && <OrphanRestoreHint />}
                    </>
                )}
            </div>

            <div className="flex-shrink-0">
                {item.restoredAt ? (
                    <span className="text-xs text-muted-foreground">Restauré</span>
                ) : item.purgedAt ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-red-500">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Purgé
                    </span>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
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
                )}
            </div>
        </div>
    );
}

/** Un livre qui n'a qu'un seul fichier en corbeille : pas de dépliant, c'est
 *  déjà toute l'information. */
function FileCard({ item, restoringId, busy, onRestore }: FileRowProps) {
    return (
        <Card>
            <CardContent className="py-4">
                <FileRowBody item={item} restoringId={restoringId} busy={busy} onRestore={onRestore} />
            </CardContent>
        </Card>
    );
}

interface GroupCardProps {
    group: TrashGroup;
    isOpen: boolean;
    onToggle: () => void;
    restoringId: number | null;
    isRestoringGroup: boolean;
    busy: boolean;
    onRestore: (id: number) => void;
    onRestoreGroup: (trashIds: number[]) => void;
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
    isRestoringGroup,
    busy,
    onRestore,
    onRestoreGroup,
}: GroupCardProps) {
    const { rows } = group;
    const totalSize = rows.reduce((sum, r) => sum + r.sizeBytes, 0);
    const anyUrgent = rows.some((r) => r.urgent);
    const allRestored = rows.every((r) => r.restoredAt !== null);
    const allPurged = rows.every((r) => r.purgedAt !== null);
    // Un groupe n'est restaurable en bloc que dans les onglets actifs — même
    // condition que le bouton Restaurer par fichier ci-dessous, appliquée à
    // l'ensemble du groupe plutôt qu'à une ligne.
    const restorableIds = rows.filter((r) => !r.restoredAt && !r.purgedAt).map((r) => r.id);

    // La ligne la plus proche de sa purge résume l'urgence du groupe entier.
    const soonestPurgeEligible = rows
        .filter((r) => !r.retainForever && r.purgeEligibleAt && !r.restoredAt && !r.purgedAt)
        .map((r) => r.purgeEligibleAt as string)
        .sort()[0];

    let statusLine: string;
    if (allRestored) {
        statusLine = `${rows.length} fichiers restaurés`;
    } else if (allPurged) {
        statusLine = `${rows.length} fichiers supprimés définitivement du stockage`;
    } else if (soonestPurgeEligible) {
        const left = daysUntil(soonestPurgeEligible);
        statusLine =
            left <= 0
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
                        <BookIdentity group={group} />
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
                    {!group.book && restorableIds.length > 0 && <OrphanRestoreHint plural />}
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
                                restoringId={restoringId}
                                busy={busy}
                                onRestore={onRestore}
                                hideOrphanHint
                            />
                        </div>
                    ))}
                </CardContent>
            )}
        </Card>
    );
}
