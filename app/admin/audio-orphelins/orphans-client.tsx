'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    BookPlus,
    ChevronLeft,
    ChevronRight,
    EyeOff,
    Headphones,
    Link2,
    Link2Off,
    Loader2,
    RotateCcw,
    Search,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { BookSearchCombobox, bookLabel } from '@/admin/BookSearchCombobox';
import { calendarYear } from '@/lib/calendar-date';
import {
    AudioLinkStatus,
    getAudioLinkStatusColor,
    getAudioLinkStatusLabel,
} from '@/lib/audio-enums';
import { OrphanAudioModal } from './orphan-audio-modal';
import { formatBytes, formatDate, isNasArtefact } from './format';
import {
    createBookForOrphan,
    dismissOrphan,
    linkOrphanToBook,
    restoreOrphan,
    unlinkOrphan,
    type ActionResult,
} from './actions';

export type OrphanTab = 'a-traiter' | 'rattaches' | 'ecartes';

export interface SuggestedBook {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    year: number | null;
    audioFilepath: string | null;
    audioLinkStatus: AudioLinkStatus;
    audioTrackCount: number | null;
    sourceAccessId: number | null;
    /** Why this book is being proposed — the Access number, or an identical title. */
    reason: 'numero' | 'titre';
}

/**
 * A catalogue hit in the manual search, as this screen needs to read it.
 *
 * /api/books returns whole book rows, so none of this costs an extra query —
 * it was simply never displayed. Title alone is not enough to choose with:
 * « Quatre soeurs » exists twice, same author, separated only by its subtitle.
 */
interface BookHit {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    publishedDate: string | null;
    audioLinkStatus: AudioLinkStatus | null;
    audioTrackCount: number | null;
    source_access_id: number | null;
}

const yearOf = calendarYear;

export interface OrphanRow {
    id: number;
    prefix: string;
    year: number | null;
    folderNum: number | null;
    title: string;
    trackCount: number;
    bytes: number;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedAt: string | null;
    dismissedAt: string | null;
    note: string | null;
    linkedBook: { id: number; title: string; subtitle: string | null; author: string } | null;
    suggestions: SuggestedBook[];
}

interface Props {
    orphans: OrphanRow[];
    tab: OrphanTab;
    page: number;
    totalPages: number;
    total: number;
    tabCounts: Record<OrphanTab, number>;
    search: string;
}

const TAB_LABELS: Record<OrphanTab, string> = {
    'a-traiter': 'À traiter',
    rattaches: 'Rattachés',
    ecartes: 'Écartés',
};

/** A book that already has playable audio cannot receive a second folder. */
const alreadyHasAudio = (b: SuggestedBook): boolean =>
    b.audioLinkStatus === 'OK' && (b.audioTrackCount ?? 0) > 0;

interface SuggestionLineProps {
    book: SuggestedBook;
    busy: boolean;
    onLink: (bookId: number) => void;
}

function SuggestionLine({ book, busy, onLink }: SuggestionLineProps) {
    const blocked = alreadyHasAudio(book);
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-field p-2">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                    #{book.id} — {book.title}
                </div>
                {book.subtitle?.trim() && (
                    <div className="text-xs italic text-foreground/80">{book.subtitle}</div>
                )}
                <div className="text-xs text-muted-foreground">
                    {book.author}
                    {book.year != null && ` · ${book.year}`}
                    {book.sourceAccessId != null && ` · n° ${book.sourceAccessId}`}
                    {' · '}
                    <span className={`rounded px-1.5 py-0.5 ${getAudioLinkStatusColor(book.audioLinkStatus)}`}>
                        {getAudioLinkStatusLabel(book.audioLinkStatus)}
                        {book.audioTrackCount != null && ` (${book.audioTrackCount})`}
                    </span>
                </div>
                {book.audioFilepath && (
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                        {book.audioFilepath}
                    </div>
                )}
            </div>
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {book.reason === 'numero' ? 'même n° de dossier' : 'même titre'}
            </span>
            <Button size="sm" disabled={busy || blocked} onClick={() => onLink(book.id)}>
                <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" /> Rattacher
                </span>
            </Button>
            {blocked && (
                <p className="w-full text-xs text-amber-700 dark:text-amber-300">
                    Ce livre a déjà un dossier audio qui fonctionne — ce dossier orphelin en est
                    probablement une copie. Vérifiez en écoutant, puis écartez-le.
                </p>
            )}
        </div>
    );
}

