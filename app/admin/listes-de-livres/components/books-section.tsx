import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookPlus, Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, Undo2, X } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { BookModalBackend } from "@/admin/BookModalBackend";
import { EditBookModal } from '@/admin/EditBookModal';
import { RecordLoadError, useRecordLoader } from '@/hooks/useRecordLoader';
import { BookFormData } from "@/admin/BookFormBackendBase";
import { toast } from "@/hooks/use-toast";
import { calendarYear } from '@/lib/calendar-date';
import { parisDate } from '@/lib/paris-day';
import { cn } from '@/lib/utils';
import { ListRef } from './list-membership';
import { BookBadges, ListBook, ListNotes, listBookGroups, orderedListBooks } from './list-book';
import { sectionSpine } from '@/lib/books/genreFamily';
import { ListNoteDialog } from './list-note-dialog';
import { GenreOrderDialog } from './genre-order-dialog';
import { RecentBooksControl, RecentBooksDialog, useRecentWindow } from './recent-books-picker';

interface BooksSectionProps {
    books: ListBook[];
    setBooks: React.Dispatch<React.SetStateAction<ListBook[]>>;
    notes: ListNotes;
    /** Vrai quand genres et livres suivent l'ordre de `books` plutôt que l'alphabet. */
    customOrder: boolean;
    setCustomOrder: (custom: boolean) => void;
    /** Enregistre aussitôt la note d'un livre déjà enregistré dans la liste, sinon la garde pour « Enregistrer ». */
    onSaveNote: (bookId: number, note: string | null) => Promise<void>;
    savesNoteNow: (bookId: number) => boolean;
    /** La liste en cours d'édition, exclue des avertissements « déjà dans ». */
    listId?: number;
}

/**
 * Les livres de la liste — ce qui est dans le tableau est ce qui sera enregistré.
 *
 * Il y avait autrefois un troisième état, « affiché mais décoché », hérité du
 * temps où la page chargeait d'office des centaines de nouveautés à trier. Il
 * fallait alors un compteur « N sélectionnés sur M » pour l'expliquer. Tous les
 * ajouts étant désormais délibérés (nouveautés, recherche, nouvelle fiche), une
 * ligne est dans la liste ou n'y est pas : on la retire, et les cases ne servent
 * qu'à retirer plusieurs livres d'un coup.
 */
