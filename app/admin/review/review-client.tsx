'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Trash2, Check, ChevronLeft, ChevronRight, FileAudio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

type Pending =
    | { kind: 'fuse'; canonical: ReviewBook; duplicate: ReviewBook }
    | { kind: 'delete'; book: ReviewBook }
    | { kind: 'dismiss'; book: ReviewBook }
    | null;

const fmtDate = (v: Date | string | null): string => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
};
const fmtText = (v: string | number | null): string =>
    v == null || v === '' ? '—' : String(v);
const fmtDuration = (v: number | null): string => (v == null ? '—' : `${v} min`);

const FIELDS: { label: string; render: (b: ReviewBook) => string; key: keyof ReviewBook; format?: (b: ReviewBook) => string }[] = [
    { label: 'Titre', key: 'title', render: (b) => fmtText(b.title) },
    { label: 'Auteur', key: 'author', render: (b) => fmtText(b.author) },
    { label: 'Sous-titre', key: 'subtitle', render: (b) => fmtText(b.subtitle) },
    { label: 'Date de publication', key: 'publishedDate', render: (b) => fmtDate(b.publishedDate) },
    { label: 'ISBN', key: 'isbn', render: (b) => fmtText(b.isbn) },
    { label: 'Éditeur', key: 'publisher', render: (b) => fmtText(b.publisher) },
    { label: 'Pages', key: 'pageCount', render: (b) => fmtText(b.pageCount) },
    { label: 'Durée', key: 'readingDurationMinutes', render: (b) => fmtDuration(b.readingDurationMinutes) },
    { label: 'Fichier audio', key: 'audio_filepath', render: (b) => fmtText(b.audio_filepath) },
    { label: 'Description', key: 'description', render: (b) => fmtText(b.description) },
    { label: 'ID source (Access)', key: 'source_access_id', render: (b) => fmtText(b.source_access_id) },
];

export default function ReviewClient({ pairs, page, totalPages, total }: Props) {
    const router = useRouter();
    const [pending, setPending] = useState<Pending>(null);
    const [isPending, startTransition] = useTransition();

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
        if (pending.kind === 'fuse') run(() => fuseBooks(pending.canonical.id, pending.duplicate.id));
        else if (pending.kind === 'delete') run(() => deleteBook(pending.book.id));
        else run(() => dismissReview(pending.book.id));
    };

    const goto = (p: number) => {
        const sp = new URLSearchParams(window.location.search);
        sp.set('page', String(p));
        router.push(`/admin/review?${sp.toString()}`);
    };

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
                    disabled={isPending}
                    onFuse={(canonical, duplicate) => setPending({ kind: 'fuse', canonical, duplicate })}
                    onDelete={(book) => setPending({ kind: 'delete', book })}
                    onDismiss={(book) => setPending({ kind: 'dismiss', book })}
                />
            ))}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || isPending} onClick={() => goto(page - 1)}>
                        <ChevronLeft className="h-4 w-4" /> Précédent
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {page} / {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || isPending} onClick={() => goto(page + 1)}>
                        Suivant <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.kind === 'fuse' && 'Confirmer la fusion'}
                            {pending?.kind === 'delete' && 'Confirmer la suppression'}
                            {pending?.kind === 'dismiss' && 'Marquer comme non-doublon'}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                {pending?.kind === 'fuse' && (
                                    <>
                                        <p>
                                            Le livre <strong>« {pending.duplicate.title} »</strong> (#{pending.duplicate.id}) sera
                                            supprimé et ses demandes, attributions, genres et listes seront transférés vers{' '}
                                            <strong>« {pending.canonical.title} »</strong> (#{pending.canonical.id}).
                                        </p>
                                        <p className="text-destructive">Cette action est irréversible.</p>
                                    </>
                                )}
                                {pending?.kind === 'delete' && (
                                    <>
                                        <p>
                                            Le livre <strong>« {pending.book.title} »</strong> (#{pending.book.id}) sera
                                            définitivement supprimé.
                                        </p>
                                        <p className="text-destructive">Cette action est irréversible.</p>
                                    </>
                                )}
                                {pending?.kind === 'dismiss' && (
                                    <p>
                                        Le livre <strong>« {pending.book.title} »</strong> (#{pending.book.id}) sera retiré de la
                                        file de révision. Aucune fusion ni suppression.
                                    </p>
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
                            className={
                                pending?.kind === 'dismiss'
                                    ? undefined
                                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            }
                        >
                            {isPending ? 'En cours…' : 'Confirmer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function PairCard({
    flagged,
    matched,
    disabled,
    onFuse,
    onDelete,
    onDismiss,
}: {
    flagged: ReviewBook;
    matched: ReviewBook | null;
    disabled: boolean;
    onFuse: (canonical: ReviewBook, duplicate: ReviewBook) => void;
    onDelete: (book: ReviewBook) => void;
    onDismiss: (book: ReviewBook) => void;
}) {
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
                    <Button variant="outline" size="sm" disabled={disabled} onClick={() => onDismiss(flagged)}>
                        <Check className="h-4 w-4" /> Pas un doublon
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="space-y-1">
                <div className="flex items-center gap-2">
                    <Badge>Signalé</Badge>
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary">Correspondant</Badge>
                </div>
                <CardTitle className="text-base">Comparaison — champs divergents surlignés</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="py-2 pr-4 font-medium text-muted-foreground w-40">Champ</th>
                                <th className="py-2 px-3 font-medium">
                                    Signalé <span className="text-muted-foreground font-normal">#{flagged.id}</span>
                                </th>
                                <th className="py-2 px-3 font-medium">
                                    Correspondant <span className="text-muted-foreground font-normal">#{matched.id}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {FIELDS.map((f) => {
                                const a = f.render(flagged);
                                const b = f.render(matched);
                                const differs = a !== b;
                                return (
                                    <tr key={f.label} className="border-b border-border/60 align-top">
                                        <td className="py-2 pr-4 text-muted-foreground">{f.label}</td>
                                        <td className={`py-2 px-3 ${differs ? 'bg-amber-100 dark:bg-amber-950/40 rounded' : ''}`}>
                                            {f.key === 'audio_filepath' && flagged.audio_filepath ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <FileAudio className="h-3.5 w-3.5" /> {a}
                                                </span>
                                            ) : (
                                                a
                                            )}
                                        </td>
                                        <td className={`py-2 px-3 ${differs ? 'bg-amber-100 dark:bg-amber-950/40 rounded' : ''}`}>
                                            {f.key === 'audio_filepath' && matched.audio_filepath ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <FileAudio className="h-3.5 w-3.5" /> {b}
                                                </span>
                                            ) : (
                                                b
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-sm text-muted-foreground mr-1">Fusionner — conserver :</span>
                    <Button variant="default" size="sm" disabled={disabled} onClick={() => onFuse(flagged, matched)}>
                        <ArrowLeftRight className="h-4 w-4" /> Signalé #{flagged.id}
                    </Button>
                    <Button variant="default" size="sm" disabled={disabled} onClick={() => onFuse(matched, flagged)}>
                        <ArrowLeftRight className="h-4 w-4" /> Correspondant #{matched.id}
                    </Button>

                    <span className="w-px h-6 bg-border mx-1" aria-hidden />

                    <Button variant="outline" size="sm" disabled={disabled} onClick={() => onDismiss(flagged)}>
                        <Check className="h-4 w-4" /> Pas un doublon
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(flagged)}
                    >
                        <Trash2 className="h-4 w-4" /> Suppr. signalé #{flagged.id}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(matched)}
                    >
                        <Trash2 className="h-4 w-4" /> Suppr. correspondant #{matched.id}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
