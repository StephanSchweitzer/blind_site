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
    FileX2,
    AlertTriangle,
    Loader2,
    Search,
    Send,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { BookAudioModal } from '@/admin/BookAudioModal';
import {
    AudioLinkStatus,
    audioLinkStatusIsMissing,
    getAudioLinkStatusButtonColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
} from '@/lib/audio-enums';
import { formatCalendarDate } from '@/lib/calendar-date';
import { fuseBooks, deleteBook, dismissReview, escalateReview, type ActionResult } from './actions';

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
    audioLinkStatus?: AudioLinkStatus;
    source_access_id: number | null;
    needsReview: boolean;
    id_arbre: number | null;
    /** Set once the pair has been handed over for manual DB treatment. */
    escalatedAt?: Date | string | null;
}

export interface ReviewPair {
    flagged: ReviewBook;
    matched: ReviewBook | null;
}

interface Props {
    pairs: ReviewPair[];
    page: number;
    totalPages: number;
    /** Matches for the current search, or the whole queue when not searching. */
    total: number;
    /** Size of the whole queue, regardless of the search. */
    queueTotal: number;
    search: string;
}

/** For real instants (escalatedAt…), which belong in the reader's own timezone. */
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
    // Calendar date, not an instant: two candidates for a fusion have to be
    // compared on the year that is stored, not the one the viewer's timezone
    // makes of it.
    { label: 'Date de publication', key: 'publishedDate', render: (b) => formatCalendarDate(b.publishedDate, '—'), overridable: true },
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

/** The pair being handed over, while the note is being written. */
interface EscalationTarget {
    flaggedId: number;
    matchedId: number | null;
    title: string;
    /** Two different recordings: the note is then optional, the blocker is obvious. */
    audioConflict: boolean;
}

