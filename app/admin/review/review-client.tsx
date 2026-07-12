'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeftRight,
    Trash2,
    Check,
    ChevronLeft,
    ChevronRight,
    FileAudio,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { fuseBooks, deleteBook, dismissReview, type ActionResult } from './actions';

export interface ReviewBook {
    id: number;
    title: string;
    author: string;
    subtitle: string | null;
    publishedDate: Date | string | null;
    isbn: string | null;
    description: string | null;
    publisher: string | null;
    pageCount: number | null;
    readingDurationMinutes: number | null;
    audio_filepath: string | null;
    source_access_id: number | null;
    needsReview: boolean;
    id_arbre: number | null;
}

export interface ReviewPair {
    flagged: ReviewBook;
    matched: ReviewBook | null;
}

interface Props {
    pairs: ReviewPair[];
    page: number;
    totalPages: number;
    total: number;
}

const fmtDate = (v: Date | string | null): string => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
};
const fmtText = (v: string | number | null): string => (v == null || v === '' ? '—' : String(v));
const fmtDuration = (v: number | null): string => (v == null ? '—' : `${v} min`);

interface FieldDef {
    label: string;
    key: keyof ReviewBook;
    render: (b: ReviewBook) => string;
    overridable: boolean;
}

// Order shown in comparisons. `overridable` fields can be pulled from the removed book;
// audio + source id are shown but never freely chosen (audio is auto/guarded, id is identity).
const FIELDS: FieldDef[] = [
    { label: 'Titre', key: 'title', render: (b) => fmtText(b.title), overridable: true },
    { label: 'Auteur', key: 'author', render: (b) => fmtText(b.author), overridable: true },
    { label: 'Sous-titre', key: 'subtitle', render: (b) => fmtText(b.subtitle), overridable: true },
    { label: 'Date de publication', key: 'publishedDate', render: (b) => fmtDate(b.publishedDate), overridable: true },
    { label: 'ISBN', key: 'isbn', render: (b) => fmtText(b.isbn), overridable: true },
    { label: 'Éditeur', key: 'publisher', render: (b) => fmtText(b.publisher), overridable: true },
    { label: 'Pages', key: 'pageCount', render: (b) => fmtText(b.pageCount), overridable: true },
    { label: 'Durée', key: 'readingDurationMinutes', render: (b) => fmtDuration(b.readingDurationMinutes), overridable: true },
    { label: 'Description', key: 'description', render: (b) => fmtText(b.description), overridable: true },
    { label: 'Fichier audio', key: 'audio_filepath', render: (b) => fmtText(b.audio_filepath), overridable: false },
    { label: 'ID source (Access)', key: 'source_access_id', render: (b) => fmtText(b.source_access_id), overridable: false },
];

const hasAudio = (b: ReviewBook): boolean => !!b.audio_filepath?.trim();
const differs = (f: FieldDef, a: ReviewBook, b: ReviewBook): boolean => f.render(a) !== f.render(b);

type Pending =
    | {
          kind: 'fuse';
          survivorId: number;
          removedId: number;
          overrides: string[];
          pulledLabels: string[];
      }
    | { kind: 'delete'; bookId: number; title: string }
    | null;