interface OrphanCardProps {
    orphan: OrphanRow;
    tab: OrphanTab;
    busy: boolean;
    onListen: (id: number) => void;
    onLink: (orphanId: number, bookId: number) => void;
    onCreate: (orphan: OrphanRow) => void;
    onDismiss: (orphan: OrphanRow) => void;
    onUnlink: (orphanId: number) => void;
    onRestore: (orphanId: number) => void;
}

/**
 * One catalogue hit in the manual search. Deliberately verbose: this list is
 * where a folder gets attached to the wrong book, and every line here is one
 * fewer reason to guess — subtitle, author, year, Access number, and whether
 * the book already carries audio (a hit that does is almost always the sign
 * that this orphan is a duplicate).
 */
function BookHitRow({ book }: { book: BookHit }) {
    const status = book.audioLinkStatus ?? AudioLinkStatus.UNVERIFIED;
    const year = yearOf(book.publishedDate);

    return (
        <>
            <div className="font-medium">
                #{book.id} — {book.title}
            </div>
            {book.subtitle?.trim() && (
                <div className="text-sm italic text-foreground/80">{book.subtitle}</div>
            )}
            <div className="text-sm text-muted-foreground">
                {book.author}
                {year != null && ` · ${year}`}
                {book.source_access_id != null && ` · n° ${book.source_access_id}`}
            </div>
            <div className="mt-1">
                <span className={`rounded px-1.5 py-0.5 text-xs ${getAudioLinkStatusColor(status)}`}>
                    {getAudioLinkStatusLabel(status)}
                    {book.audioTrackCount != null && ` (${book.audioTrackCount})`}
                </span>
            </div>
        </>
    );
}