export default function ReviewClient({ pairs, page, totalPages, total, queueTotal, search }: Props) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState(search);
    const [pending, setPending] = useState<Pending>(null);
    /** Pair being handed over to Stéphan, and the note that goes with it. */
    const [escalation, setEscalation] = useState<EscalationTarget | null>(null);
    const [note, setNote] = useState('');
    /** Book whose audio folder is open for listening. */
    const [audioBook, setAudioBook] = useState<ReviewBook | null>(null);
    const [isPending, startTransition] = useTransition();
    // Separate transition for page navigation so we can show a spinner + lock the
    // controls until the next page's data has loaded.
    const [isNavPending, startNav] = useTransition();

    const run = (fn: () => Promise<ActionResult>, onSuccess?: () => void) => {
        startTransition(async () => {
            const res = await fn();
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            setPending(null);
            if (res.ok) {
                onSuccess?.();
                router.refresh();
            }
        });
    };

    const openEscalation = (target: EscalationTarget) => {
        setNote('');
        setEscalation(target);
    };

    // The dialogue stays open when the send fails — the note is the only thing
    // written by hand here, and losing it would mean writing it twice.
    const sendEscalation = () => {
        if (!escalation) return;
        const { flaggedId, matchedId } = escalation;
        const text = note;
        run(
            () => escalateReview(flaggedId, matchedId, text),
            () => {
                setEscalation(null);
                setNote('');
            }
        );
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

    const runSearch = (term: string) => {
        const sp = new URLSearchParams(window.location.search);
        if (term.trim()) sp.set('q', term.trim());
        else sp.delete('q');
        // A new search always restarts at page 1 — page 7 of the old result set
        // would otherwise land on an empty page.
        sp.delete('page');
        startNav(() => router.push(`/admin/review?${sp.toString()}`));
    };

    const busy = isPending || isNavPending;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="space-y-4">
                    <div>
                        <CardTitle>Révision des doublons</CardTitle>
                        <CardDescription>
                            {search
                                ? `${total} résultat${total > 1 ? 's' : ''} pour « ${search} » — ${queueTotal} livre${queueTotal > 1 ? 's' : ''} dans la file.`
                                : total === 0
                                  ? 'Aucun livre en attente de révision.'
                                  : `${total} livre${total > 1 ? 's' : ''} signalé${total > 1 ? 's' : ''} comme doublon potentiel.`}
                        </CardDescription>
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
                                placeholder="Rechercher un titre, un auteur, un ISBN ou un numéro…"
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

            {search && pairs.length === 0 && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Aucun livre de la file ne correspond à « {search} ».
                    </CardContent>
                </Card>
            )}

            {pairs.map(({ flagged, matched }) => (
                <PairCard
                    key={flagged.id}
                    flagged={flagged}
                    matched={matched}
                    busy={busy}
                    onRequestFuse={(p) => setPending({ kind: 'fuse', ...p })}
                    onRequestDelete={(book) => setPending({ kind: 'delete', bookId: book.id, title: book.title })}
                    onDismiss={(bookId) => run(() => dismissReview(bookId))}
                    onEscalate={openEscalation}
                    onListen={setAudioBook}
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

            {/* The queue can only fuse, supprimer or écarter — a pair the import
                got wrong fits none of the three, so every card can hand it over
                instead. The note is what makes the mail actionable. */}
            <Dialog
                open={escalation !== null}
                onOpenChange={(open) => {
                    if (!open && !isPending) setEscalation(null);
                }}
            >
                <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle>Signaler ce doublon à Stéphan</DialogTitle>
                        <DialogDescription>
                            {escalation?.audioConflict
                                ? 'Les deux fiches portent un enregistrement différent : seule une correction directe dans la base peut trancher. Ajoutez une précision si vous en avez une.'
                                : `Un mail part avec ${escalation?.matchedId != null ? 'les deux fiches' : 'la fiche'}. Dites ce qui ne va pas — sans cela, le message ne dit rien de plus que « regardez ».`}
                        </DialogDescription>
                    </DialogHeader>

                    {escalation && (
                        <p className="text-sm text-muted-foreground">
                            « {escalation.title} » <span className="font-normal">#{escalation.flaggedId}</span>
                            {escalation.matchedId != null && <> et #{escalation.matchedId}</>}
                        </p>
                    )}

                    <div className="space-y-1">
                        <Label htmlFor="escalation-note">
                            Ce qui bloque {escalation?.audioConflict ? '(facultatif)' : '*'}
                        </Label>
                        <Textarea
                            id="escalation-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Le livre rapproché n’est pas le bon : l’audio proposé est la partie 2, alors que cette fiche est le tome 1…"
                            rows={4}
                            disabled={isPending}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" disabled={isPending} onClick={() => setEscalation(null)}>
                            Annuler
                        </Button>
                        <Button
                            disabled={isPending || (!escalation?.audioConflict && !note.trim())}
                            onClick={sendEscalation}
                        >
                            {isPending ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Envoi…
                                </span>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" /> Envoyer à Stéphan
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Listening to both folders is often the only way to tell two
                near-identical fiches apart — so the editor opens right here,
                without leaving the queue. */}
            {audioBook && (
                <BookAudioModal
                    isOpen={audioBook !== null}
                    onOpenChange={(open) => {
                        if (!open) setAudioBook(null);
                    }}
                    bookId={audioBook.id}
                    onChanged={() => router.refresh()}
                />
            )}
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
    onEscalate,
    onListen,
}: {
    flagged: ReviewBook;
    matched: ReviewBook | null;
    busy: boolean;
    onRequestFuse: (p: FusePayload) => void;
    onRequestDelete: (book: ReviewBook) => void;
    onDismiss: (bookId: number) => void;
    onEscalate: (target: EscalationTarget) => void;
    onListen: (book: ReviewBook) => void;
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
                <CardContent className="space-y-3">
                    <div className="flex justify-end gap-2">
                        <ListenButton book={flagged} onListen={onListen} />
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => onDismiss(flagged.id)}>
                            <Check className="h-4 w-4" /> Pas un doublon
                        </Button>
                    </div>
                    <EscalateRow
                        book={flagged}
                        matchedId={null}
                        audioConflict={false}
                        busy={busy}
                        onEscalate={onEscalate}
                        hint="Ce livre est signalé sans qu’aucune fiche ne lui corresponde ?"
                    />
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
            {/* Clicking the pair opens the comparison — the whole card is the
                obvious target, and comparing is never destructive. The buttons
                below stay the accessible path for keyboard and screen readers. */}
            <CardHeader
                className={`space-y-3 ${mode === 'collapsed' ? 'cursor-pointer' : ''}`}
                onClick={mode === 'collapsed' ? () => setMode('fuse') : undefined}
            >
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <BookHead book={flagged} onListen={onListen} />
                    <ArrowLeftRight className="hidden sm:block h-5 w-5 text-muted-foreground mx-auto" />
                    <BookHead book={matched} align="right" onListen={onListen} />
                </div>
                <div className="text-sm text-muted-foreground">
                    {diffCount === 0
                        ? 'Les champs comparés sont identiques.'
                        : `${diffCount} champ${diffCount > 1 ? 's' : ''} diffère${diffCount > 1 ? 'nt' : ''}.`}
                    {mode === 'collapsed' && ' Cliquez pour comparer les deux fiches.'}
                </div>

                {audioConflict && (
                    <div className="space-y-3 rounded-md border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                Double enregistrement audio pour ce livre. La version à conserver n’étant pas évidente, une
                                vérification manuelle est nécessaire — la fusion et la suppression sont désactivées.
                            </span>
                        </div>
                        {/* Dead end for the queue: only a direct fix in the database can
                            sort these out, so the card offers the handover instead of
                            leaving the permanent with nothing but disabled buttons. */}
                        <EscalateRow
                            book={flagged}
                            matchedId={matched.id}
                            audioConflict
                            busy={busy}
                            onEscalate={onEscalate}
                            label="Impossible de fusionner, envoyer à Stéphan"
                            className="border-amber-500 bg-transparent text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
                            stampClassName="text-inherit"
                        />
                    </div>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                {mode === 'collapsed' && (
                    <div className="flex flex-wrap gap-2">
                        {/* Not "Fusionner": this only opens the comparison, and
                            nothing is merged until the dialogue is confirmed. */}
                        <Button size="sm" disabled={busy} onClick={() => setMode('fuse')}>
                            <ArrowLeftRight className="h-4 w-4" /> Comparer les deux fiches
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
                            Rien n’est fusionné avant la confirmation.
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
                            {/* The audio conflict blocks the merge itself, never the comparison. */}
                            <Button size="sm" disabled={busy || audioConflict} onClick={startFuse}>
                                <ArrowLeftRight className="h-4 w-4" /> Fusionner les deux fiches
                            </Button>
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => setMode('distinct')}>
                                Livres distincts
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

                {/* The import's suggestion can simply be wrong — the right « pt 2 »
                    folder rapproché de la fiche du tome 1, par exemple. Fusionner
                    serait destructeur et « livres distincts » ne ferait qu'effacer
                    le signalement, donc la sortie de secours est offerte quel que
                    soit l'état de la carte. Le cas du double audio a déjà la sienne
                    dans l'encadré ci-dessus. */}
                {!audioConflict && (
                    <div className="border-t border-border/60 pt-3">
                        <EscalateRow
                            book={flagged}
                            matchedId={matched.id}
                            audioConflict={false}
                            busy={busy}
                            onEscalate={onEscalate}
                            hint="Ce rapprochement est faux ou le cas ne se règle pas ici ?"
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Hand this pair over to Stéphan.
 *
 * On every card, not just on the double-recording dead end: the queue only
 * knows how to fusionner, supprimer or écarter, and a pair the import got wrong
 * fits none of the three. Escalating twice sends the same mail twice, so the
 * button locks once the stamp is there and says when it left.
 */
function EscalateRow({
    book,
    matchedId,
    audioConflict,
    busy,
    onEscalate,
    label = 'Signaler à Stéphan',
    hint,
    className,
    /** `text-inherit` inside the amber box, whose own colour already applies. */
    stampClassName = 'text-muted-foreground',
}: {
    book: ReviewBook;
    matchedId: number | null;
    audioConflict: boolean;
    busy: boolean;
    onEscalate: (target: EscalationTarget) => void;
    label?: string;
    hint?: string;
    className?: string;
    stampClassName?: string;
}) {
    const escalated = !!book.escalatedAt;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {hint && !escalated && <span className="mr-auto text-xs text-muted-foreground">{hint}</span>}
            <Button
                variant="outline"
                size="sm"
                disabled={busy || escalated}
                className={className}
                // The card behind this row opens the comparison on click.
                onClick={(e) => {
                    e.stopPropagation();
                    onEscalate({
                        flaggedId: book.id,
                        matchedId,
                        title: book.title,
                        audioConflict,
                    });
                }}
            >
                <Send className="h-4 w-4" /> {label}
            </Button>
            {escalated && (
                <span className={`text-xs ${stampClassName}`}>
                    Signalé le {fmtDate(book.escalatedAt ?? null)} — traitement manuel en attente.
                </span>
            )}
        </div>
    );
}

function BookHead({
    book,
    align,
    onListen,
}: {
    book: ReviewBook;
    align?: 'right';
    onListen: (book: ReviewBook) => void;
}) {
    return (
        <div className={align === 'right' ? 'sm:text-right' : ''}>
            <div className="font-semibold">
                {book.title} <span className="text-muted-foreground font-normal">#{book.id}</span>
            </div>
            <div className="text-sm text-muted-foreground">{book.author}</div>
            <div
                className={`mt-1 flex flex-wrap items-center gap-2 ${align === 'right' ? 'sm:justify-end' : ''}`}
            >
                {hasAudio(book) && (
                    <Badge variant="secondary" className="gap-1">
                        <FileAudio className="h-3 w-3" /> Audio
                    </Badge>
                )}
                <ListenButton book={book} onListen={onListen} />
            </div>
        </div>
    );
}

/**
 * Opens the audio editor for one side of the pair. The saved path alone does
 * not say what is actually in the folder — and when two fiches both claim a
 * recording, hearing them is the only way to decide which one to keep.
 */
function ListenButton({ book, onListen }: { book: ReviewBook; onListen: (book: ReviewBook) => void }) {
    const status = book.audioLinkStatus ?? AudioLinkStatus.UNVERIFIED;
    const missing = audioLinkStatusIsMissing(status);

    return (
        <Button
            variant="outline"
            size="sm"
            className={`h-7 gap-1 px-2 text-xs ${getAudioLinkStatusButtonColor(status)}`}
            // The card behind this button opens the comparison on click.
            onClick={(e) => {
                e.stopPropagation();
                onListen(book);
            }}
            aria-label={`Écouter l’audio de « ${book.title} » (#${book.id})`}
            title={
                missing
                    ? `${getAudioLinkStatusLabel(status)} — ${getAudioLinkStatusHint(status)}`
                    : 'Écouter le contenu du dossier audio'
            }
        >
            {missing ? <FileX2 className="h-3.5 w-3.5" /> : <FileAudio className="h-3.5 w-3.5" />}
            Écouter
        </Button>
    );
}

function ColHeader({ book }: { book: ReviewBook }) {
    return <th className="py-2 px-3 font-normal text-muted-foreground">#{book.id}</th>;
}
