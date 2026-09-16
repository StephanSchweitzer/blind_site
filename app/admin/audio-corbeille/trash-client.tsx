'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
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
import { restoreTrashedTrack, type ActionResult } from './actions';

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
    /** Le livre, s'il existe encore. */
    book: { id: number; title: string } | null;
    /** Ce qu'il en reste sinon (markTrashOrigin, lib/audio/trash.ts). */
    originBookId: number | null;
    originBookTitle: string | null;
    deletedBy: { name: string | null; email: string | null } | null;
    restoredBy: { name: string | null; email: string | null } | null;
}

interface Props {
    items: TrashRow[];
    tab: TrashTab;
    page: number;
    totalPages: number;
    total: number;
    tabCounts: Record<TrashTab, number>;
    retentionDays: number;
    search: string;
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

/** Une purge imminente mérite d'être signalée, pas juste écrite. */
const isUrgent = (item: TrashRow): boolean =>
    !item.retainForever &&
    item.purgeEligibleAt !== null &&
    item.restoredAt === null &&
    item.purgedAt === null &&
    daysUntil(item.purgeEligibleAt) <= 3;

export default function TrashClient({
    items,
    tab,
    page,
    totalPages,
    total,
    tabCounts,
    retentionDays,
    search,
}: Props) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState(search);
    const [restoringId, setRestoringId] = useState<number | null>(null);
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

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="space-y-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle>Corbeille audio</CardTitle>
                            <AideLink section="audio-orphelin" anchor="corbeille-audio" />
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

            {items.length === 0 && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        {search
                            ? `Aucun fichier ne correspond à « ${search} ».`
                            : 'Aucun fichier dans cet onglet.'}
                    </CardContent>
                </Card>
            )}

            {items.map((item) => (
                <Card key={item.id}>
                    <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-mono text-sm text-foreground break-all">
                                {item.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {formatBytes(item.sizeBytes)} · supprimé le{' '}
                                {formatDate(item.deletedAt)} par {personLabel(item.deletedBy)}
                            </p>

                            {/* De quel livre venait ce fichier : la fiche si elle
                                existe encore, sinon l'empreinte laissée à la
                                suppression — ou rien du tout pour une ligne
                                antérieure à ces colonnes. */}
                            <p className="text-xs">
                                {item.book ? (
                                    <Link
                                        href={`/admin/books/${item.book.id}`}
                                        className="text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-2"
                                    >
                                        « {item.book.title} » (#{item.book.id})
                                    </Link>
                                ) : item.originBookTitle ? (
                                    <span className="text-muted-foreground">
                                        fiche supprimée — « {item.originBookTitle} »
                                        {item.originBookId != null && ` (#${item.originBookId})`}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">
                                        fiche supprimée — livre inconnu
                                    </span>
                                )}
                            </p>

                            <p className="font-mono text-xs text-muted-foreground break-all">
                                {item.originalKey}
                            </p>

                            {item.restoredAt ? (
                                <p className="text-xs text-muted-foreground">
                                    restauré le {formatDate(item.restoredAt)} par{' '}
                                    {personLabel(item.restoredBy)}
                                </p>
                            ) : item.purgedAt ? (
                                <p className="text-xs text-red-600 dark:text-red-400">
                                    supprimé définitivement du stockage le {formatDate(item.purgedAt)}
                                </p>
                            ) : (
                                <p
                                    className={
                                        isUrgent(item)
                                            ? 'flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300'
                                            : 'text-xs text-muted-foreground'
                                    }
                                >
                                    {isUrgent(item) && (
                                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                    {retentionLabel(item)}
                                </p>
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
                                    onClick={() => run(item.id, () => restoreTrashedTrack(item.id))}
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
                    </CardContent>
                </Card>
            ))}

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
                        Page {page} / {totalPages} — {total} fichier{total > 1 ? 's' : ''}
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