export default function ReviewClient({ pairs, page, totalPages, total }: Props) {
    const router = useRouter();
    const [pending, setPending] = useState<Pending>(null);
    const [isPending, startTransition] = useTransition();
    // Separate transition for page navigation so we can show a spinner + lock the
    // controls until the next page's data has loaded.
    const [isNavPending, startNav] = useTransition();

    const run = (fn: () => Promise<ActionResult>) => {
        startTransition(async () => {
            const res = await fn();
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            setPending(null);
            if (res.ok) router.refresh();
        });
    };

    const confirm = () => {
        if (!pending) return;
        if (pending.kind === 'fuse') run(() => fuseBooks(pending.survivorId, pending.removedId, pending.overrides));
        else run(() => deleteBook(pending.bookId));
    };

    const goto = (p: number) => {
        const sp = new URLSearchParams(window.location.search);
        sp.set('page', String(p));
        startNav(() => router.push(`/admin/review?${sp.toString()}`));
    };

    const busy = isPending || isNavPending;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Révision des doublons</CardTitle>
                    <CardDescription>
                        {total === 0
                            ? 'Aucun livre en attente de révision.'
                            : `${total} livre${total > 1 ? 's' : ''} signalé${total > 1 ? 's' : ''} comme doublon potentiel.`}
                    </CardDescription>
                </CardHeader>
            </Card>

            {pairs.map(({ flagged, matched }) => (
                <PairCard
                    key={flagged.id}
                    flagged={flagged}
                    matched={matched}
                    busy={busy}
                    onRequestFuse={(p) => setPending({ kind: 'fuse', ...p })}
                    onRequestDelete={(book) => setPending({ kind: 'delete', bookId: book.id, title: book.title })}
                    onDismiss={(bookId) => run(() => dismissReview(bookId))}
                />
            ))}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || busy} onClick={() => goto(page - 1)}>
                        <ChevronLeft className="h-4 w-4" /> Précédent
                    </Button>
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
                        {isNavPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Page {page} / {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || busy} onClick={() => goto(page + 1)}>
                        Suivant <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.kind === 'fuse' ? 'Confirmer la fusion' : 'Confirmer la suppression'}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                {pending?.kind === 'fuse' && (
                                    <>
                                        <p>Les deux fiches seront fusionnées en une seule.</p>
                                        <p>
                                            {pending.pulledLabels.length === 0
                                                ? 'La fiche fusionnée conserve ses valeurs actuelles.'
                                                : `Valeurs reprises de l’autre version : ${pending.pulledLabels.join(', ')}.`}
                                        </p>
                                        <p className="text-destructive">Cette action est irréversible.</p>
                                    </>
                                )}
                                {pending?.kind === 'delete' && (
                                    <>
                                        <p>
                                            Le livre <strong>« {pending.title} »</strong> (#{pending.bookId}) sera définitivement
                                            supprimé.
                                        </p>
                                        <p className="text-destructive">Cette action est irréversible.</p>
                                    </>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                confirm();
                            }}
                            disabled={isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isPending ? 'En cours…' : 'Confirmer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

interface FusePayload {
    survivorId: number;
    removedId: number;
    overrides: string[];
    pulledLabels: string[];
}

function PairCard({
    flagged,
    matched,
    busy,
    onRequestFuse,
    onRequestDelete,
    onDismiss,
}: {
    flagged: ReviewBook;
    matched: ReviewBook | null;
    busy: boolean;
    onRequestFuse: (p: FusePayload) => void;
    onRequestDelete: (book: ReviewBook) => void;
    onDismiss: (bookId: number) => void;
}) {
    const [mode, setMode] = useState<'collapsed' | 'fuse' | 'distinct'>('collapsed');
    // Fields to pull FROM the matched (Access import) record onto the kept site book.
    const [overrides, setOverrides] = useState<Set<string>>(new Set());

    if (!matched) {
        return (
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle className="text-base">
                            {flagged.title} <span className="text-muted-foreground font-normal">#{flagged.id}</span>
                        </CardTitle>
                        <CardDescription>{flagged.author}</CardDescription>
                    </div>
                    <Badge variant="secondary">Aucun correspondant trouvé</Badge>
                </CardHeader>
                <CardContent className="flex justify-end">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => onDismiss(flagged.id)}>
                        <Check className="h-4 w-4" /> Pas un doublon
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const audioConflict = hasAudio(flagged) && hasAudio(matched) && flagged.audio_filepath !== matched.audio_filepath;
    const diffCount = FIELDS.filter((f) => f.overridable && differs(f, flagged, matched)).length;

    // Always keep the flagged book — it's the live site catalogue entry that already
    // carries the orders/attributions; the matched record (the Access import) is deleted.
    const survivor = flagged;
    const removed = matched;
    const resultingAudio = hasAudio(survivor) ? survivor.audio_filepath : removed.audio_filepath;

    const toggleField = (key: string, takeFromRemoved: boolean) => {
        setOverrides((prev) => {
            const next = new Set(prev);
            if (takeFromRemoved) next.add(key);
            else next.delete(key);
            return next;
        });
    };

    const startFuse = () => {
        const pulledLabels = FIELDS.filter((f) => overrides.has(String(f.key))).map((f) => f.label);
        onRequestFuse({
            survivorId: survivor.id,
            removedId: removed.id,
            overrides: [...overrides],
            pulledLabels,
        });
    };

    const diffFields = FIELDS.filter((f) => differs(f, flagged, matched));
    const sameFields = FIELDS.filter((f) => !differs(f, flagged, matched));

    return (
        <Card>
            <CardHeader className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <BookHead book={flagged} />
                    <ArrowLeftRight className="hidden sm:block h-5 w-5 text-muted-foreground mx-auto" />
                    <BookHead book={matched} align="right" />
                </div>
                <div className="text-sm text-muted-foreground">
                    {diffCount === 0
                        ? 'Les champs comparés sont identiques.'
                        : `${diffCount} champ${diffCount > 1 ? 's' : ''} diffère${diffCount > 1 ? 'nt' : ''}.`}
                </div>

                {audioConflict && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            Double enregistrement audio pour ce livre. La version à conserver n’étant pas évidente, une
                            vérification manuelle est nécessaire — la fusion et la suppression sont désactivées.
                        </span>
                    </div>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                {mode === 'collapsed' && (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy || audioConflict} onClick={() => setMode('fuse')}>
                            <ArrowLeftRight className="h-4 w-4" /> Fusionner
                        </Button>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => setMode('distinct')}>
                            Livres distincts
                        </Button>
                    </div>
                )}

                {mode === 'fuse' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Pour chaque champ différent, cochez la valeur à garder dans la fiche fusionnée.
                        </p>

                        {diffFields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Aucune différence à arbitrer. Le livre conservé garde toutes ses valeurs.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left">
                                            <th className="py-2 pr-4 font-medium text-muted-foreground w-40">Champ divergent</th>
                                            <ColHeader book={flagged} />
                                            <ColHeader book={matched} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diffFields.map((f) => {
                                            const key = String(f.key);
                                            const selectable = f.overridable;
                                            // For auto/forced fields, the value that survives is locked:
                                            // audio → whichever side actually has a file; otherwise the survivor.
                                            const forcedKeptId = selectable
                                                ? null
                                                : f.key === 'audio_filepath'
                                                  ? hasAudio(survivor)
                                                      ? survivor.id
                                                      : hasAudio(removed)
                                                        ? removed.id
                                                        : null
                                                  : survivor.id;
                                            return (
                                                <tr key={key} className="border-b border-border/60 align-top">
                                                    <td className="py-2 pr-4 text-muted-foreground">{f.label}</td>
                                                    {[flagged, matched].map((book) => {
                                                        const isSurvivorCol = book.id === survivor.id;
                                                        const checked = isSurvivorCol ? !overrides.has(key) : overrides.has(key);
                                                        return (
                                                            <td key={book.id} className="py-2 px-3">
                                                                {selectable ? (
                                                                    <label className="flex items-start gap-2 cursor-pointer">
                                                                        <Checkbox
                                                                            checked={checked}
                                                                            disabled={busy}
                                                                            onCheckedChange={() =>
                                                                                toggleField(key, !isSurvivorCol)
                                                                            }
                                                                            className="mt-0.5"
                                                                        />
                                                                        <span className={checked ? 'font-medium' : 'text-muted-foreground'}>
                                                                            {f.render(book)}
                                                                        </span>
                                                                    </label>
                                                                ) : (
                                                                    <label className="flex items-start gap-2">
                                                                        <Checkbox
                                                                            checked={book.id === forcedKeptId}
                                                                            disabled
                                                                            className="mt-0.5"
                                                                        />
                                                                        <span
                                                                            className={
                                                                                book.id === forcedKeptId
                                                                                    ? 'font-medium'
                                                                                    : 'text-muted-foreground'
                                                                            }
                                                                        >
                                                                            {f.key === 'audio_filepath' && hasAudio(book) ? (
                                                                                <span className="inline-flex items-center gap-1">
                                                                                    <FileAudio className="h-3.5 w-3.5" />
                                                                                    {f.render(book)}
                                                                                </span>
                                                                            ) : (
                                                                                f.render(book)
                                                                            )}
                                                                        </span>
                                                                    </label>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                            <FileAudio className="h-3.5 w-3.5" />
                            Fichier audio conservé : <span className="font-medium">{fmtText(resultingAudio)}</span>
                        </p>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <Button size="sm" disabled={busy} onClick={startFuse}>
                                <ArrowLeftRight className="h-4 w-4" /> Fusionner les deux fiches
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode('collapsed')}>
                                Annuler
                            </Button>
                        </div>
                    </div>
                )}

                {mode === 'distinct' && (
                    <div className="space-y-4">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="py-2 pr-4 font-medium text-muted-foreground w-40">Champ</th>
                                        <th className="py-2 px-3 font-medium">
                                            {flagged.title} <span className="text-muted-foreground font-normal">#{flagged.id}</span>
                                        </th>
                                        <th className="py-2 px-3 font-medium">
                                            {matched.title} <span className="text-muted-foreground font-normal">#{matched.id}</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {FIELDS.map((f) => {
                                        const d = differs(f, flagged, matched);
                                        return (
                                            <tr key={String(f.key)} className="border-b border-border/60 align-top">
                                                <td className="py-2 pr-4 text-muted-foreground">{f.label}</td>
                                                <td className={`py-2 px-3 ${d ? 'font-medium' : 'text-muted-foreground'}`}>
                                                    {f.render(flagged)}
                                                </td>
                                                <td className={`py-2 px-3 ${d ? 'font-medium' : 'text-muted-foreground'}`}>
                                                    {f.render(matched)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDismiss(flagged.id)}>
                                <Check className="h-4 w-4" /> Confirmer : livres distincts
                            </Button>
                            <span className="w-px h-6 bg-border mx-1" aria-hidden />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy || audioConflict}
                                className="text-destructive hover:text-destructive"
                                onClick={() => onRequestDelete(flagged)}
                            >
                                <Trash2 className="h-4 w-4" /> Supprimer #{flagged.id}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy || audioConflict}
                                className="text-destructive hover:text-destructive"
                                onClick={() => onRequestDelete(matched)}
                            >
                                <Trash2 className="h-4 w-4" /> Supprimer #{matched.id}
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode('collapsed')}>
                                Annuler
                            </Button>
                        </div>
                        {sameFields.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {sameFields.length} champ{sameFields.length > 1 ? 's' : ''} identique
                                {sameFields.length > 1 ? 's' : ''}.
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function BookHead({ book, align }: { book: ReviewBook; align?: 'right' }) {
    return (
        <div className={align === 'right' ? 'sm:text-right' : ''}>
            <div className="font-semibold">
                {book.title} <span className="text-muted-foreground font-normal">#{book.id}</span>
            </div>
            <div className="text-sm text-muted-foreground">{book.author}</div>
            {hasAudio(book) && (
                <div className={`mt-1 ${align === 'right' ? 'sm:flex sm:justify-end' : ''}`}>
                    <Badge variant="secondary" className="gap-1">
                        <FileAudio className="h-3 w-3" /> Audio
                    </Badge>
                </div>
            )}
        </div>
    );
}

function ColHeader({ book }: { book: ReviewBook }) {
    return <th className="py-2 px-3 font-normal text-muted-foreground">#{book.id}</th>;
}