function OrphanCard({
    orphan,
    tab,
    busy,
    onListen,
    onLink,
    onCreate,
    onDismiss,
    onUnlink,
    onRestore,
}: OrphanCardProps) {
    const [manual, setManual] = useState<BookHit | null>(null);
    const artefact = isNasArtefact(orphan.prefix);

    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base">{orphan.title}</CardTitle>
                        <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {orphan.folderNum != null && (
                                <span className="rounded bg-muted px-2 py-0.5">n° {orphan.folderNum}</span>
                            )}
                            {orphan.year != null && (
                                <span className="rounded bg-muted px-2 py-0.5">{orphan.year}</span>
                            )}
                            <span>
                                {orphan.trackCount} fichier{orphan.trackCount > 1 ? 's' : ''}
                            </span>
                            <span>{formatBytes(orphan.bytes)}</span>
                            <span>vu le {formatDate(orphan.lastSeenAt)}</span>
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onListen(orphan.id)}
                    >
                        <span className="flex items-center gap-2">
                            <Headphones className="h-4 w-4" /> Écouter
                        </span>
                    </Button>
                </div>

                <p className="font-mono text-xs text-muted-foreground break-all">{orphan.prefix}</p>

                {artefact && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            Dossier système du NAS (corbeille <code>#recycle</code> ou copie de
                            conflit Cloud Sync) : il s’agit d’une copie supprimée ou dupliquée.
                            Écoutez-la avant de décider — elle ne contient pas toujours le même
                            enregistrement que le dossier vivant du même numéro.
                        </span>
                    </div>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                {tab === 'rattaches' && orphan.linkedBook && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-500/40 bg-green-500/10 p-3">
                        <p className="text-sm text-foreground">
                            Rattaché à{' '}
                            <span className="font-medium">
                                #{orphan.linkedBook.id} — {bookLabel(orphan.linkedBook)}
                            </span>{' '}
                            <span className="text-muted-foreground">({orphan.linkedBook.author})</span>{' '}
                            le {formatDate(orphan.resolvedAt)}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => onUnlink(orphan.id)}
                        >
                            <span className="flex items-center gap-2">
                                <Link2Off className="h-4 w-4" /> Annuler le rattachement
                            </span>
                        </Button>
                    </div>
                )}

                {tab === 'ecartes' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-field p-3">
                        <p className="text-sm text-muted-foreground">
                            Écarté le {formatDate(orphan.dismissedAt)}. Rien n’a été supprimé du
                            stockage.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRestore(orphan.id)}
                        >
                            <span className="flex items-center gap-2">
                                <RotateCcw className="h-4 w-4" /> Remettre dans la file
                            </span>
                        </Button>
                    </div>
                )}

                {tab === 'a-traiter' && (
                    <>
                        {/* Back in the queue because the book it was attached to no longer
                            exists — without this the note below ("rattaché au livre #…")
                            reads as a contradiction. */}
                        {orphan.resolvedAt && !orphan.linkedBook && (
                            <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs text-orange-800 dark:text-orange-300">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>
                                    Ce dossier avait été rattaché à un livre qui a depuis été
                                    supprimé du catalogue. Il est de nouveau orphelin : à
                                    rattacher à un autre livre.
                                </span>
                            </div>
                        )}

                        {orphan.suggestions.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Livres possibles
                                </p>
                                {orphan.suggestions.map((b) => (
                                    <SuggestionLine
                                        key={b.id}
                                        book={b}
                                        busy={busy}
                                        onLink={(bookId) => onLink(orphan.id, bookId)}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {orphan.suggestions.length > 0 ? 'Ou choisir un autre livre' : 'Choisir un livre'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-[260px] flex-1">
                                    <BookSearchCombobox<BookHit>
                                        value={manual}
                                        onSelect={(b) => {
                                            setManual(b);
                                        }}
                                        renderItem={(b) => <BookHitRow book={b} />}
                                        renderValue={(b) => `#${b.id} — ${bookLabel(b)} · ${b.author}`}
                                        placeholder="Rechercher un livre du catalogue…"
                                    />
                                </div>
                                <Button
                                    disabled={busy || !manual}
                                    onClick={() => manual && onLink(orphan.id, manual.id)}
                                >
                                    <span className="flex items-center gap-2">
                                        <Link2 className="h-4 w-4" /> Rattacher
                                    </span>
                                </Button>
                                <Button variant="outline" disabled={busy} onClick={() => onCreate(orphan)}>
                                    <span className="flex items-center gap-2">
                                        <BookPlus className="h-4 w-4" /> Créer le livre
                                    </span>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => onDismiss(orphan)}
                                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                                >
                                    <span className="flex items-center gap-2">
                                        <EyeOff className="h-4 w-4" /> Écarter
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {orphan.note && (
                    <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                        {orphan.note}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

type Pending =
    | { kind: 'create'; orphan: OrphanRow }
    | { kind: 'dismiss'; orphan: OrphanRow }
    | { kind: 'replace'; orphanId: number; bookId: number; oldPath: string }
    | null;

export default function OrphansClient({
    orphans,
    tab,
    page,
    totalPages,
    total,
    tabCounts,
    search,
}: Props) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState(search);
    const [listenId, setListenId] = useState<number | null>(null);
    const [pending, setPending] = useState<Pending>(null);
    const [newBook, setNewBook] = useState({ title: '', author: '', publishedDate: '', duration: '' });
    const [reason, setReason] = useState('');
    const [isPending, startTransition] = useTransition();
    const [isNavPending, startNav] = useTransition();

    const busy = isPending || isNavPending;

    const run = (fn: () => Promise<ActionResult>, onOk?: () => void) => {
        startTransition(async () => {
            const res = await fn();
            // The link action answers CONFIRM_REPLACE:<chemin> when the target
            // book already carries a path that turned out to be empty — that is
            // a question, not a failure, so it opens a dialogue instead of a
            // red toast.
            if (!res.ok && res.message.startsWith('CONFIRM_REPLACE:')) return;
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            if (res.ok) {
                onOk?.();
                router.refresh();
            }
        });
    };

    const link = (orphanId: number, bookId: number) => {
        startTransition(async () => {
            const res = await linkOrphanToBook(orphanId, bookId);
            if (!res.ok && res.message.startsWith('CONFIRM_REPLACE:')) {
                setPending({
                    kind: 'replace',
                    orphanId,
                    bookId,
                    oldPath: res.message.slice('CONFIRM_REPLACE:'.length),
                });
                return;
            }
            toast({
                title: res.ok ? 'Succès' : 'Erreur',
                description: res.message,
                variant: res.ok ? undefined : 'destructive',
            });
            if (res.ok) router.refresh();
        });
    };

    const navigate = (mutate: (sp: URLSearchParams) => void) => {
        const sp = new URLSearchParams(window.location.search);
        mutate(sp);
        startNav(() => router.push(`/admin/audio-orphelins?${sp.toString()}`));
    };

    const goto = (p: number) => navigate((sp) => sp.set('page', String(p)));

    const selectTab = (t: OrphanTab) =>
        navigate((sp) => {
            sp.set('tab', t);
            sp.delete('page');
        });

    const runSearch = (term: string) =>
        navigate((sp) => {
            if (term.trim()) sp.set('q', term.trim());
            else sp.delete('q');
            // A new search always restarts at page 1.
            sp.delete('page');
        });

    const openCreate = (orphan: OrphanRow) => {
        // The folder name is the best title we have, and it is right often
        // enough to be worth pre-filling — the permanent corrects it after
        // listening. The author is never in the folder name, so it stays empty.
        setNewBook({
            title: orphan.title,
            author: '',
            publishedDate: '',
            duration: '',
        });
        setPending({ kind: 'create', orphan });
    };

    const openDismiss = (orphan: OrphanRow) => {
        setReason(isNasArtefact(orphan.prefix) ? 'Copie de la corbeille du NAS (#recycle)' : '');
        setPending({ kind: 'dismiss', orphan });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="space-y-4">
                    <div>
                        <CardTitle>Dossiers audio orphelins</CardTitle>
                        <CardDescription>
                            Dossiers présents dans le stockage qu’aucun livre du catalogue ne
                            revendique. Rattachez-les à un livre existant, créez le livre manquant,
                            ou écartez-les. Rien n’est jamais déplacé ni supprimé du stockage :
                            seul le chemin enregistré sur le livre change.
                        </CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(TAB_LABELS) as OrphanTab[]).map((t) => (
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
                                placeholder="Rechercher un titre, un chemin ou un numéro de dossier…"
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

            {orphans.length === 0 && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        {search
                            ? `Aucun dossier ne correspond à « ${search} ».`
                            : 'Aucun dossier dans cet onglet.'}
                    </CardContent>
                </Card>
            )}

            {orphans.map((o) => (
                <OrphanCard
                    key={o.id}
                    orphan={o}
                    tab={tab}
                    busy={busy}
                    onListen={setListenId}
                    onLink={link}
                    onCreate={openCreate}
                    onDismiss={openDismiss}
                    onUnlink={(id) => run(() => unlinkOrphan(id))}
                    onRestore={(id) => run(() => restoreOrphan(id))}
                />
            ))}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || busy} onClick={() => goto(page - 1)}>
                        <ChevronLeft className="h-4 w-4" /> Précédent
                    </Button>
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        {isNavPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Page {page} / {totalPages} — {total} dossier{total > 1 ? 's' : ''}
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

            <OrphanAudioModal orphanId={listenId} onOpenChange={(open) => !open && setListenId(null)} />

            {/* --- Create a book for this folder ---------------------------------- */}
            <Dialog
                open={pending?.kind === 'create'}
                onOpenChange={(open) => !open && setPending(null)}
            >
                <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle>Créer un livre pour ce dossier</DialogTitle>
                        <DialogDescription className="break-all font-mono text-xs">
                            {pending?.kind === 'create' ? pending.orphan.prefix : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="orphan-title">Titre *</Label>
                            <Input
                                id="orphan-title"
                                value={newBook.title}
                                onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                                placeholder="Titre du livre"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="orphan-author">Auteur *</Label>
                            <Input
                                id="orphan-author"
                                value={newBook.author}
                                onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                                placeholder="Auteur"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="orphan-date">Date de publication</Label>
                                <Input
                                    id="orphan-date"
                                    type="date"
                                    value={newBook.publishedDate}
                                    onChange={(e) =>
                                        setNewBook({ ...newBook, publishedDate: e.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="orphan-duration">Durée (min)</Label>
                                <Input
                                    id="orphan-duration"
                                    type="number"
                                    min={0}
                                    value={newBook.duration}
                                    onChange={(e) => setNewBook({ ...newBook, duration: e.target.value })}
                                />
                            </div>
                        </div>
                        {pending?.kind === 'create' && pending.orphan.folderNum != null && (
                            <p className="text-xs text-muted-foreground">
                                Le n° {pending.orphan.folderNum} sera enregistré comme identifiant
                                source (Access) s’il est encore libre. Les genres et la description
                                se complètent ensuite depuis la fiche du livre.
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                            Annuler
                        </Button>
                        <Button
                            disabled={busy || !newBook.title.trim() || !newBook.author.trim()}
                            onClick={() => {
                                if (pending?.kind !== 'create') return;
                                const orphanId = pending.orphan.id;
                                run(
                                    () =>
                                        createBookForOrphan(orphanId, {
                                            title: newBook.title,
                                            author: newBook.author,
                                            publishedDate: newBook.publishedDate || undefined,
                                            readingDurationMinutes: newBook.duration || undefined,
                                        }),
                                    () => setPending(null),
                                );
                            }}
                        >
                            {busy ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Création…
                                </span>
                            ) : (
                                'Créer et rattacher'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- Dismiss ------------------------------------------------------- */}
            <Dialog
                open={pending?.kind === 'dismiss'}
                onOpenChange={(open) => !open && setPending(null)}
            >
                <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle>Écarter ce dossier</DialogTitle>
                        <DialogDescription>
                            Le dossier disparaîtra de la file sans que rien ne soit supprimé du
                            stockage. Le motif est conservé pour que la décision reste
                            compréhensible plus tard.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-1">
                        <Label htmlFor="orphan-reason">Motif *</Label>
                        <Textarea
                            id="orphan-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Copie de la corbeille du NAS, doublon d’un dossier déjà rattaché…"
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                            Annuler
                        </Button>
                        <Button
                            disabled={busy || !reason.trim()}
                            onClick={() => {
                                if (pending?.kind !== 'dismiss') return;
                                const orphanId = pending.orphan.id;
                                run(() => dismissOrphan(orphanId, reason), () => setPending(null));
                            }}
                        >
                            Écarter
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- Replace an empty path ----------------------------------------- */}
            <AlertDialog
                open={pending?.kind === 'replace'}
                onOpenChange={(open) => !open && setPending(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remplacer le chemin actuel ?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <p>
                                    Ce livre pointe déjà vers un dossier, mais celui-ci ne contient
                                    aucun fichier audio :
                                </p>
                                <p className="break-all font-mono text-xs">
                                    {pending?.kind === 'replace' ? pending.oldPath : ''}
                                </p>
                                <p>
                                    Il sera remplacé par le dossier orphelin. L’ancien chemin est
                                    conservé dans le journal de ce dossier, mais annuler le
                                    rattachement laissera le livre sans dossier plutôt que de le
                                    restaurer.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={() => {
                                if (pending?.kind !== 'replace') return;
                                const { orphanId, bookId } = pending;
                                run(
                                    () => linkOrphanToBook(orphanId, bookId, { confirmReplace: true }),
                                    () => setPending(null),
                                );
                            }}
                        >
                            Remplacer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