export default function BooksSection({ books, setBooks, notes, customOrder, setCustomOrder, onSaveNote, savesNoteNow, listId }: BooksSectionProps) {
    const win = useRecentWindow();
    const [isRecentOpen, setIsRecentOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [noteBook, setNoteBook] = useState<ListBook | null>(null);
    // Le dernier retrait, pour « Annuler » : l'état complet d'avant, effacé dès
    // que la liste change autrement.
    const [undo, setUndo] = useState<{ snapshot: ListBook[]; count: number } | null>(null);

    // Les listes qui contiennent déjà chaque livre, la liste en cours
    // d'édition exclue — elle n'est pas « une autre liste ». Chargée une fois
    // au montage : voir /api/listes-de-livres/memberships pour pourquoi tout
    // arrive d'un bloc plutôt que par identifiants.
    const [membership, setMembership] = useState<Map<number, ListRef[]>>(new Map());

    useEffect(() => {
        const loadMemberships = async () => {
            try {
                const response = await fetch('/api/listes-de-livres/memberships');
                if (!response.ok) return;

                const data: {
                    lists?: Record<string, { title: string; active: boolean }>;
                    books?: Record<string, number[]>;
                } = await response.json();

                const next = new Map<number, ListRef[]>();
                Object.entries(data.books ?? {}).forEach(([bookId, listIds]) => {
                    const refs = listIds
                        .filter((id) => id !== listId)
                        .map((id) => ({
                            id,
                            title: data.lists?.[id]?.title ?? `n°${id}`,
                            active: data.lists?.[id]?.active ?? true,
                        }));
                    if (refs.length > 0) next.set(Number(bookId), refs);
                });
                setMembership(next);
            } catch (error) {
                // L'avertissement est un confort : son absence ne doit pas
                // empêcher de composer la liste.
                console.error('Error loading coups de coeur memberships:', error);
            }
        };

        void loadMemberships();
    }, [listId]);

    const inListIds = useMemo(() => new Set(books.map((book) => book.id)), [books]);
    // Une case cochée sur un livre retiré entre-temps ne compte plus.
    const selectedIds = books.filter((book) => selected.has(book.id)).map((book) => book.id);
    const allSelected = books.length > 0 && selectedIds.length === books.length;
    const alreadyListed = books.filter((book) => membership.has(book.id));

    /**
     * Ajouts délibérés, sans doublon. Le tableau est rangé par genre : en ordre
     * alphabétique, un livre ajouté prend sa place d'office ; en ordre choisi,
     * il arrive à la fin de son genre (ou son genre, nouveau, à la fin).
     */
    const addBooks = (incoming: ListBook[]) => {
        if (incoming.length === 0) return;
        const ids = new Set(incoming.map((book) => book.id));
        setBooks((prev) => [...prev.filter((book) => !ids.has(book.id)), ...incoming]);
        setUndo(null);
    };

    // ── ordre ────────────────────────────────────────────────────────────
    // Les genres une fois chacun, dans l'ordre du site et du PDF. Déplacer un
    // genre emporte ses livres ; un livre ne bouge qu'au sein de son genre.
    const groups = useMemo(() => listBookGroups(books, customOrder), [books, customOrder]);
    // Après un déplacement, le focus revient sur le bouton utilisé : la ligne a
    // changé de place dans le DOM, et le focus serait tombé sur la page.
    const pendingFocus = useRef<string | null>(null);
    const [moveMessage, setMoveMessage] = useState('');
    useEffect(() => {
        const key = pendingFocus.current;
        if (!key) return;
        pendingFocus.current = null;
        document.querySelector<HTMLElement>(`[data-move="${key}"]`)?.focus();
    });
    const setFocusKey = (key: string) => {
        pendingFocus.current = key;
    };

    const applyOrder = (next: [string, ListBook[]][]) => {
        setBooks(next.flatMap(([, group]) => group));
        setCustomOrder(true);
    };

    const moveGenre = (index: number, step: -1 | 1, key: string) => {
        const target = index + step;
        if (target < 0 || target >= groups.length) return;
        const next = [...groups];
        [next[index], next[target]] = [next[target], next[index]];
        applyOrder(next);
        setFocusKey(key);
        setMoveMessage(`Genre « ${groups[index][0]} » déplacé vers le ${step < 0 ? 'haut' : 'bas'}.`);
    };

    const moveBook = (genreIndex: number, bookIndex: number, step: -1 | 1, key: string) => {
        const group = groups[genreIndex][1];
        const target = bookIndex + step;
        if (target < 0 || target >= group.length) return;
        const moved = [...group];
        [moved[bookIndex], moved[target]] = [moved[target], moved[bookIndex]];
        applyOrder(groups.map((entry, i) => (i === genreIndex ? [entry[0], moved] : entry)));
        setFocusKey(key);
        setMoveMessage(`« ${group[bookIndex].title.trim()} » déplacé vers le ${step < 0 ? 'haut' : 'bas'}.`);
    };

    const [isGenreOrderOpen, setIsGenreOrderOpen] = useState(false);
    const applyGenreOrder = (order: string[]) => {
        const byGenre = new Map(groups);
        applyOrder(order.flatMap((genre) => (byGenre.has(genre) ? [[genre, byGenre.get(genre)!] as [string, ListBook[]]] : [])));
        setIsGenreOrderOpen(false);
        setMoveMessage('Ordre des genres modifié.');
    };

    const resetOrder = () => {
        setBooks(orderedListBooks(books, false));
        setCustomOrder(false);
        setMoveMessage("Ordre alphabétique rétabli.");
    };

    const removeBooks = (ids: number[]) => {
        if (ids.length === 0) return;
        const drop = new Set(ids);
        setUndo({ snapshot: books, count: ids.length });
        setBooks(books.filter((book) => !drop.has(book.id)));
        setSelected((prev) => new Set([...prev].filter((id) => !drop.has(id))));
    };

    const fetchBooksByIds = async (ids: number[]): Promise<ListBook[]> => {
        const response = await fetch(`/api/books?ids=${ids.join(',')}`);
        if (!response.ok) throw new Error('Failed to fetch books');
        const data = await response.json();
        return data.books ?? [];
    };

    const handleBookCreated = async (newBookId: number) => {
        try {
            addBooks(await fetchBooksByIds([newBookId]));
        } catch (error) {
            console.error('Error loading the created book:', error);
            toast({ title: "Ajout à la liste impossible", description: "Le livre a été créé, mais n'a pas pu être ajouté à la liste.", variant: "destructive" });
        }
    };

    // The modal opens at once on its skeleton; the fiche loads in one request.
    const loadBookForEdit = async (bookId: string, signal: AbortSignal): Promise<BookFormData> => {
        const response = await fetch(`/api/books/${bookId}`, { signal });
        if (!response.ok) {
            // Never « réessayer » on a 404: the book is gone and retrying
            // cannot change that. A fusion re-points this list onto the
            // surviving fiche, so there is nothing to forward to here.
            if (response.status === 404) {
                throw new RecordLoadError(
                    `Le livre n°${bookId} n’existe plus. Rafraîchissez la liste : ` +
                    `il a pu être supprimé ou fusionné depuis son affichage.`
                );
            }
            throw new Error('Failed to fetch book details');
        }
        const details = await response.json();
        return {
            title: details.title || '',
            subtitle: details.subtitle || '',
            author: details.author || '',
            publisher: details.publisher || '',
            // UTC year: this field is saved back verbatim, so a local read
            // shifts the date on every edit west of Greenwich.
            publishedYear: (calendarYear(details.publishedDate) ?? '').toString(),
            genres: details.genres.map((g: { genre: { id: number | string } }) => g.genre.id.toString()),
            isbn: details.isbn || '',
            description: details.description || '',
            available: Boolean(details.available),
            hiddenFromCatalogue: Boolean(details.hiddenFromCatalogue),
            readingDurationMinutes: details.readingDurationMinutes?.toString() || '',
            pageCount: details.pageCount,
        };
    };
    const bookLoader = useRecordLoader(loadBookForEdit);
    const editingId = bookLoader.openId ? Number(bookLoader.openId) : null;

    const handleBookEdited = async () => {
        if (editingId === null) return;
        try {
            const [fresh] = await fetchBooksByIds([editingId]);
            if (fresh) setBooks((prev) => prev.map((book) => (book.id === fresh.id ? fresh : book)));
        } catch (error) {
            console.error('Error refreshing book data:', error);
        }
    };

    const handleBookDeleted = (deletedBookId: number) => {
        setBooks((prev) => prev.filter((book) => book.id !== deletedBookId));
        setUndo(null);
    };

    const isEmpty = books.length === 0;

    const addButtons = (
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setIsSearchOpen(true)}>
                <Search /> Rechercher un livre
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setIsCreateOpen(true)}>
                <BookPlus /> Créer une fiche
            </Button>
        </div>
    );

    return (
        <Card className="bg-card border-border">
            <CardHeader className="gap-4 space-y-0 border-b border-border pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                            Livres
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                {books.length}
                            </span>
                        </CardTitle>
                        {!isEmpty && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {customOrder ? (
                                    <>
                                        Ordre choisi ·{' '}
                                        <button
                                            type="button"
                                            className="underline underline-offset-2 hover:text-foreground"
                                            onClick={resetOrder}
                                        >
                                            Rétablir l&apos;ordre alphabétique
                                        </button>
                                    </>
                                ) : (
                                    'Par genre, puis par titre. Les flèches changent l’ordre.'
                                )}
                                {groups.length > 1 && (
                                    <>
                                        {' · '}
                                        <button
                                            type="button"
                                            className="underline underline-offset-2 hover:text-foreground"
                                            onClick={() => setIsGenreOrderOpen(true)}
                                        >
                                            Ordre des genres
                                        </button>
                                    </>
                                )}
                            </p>
                        )}
                        {/* Annonce les déplacements au lecteur d'écran. */}
                        <p className="sr-only" aria-live="polite">{moveMessage}</p>
                    </div>
                    {isEmpty && addButtons}
                </div>
                {/* Les trois façons d'ajouter un livre sur une même ligne. Tant
                    que la liste est vide, les nouveautés s'affichent en grand
                    plus bas et les deux boutons restent seuls en haut. */}
                {!isEmpty && (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <RecentBooksControl win={win} onOpen={() => setIsRecentOpen(true)} listId={listId} />
                        {addButtons}
                    </div>
                )}
            </CardHeader>

            <CardContent className="p-0">
                {isEmpty ? (
                    <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
                        <div>
                            <p className="text-base font-medium text-foreground">Cette liste ne contient encore aucun livre</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Commencez par les nouveautés parues depuis la dernière liste, ou recherchez un livre du catalogue.
                            </p>
                        </div>
                        <RecentBooksControl win={win} onOpen={() => setIsRecentOpen(true)} listId={listId} size="hero" />
                    </div>
                ) : (
                    <>
                        {/* Barre contextuelle : sélection, retrait annulable, avertissement.
                            Toujours affichée, à hauteur fixe : apparaître à la première
                            case cochée décalait les lignes, et le clic suivant tombait
                            sur le livre d'en dessous. */}
                            <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/40 px-4 py-1.5 text-sm">
                                {selectedIds.length > 0 ? (
                                    <>
                                        <span className="font-medium text-foreground">
                                            {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}
                                        </span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                                            onClick={() => removeBooks(selectedIds)}
                                        >
                                            <X /> Retirer de la liste
                                        </Button>
                                        <button
                                            type="button"
                                            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                            onClick={() => setSelected(new Set())}
                                        >
                                            Désélectionner
                                        </button>
                                    </>
                                ) : undo ? (
                                    <>
                                        <span className="text-muted-foreground">
                                            {undo.count} livre{undo.count > 1 ? 's' : ''} retiré{undo.count > 1 ? 's' : ''} de la liste.
                                        </span>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline underline-offset-2"
                                            onClick={() => {
                                                setBooks(undo.snapshot);
                                                setUndo(null);
                                            }}
                                        >
                                            <Undo2 className="h-3.5 w-3.5" /> Annuler
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Cochez des livres pour les retirer en une fois.
                                    </span>
                                )}
                                {/* Un avertissement, pas une règle : republier un titre est
                                    parfois voulu (une lecture reprise, une liste thématique).
                                    Rien n'est donc retiré d'office — mais le retrait tient en
                                    un clic, et s'annule. */}
                                {selectedIds.length === 0 && alreadyListed.length > 0 && (
                                    <span className="text-amber-700 dark:text-amber-400 sm:ml-auto">
                                        {alreadyListed.length === 1
                                            ? '1 livre figure déjà dans une autre liste.'
                                            : `${alreadyListed.length} livres figurent déjà dans une autre liste.`}{' '}
                                        <button
                                            type="button"
                                            className="font-medium underline underline-offset-2 hover:text-foreground"
                                            onClick={() => removeBooks(alreadyListed.map((book) => book.id))}
                                        >
                                            {alreadyListed.length === 1 ? 'Le retirer' : 'Les retirer'}
                                        </button>
                                    </span>
                                )}
                            </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b border-border hover:bg-transparent">
                                        <TableHead className="w-10 pl-4">
                                            <Checkbox
                                                aria-label="Tout sélectionner"
                                                checked={allSelected}
                                                onCheckedChange={(value) =>
                                                    setSelected(value === true ? new Set(books.map((book) => book.id)) : new Set())
                                                }
                                            />
                                        </TableHead>
                                        <TableHead className="text-foreground font-medium">Titre</TableHead>
                                        <TableHead className="hidden text-foreground font-medium md:table-cell">Auteur</TableHead>
                                        <TableHead className="hidden text-foreground font-medium whitespace-nowrap md:table-cell">Ajouté au catalogue</TableHead>
                                        <TableHead className="w-44 pr-4"><span className="sr-only">Actions</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.map(([genre, group], genreIndex) => (
                                    <React.Fragment key={genre}>
                                        {/* Le genre, comme sur le site : sa couleur de dos,
                                            son nom, et de quoi le déplacer avec ses livres. */}
                                        <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                                            <TableCell colSpan={5} className="py-2 pl-4 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span aria-hidden="true" className={`block h-4 w-1.5 shrink-0 rounded-[1px] ${sectionSpine(genreIndex)}`} />
                                                    <span className="text-sm font-semibold text-foreground">{genre}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {group.length} {group.length === 1 ? 'livre' : 'livres'}
                                                    </span>
                                                    {groups.length > 1 && (
                                                        <MoveButtons
                                                            className="ml-auto"
                                                            subject={`le genre « ${genre} »`}
                                                            moveKey={`genre:${genre}`}
                                                            canUp={genreIndex > 0}
                                                            canDown={genreIndex < groups.length - 1}
                                                            onMove={(step, key) => moveGenre(genreIndex, step, key)}
                                                        />
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    {group.map((book, bookIndex) => {
                                        const isSelected = selected.has(book.id);
                                        return (
                                            <TableRow
                                                key={book.id}
                                                className={cn(
                                                    'group border-b border-border last:border-0',
                                                    isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                                                )}
                                            >
                                                <TableCell className="pl-4">
                                                    <Checkbox
                                                        aria-label={`Sélectionner « ${book.title} »`}
                                                        checked={isSelected}
                                                        onCheckedChange={() =>
                                                            setSelected((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(book.id)) next.delete(book.id);
                                                                else next.add(book.id);
                                                                return next;
                                                            })
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    <div className="font-medium">{book.title}</div>
                                                    <div className="text-xs text-muted-foreground md:hidden">{book.author}</div>
                                                    <BookBadges book={book} membership={membership.get(book.id)} />
                                                    {/* La note et son action sous le titre, en mots : une icône
                                                        de plus à côté du crayon de la fiche se confondait avec
                                                        lui, et une note de liste écrite dans la fiche part au
                                                        catalogue et dans toutes les listes.
                                                        « Ajouter une note », écrit sur chaque ligne, se lisait
                                                        cinquante fois par liste : il n'apparaît plus qu'au
                                                        survol ou au clavier (toujours sur un écran tactile,
                                                        qui n'a pas de survol). « Modifier la note » reste. */}
                                                    {notes[book.id] && (
                                                        <p className="mt-1 whitespace-pre-wrap text-sm italic text-muted-foreground">
                                                            {notes[book.id]}
                                                        </p>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            'mt-1 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline',
                                                            !notes[book.id] &&
                                                                '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'
                                                        )}
                                                        onClick={() => setNoteBook(book)}
                                                        aria-label={`${notes[book.id] ? 'Modifier la note' : 'Ajouter une note'} pour « ${book.title} »`}
                                                    >
                                                        {notes[book.id] ? (
                                                            'Modifier la note'
                                                        ) : (
                                                            <>
                                                                <Plus className="h-3 w-3" aria-hidden="true" /> Ajouter une note
                                                            </>
                                                        )}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="hidden text-muted-foreground md:table-cell">{book.author}</TableCell>
                                                <TableCell className="hidden text-muted-foreground whitespace-nowrap md:table-cell">
                                                    {parisDate(book.createdAt)}
                                                </TableCell>
                                                <TableCell className="pr-4">
                                                    <div className="flex justify-end gap-1">
                                                        {group.length > 1 && (
                                                            <MoveButtons
                                                                subject={`« ${book.title.trim()} »`}
                                                                moveKey={`book:${book.id}`}
                                                                canUp={bookIndex > 0}
                                                                canDown={bookIndex < group.length - 1}
                                                                onMove={(step, key) => moveBook(genreIndex, bookIndex, step, key)}
                                                            />
                                                        )}
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                            onClick={() => bookLoader.open(book.id.toString())}
                                                            title="Modifier la fiche du livre"
                                                            aria-label={`Modifier la fiche de « ${book.title} »`}
                                                        >
                                                            <Pencil />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                                            onClick={() => removeBooks([book.id])}
                                                            title="Retirer de la liste"
                                                            aria-label={`Retirer « ${book.title} » de la liste`}
                                                        >
                                                            <X />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}
            </CardContent>

            {isRecentOpen && (
                <RecentBooksDialog
                    win={win}
                    onClose={() => setIsRecentOpen(false)}
                    inListIds={inListIds}
                    membership={membership}
                    onAdd={addBooks}
                />
            )}

            {isGenreOrderOpen && (
                <GenreOrderDialog
                    genres={groups.map(([name, group]) => ({ name, count: group.length }))}
                    onClose={() => setIsGenreOrderOpen(false)}
                    onApply={applyGenreOrder}
                />
            )}

            {noteBook && (
                <ListNoteDialog
                    key={noteBook.id}
                    bookTitle={noteBook.title}
                    note={notes[noteBook.id] ?? null}
                    savesNow={savesNoteNow(noteBook.id)}
                    onClose={() => setNoteBook(null)}
                    onSave={async (note) => {
                        await onSaveNote(noteBook.id, note);
                        // Dit, puisque c'est le seul geste de la page qui n'attend pas « Enregistrer ».
                        if (savesNoteNow(noteBook.id)) {
                            toast({ title: note ? 'Note enregistrée' : 'Note supprimée' });
                        }
                        setNoteBook(null);
                    }}
                />
            )}

            {isSearchOpen && (
                <SearchBooksDialog
                    onClose={() => setIsSearchOpen(false)}
                    inListIds={inListIds}
                    membership={membership}
                    onAdd={(book) => addBooks([book])}
                />
            )}

            <BookModalBackend
                isOpen={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onBookAdded={handleBookCreated}
            />

            {bookLoader.openId && (
                <EditBookModal
                    key={bookLoader.openId}
                    isOpen
                    onOpenChange={(open) => { if (!open) bookLoader.close(); }}
                    bookId={bookLoader.openId}
                    initialData={bookLoader.data}
                    error={bookLoader.error}
                    onBookEdited={handleBookEdited}
                    onBookDeleted={handleBookDeleted}
                />
            )}
        </Card>
    );
}

/**
 * Monter / descendre, pour un genre ou un livre. Au bout de son groupe, la
 * flèche reste focalisable (`aria-disabled`, pas `disabled`) : un livre monté
 * en tête aurait fait tomber le focus sur la page. `data-move` permet de
 * remettre le focus sur le bouton après le déplacement de sa ligne.
 */
function MoveButtons({
    subject,
    moveKey,
    canUp,
    canDown,
    onMove,
    className,
}: {
    /** « le genre « Romans » » ou « « Titre » » — complète le nom du bouton. */
    subject: string;
    moveKey: string;
    canUp: boolean;
    canDown: boolean;
    onMove: (step: -1 | 1, key: string) => void;
    className?: string;
}) {
    const arrow = 'h-8 w-8 text-muted-foreground hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent';
    return (
        <div className={cn('flex gap-0.5', className)}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className={arrow}
                data-move={`${moveKey}:up`}
                aria-disabled={!canUp || undefined}
                onClick={() => canUp && onMove(-1, `${moveKey}:up`)}
                title="Monter"
                aria-label={`Monter ${subject}`}
            >
                <ChevronUp />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className={arrow}
                data-move={`${moveKey}:down`}
                aria-disabled={!canDown || undefined}
                onClick={() => canDown && onMove(1, `${moveKey}:down`)}
                title="Descendre"
                aria-label={`Descendre ${subject}`}
            >
                <ChevronDown />
            </Button>
        </div>
    );
}

interface SearchBooksDialogProps {
    onClose: () => void;
    inListIds: Set<number>;
    membership: Map<number, ListRef[]>;
    onAdd: (book: ListBook) => void;
}

/**
 * Recherche dans tout le catalogue, disponible ou non. Reste ouverte après un
 * ajout : on cherche rarement un seul livre.
 */
function SearchBooksDialog({ onClose, inListIds, membership, onAdd }: SearchBooksDialogProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 400);
    const [results, setResults] = useState<ListBook[]>([]);
    const [searchedTerm, setSearchedTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!debouncedSearchTerm) return;
        let active = true;
        const searchBooks = async () => {
            setIsSearching(true);
            try {
                const params = new URLSearchParams({ search: debouncedSearchTerm, limit: '30' });
                const response = await fetch(`/api/books?${params.toString()}`);
                if (response.ok && active) {
                    const data = await response.json();
                    setResults(data.books ?? []);
                    setSearchedTerm(debouncedSearchTerm);
                }
            } catch (error) {
                console.error('Erreur lors de la recherche:', error);
            } finally {
                if (active) setIsSearching(false);
            }
        };
        void searchBooks();
        return () => {
            active = false;
        };
    }, [debouncedSearchTerm]);

    const shown = searchTerm ? results : [];

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col gap-0 p-0 bg-card border-border">
                <DialogHeader className="space-y-3 border-b border-border px-6 py-4">
                    <div>
                        <DialogTitle className="text-foreground">Rechercher un livre</DialogTitle>
                        <DialogDescription>Dans tout le catalogue — cliquez sur un livre pour l&apos;ajouter.</DialogDescription>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            autoFocus
                            placeholder="Titre, auteur ou ISBN…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-field border-border text-foreground placeholder:text-muted-foreground"
                        />
                        {isSearching && (
                            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                        )}
                    </div>
                </DialogHeader>
                <div className="min-h-[10rem] flex-1 overflow-y-auto p-2">
                    {!searchTerm ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                            Tapez un titre, un auteur ou un ISBN.
                        </p>
                    ) : shown.length === 0 ? (
                        !isSearching && searchedTerm === debouncedSearchTerm && (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                Aucun livre trouvé correspondant à votre recherche.
                            </p>
                        )
                    ) : (
                        <ul className="divide-y divide-border">
                            {shown.map((book) => {
                                const alreadyHere = inListIds.has(book.id);
                                return (
                                    <li key={book.id}>
                                        <button
                                            type="button"
                                            disabled={alreadyHere}
                                            onClick={() => onAdd(book)}
                                            className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className={cn('font-medium text-foreground', alreadyHere && 'text-muted-foreground')}>
                                                    {book.title}
                                                    <span className="font-normal text-muted-foreground"> — {book.author}</span>
                                                </div>
                                                <BookBadges book={{ ...book, subtitle: null }} membership={membership.get(book.id)} />
                                            </div>
                                            {alreadyHere ? (
                                                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                                    <Check className="h-3.5 w-3.5" /> Dans la liste
                                                </span>
                                            ) : (
                                                <span className="shrink-0 text-xs font-medium text-primary">Ajouter</span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
