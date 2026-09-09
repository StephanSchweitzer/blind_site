import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/custom-switch";
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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useDebounce } from 'use-debounce';
import { calendarYear } from '@/lib/calendar-date';
import { AddBookButtonBackend } from "@/admin/BookModalBackend";
import { EditBookModal } from '@/admin/EditBookModal';
import { BookFormData } from "@/admin/BookFormBackendBase";
import { toast } from "@/hooks/use-toast";
import { parisDate, parisDayKey } from '@/lib/paris-day';

interface Book {
    id: number;
    title: string;
    subtitle: string;
    author: string;
    isbn: string | null;
    createdAt: Date;
    hiddenFromCatalogue?: boolean;
}

interface BookSelectorProps {
    selectedBooks?: number[];
    onSelectedBooksChange: (bookIds: number[]) => void;
    mode: 'edit' | 'create';
    coupDeCoeurId?: number;
    onDialogOpenChange?: (open: boolean) => void;
    isOpen?: boolean;
}

interface BookTableProps {
    books: Book[];
    isSearchResults?: boolean;
    isLoading: boolean;
    displayedBookIds: number[];
    selectedBooks: number[];
    areAllSelected: (books: Book[]) => boolean;
    handleSelectAll: (checked: boolean, books: Book[]) => void;
    toggleBookSelection: (bookId: number, forceAdd?: boolean) => void;
    handleRowClick: (book: Book) => void;
}

function BookTable({
                       books,
                       isSearchResults = false,
                       isLoading,
                       displayedBookIds,
                       selectedBooks,
                       areAllSelected,
                       handleSelectAll,
                       toggleBookSelection,
                       handleRowClick,
                   }: BookTableProps) {
    return (
        <Table>
            <TableHeader className="bg-card">
                <TableRow className="border-b border-border">
                    <TableHead className="text-foreground font-medium">
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`select-all-${isSearchResults ? 'search' : 'main'}`}
                                checked={areAllSelected(books)}
                                onChange={(checked) => handleSelectAll(checked, books)}
                                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
                            />
                            <label htmlFor={`select-all-${isSearchResults ? 'search' : 'main'}`} className="text-sm font-medium text-foreground">
                                Tout sélectionner
                            </label>
                        </div>
                    </TableHead>
                    <TableHead className="text-foreground font-medium">Titre</TableHead>
                    <TableHead className="text-foreground font-medium">Auteur</TableHead>
                    <TableHead className="text-foreground font-medium">ISBN</TableHead>
                    <TableHead className="text-foreground font-medium">Date d&apos;ajout</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {books.map((book) => (
                    <TableRow
                        key={book.id}
                        className={`
                            border-b border-border 
                            hover:bg-muted 
                            ${isLoading ? '[&]:hover:cursor-wait' : 'cursor-pointer'}
                            ${isSearchResults && displayedBookIds.includes(book.id) ? "opacity-50" : ""}
                        `}
                        onClick={() => {
                            if (isSearchResults) {
                                toggleBookSelection(book.id, true);
                            } else {
                                handleRowClick(book);
                            }
                        }}
                    >
                        <TableCell
                            className="text-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            <Switch
                                id={`book-${book.id}`}
                                checked={selectedBooks.includes(book.id)}
                                onChange={() => toggleBookSelection(book.id)}
                                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
                            />
                        </TableCell>
                        <TableCell className="text-foreground">
                            <div className="flex flex-col">
                                <span>
                                    {book.title}
                                    {book.hiddenFromCatalogue && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            (masqué du catalogue public)
                                        </span>
                                    )}
                                </span>
                                {isSearchResults && displayedBookIds.includes(book.id) && (
                                    <span className="text-sm text-muted-foreground">
                                        Ce livre appartient déjà à la liste
                                    </span>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-foreground">{book.author}</TableCell>
                        <TableCell className="text-foreground">{book.isbn || 'N/A'}</TableCell>
                        <TableCell className="text-foreground">
                            {parisDate(book.createdAt)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

export default function BookSelector({
                                         selectedBooks = [],
                                         onSelectedBooksChange,
                                         mode,
                                         coupDeCoeurId,
                                         onDialogOpenChange,
                                         isOpen = false
                                     }: BookSelectorProps) {
    const [bookDetailsMap, setBookDetailsMap] = useState<Map<number, Book>>(new Map());
    const [displayedBookIds, setDisplayedBookIds] = useState<number[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 700);
    const [searchResults, setSearchResults] = useState<Book[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    // Garde de premier chargement — un ref, pas un state : elle ne s'affiche
    // nulle part, et un setState ici tomberait sous react-hooks/set-state-in-effect.
    const initialLoadDone = useRef(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedBookForEdit, setSelectedBookForEdit] = useState<(Book & { formData: BookFormData }) | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // La fenêtre des nouveautés (mode création).
    //
    // `since` est le jour parisien affiché dans le champ ; vide tant que la
    // première réponse n'a pas dit quelle coupure s'applique par défaut.
    // `suggestedIdsRef` retient ce que la suggestion précédente avait apporté,
    // pour qu'un changement de date remplace CES livres-là sans emporter ceux
    // que le permanent a ajoutés à la main.
    const [since, setSince] = useState('');
    const [windowLabel, setWindowLabel] = useState<{ defaultSince: string | null; defaultLabel: string | null } | null>(null);
    const [matchingTotal, setMatchingTotal] = useState<number | null>(null);
    const [suggestedCount, setSuggestedCount] = useState(0);
    // Vrai dès le départ en création : le montage enchaîne sur un chargement.
    // Le poser ici plutôt que dans l'effet évite le rendu supplémentaire — et
    // le setState synchrone que react-hooks/set-state-in-effect refuse.
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(mode === 'create');
    const suggestedIdsRef = useRef<number[]>([]);

    // Miroir de la sélection courante, pour que loadSuggestions lise toujours
    // la dernière valeur sans se recréer à chaque coche.
    const selectedRef = useRef(selectedBooks);
    useEffect(() => {
        selectedRef.current = selectedBooks;
    }, [selectedBooks]);

    useEffect(() => {
        document.body.style.cursor = isLoading ? 'wait' : 'default';
        return () => {
            document.body.style.cursor = 'default';
        };
    }, [isLoading]);

    /**
     * (Re)charge la suggestion « nouveautés depuis <date> ».
     *
     * Appelée au montage sans date — le serveur applique alors la dernière
     * liste publiée et dit laquelle — puis à chaque changement du champ.
     *
     * Le remplacement est chirurgical : seuls les livres venus de la
     * suggestion précédente s'en vont. Un livre ajouté à la main via
     * « Ajouter un livre existant » ou « Ajouter un nouveau livre » reste
     * affiché et coché, quelle que soit la date choisie ensuite — sans quoi
     * déplacer la coupure ferait disparaître un ajout délibéré.
     */
    const loadSuggestions = useCallback(async (sinceDay: string | null) => {
        try {
            const params = new URLSearchParams({ recent: 'true', limit: '1000' });
            if (sinceDay) params.append('since', sinceDay);

            const response = await fetch(`/api/books?${params.toString()}`);
            if (!response.ok) return;

            const data = await response.json();
            const books: Book[] = data.books ?? [];
            const suggestedIds = books.map((book) => book.id);
            const previous = suggestedIdsRef.current;

            setBookDetailsMap((prev) => {
                const next = new Map(prev);
                books.forEach((book) => next.set(book.id, book));
                return next;
            });

            const isSuggested = new Set(suggestedIds);
            const wasSuggested = new Set(previous);

            // Les ajouts manuels restent en tête : ce sont des choix
            // délibérés, et les enterrer sous cent suggestions reviendrait
            // presque à les perdre.
            const keep = (id: number) => !wasSuggested.has(id) && !isSuggested.has(id);

            setDisplayedBookIds((prev) => [
                ...prev.filter(keep),
                ...suggestedIds,
            ]);

            onSelectedBooksChange([
                ...selectedRef.current.filter(keep),
                ...suggestedIds,
            ]);

            suggestedIdsRef.current = suggestedIds;
            setSuggestedCount(suggestedIds.length);
            setMatchingTotal(typeof data.total === 'number' ? data.total : null);
            if (data.recentWindow) {
                setWindowLabel({
                    defaultSince: data.recentWindow.defaultSince,
                    defaultLabel: data.recentWindow.defaultLabel,
                });
                if (data.recentWindow.since) {
                    setSince(parisDayKey(new Date(data.recentWindow.since)));
                }
            }
        } catch (error) {
            console.error('Error loading books:', error);
        } finally {
            setIsLoadingSuggestions(false);
        }
    }, [onSelectedBooksChange]);

    useEffect(() => {
        if (initialLoadDone.current) return;
        initialLoadDone.current = true;

        // Le fetch vit dans une fonction async définie ici, comme partout
        // ailleurs dans ce fichier : l'effet ne fait que la lancer.
        const fetchInitialBooks = async () => {
            if (mode === 'create') {
                await loadSuggestions(null);
                return;
            }

            if (selectedBooks.length === 0) return;
            try {
                const response = await fetch(`/api/books?ids=${selectedBooks.join(',')}`);
                if (response.ok) {
                    const data = await response.json();
                    setBookDetailsMap(new Map<number, Book>(
                        data.books.map((book: Book) => [book.id, book])
                    ));
                    setDisplayedBookIds(data.books.map((book: Book) => book.id));
                }
            } catch (error) {
                console.error('Error loading books:', error);
            }
        };

        void fetchInitialBooks();
    }, [mode, coupDeCoeurId, loadSuggestions, selectedBooks]);

    useEffect(() => {
        const searchBooks = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const params = new URLSearchParams({
                    search: debouncedSearchTerm
                });

                const response = await fetch(`/api/books?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    setSearchResults(data.books);
                    setBookDetailsMap(prev => {
                        const newMap = new Map(prev);
                        data.books.forEach((book: Book) => {
                            newMap.set(book.id, book);
                        });
                        return newMap;
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la recherche:', error);
            } finally {
                setIsSearching(false);
            }
        };

        searchBooks();
    }, [debouncedSearchTerm]);


    const handleBookAdded = async (newBookId: number) => {
        try {
            const response = await fetch(`/api/books?ids=${newBookId}`);

            if (!response.ok) throw new Error('Failed to fetch new book');

            const data = await response.json();

            setBookDetailsMap(prev => {
                const newMap = new Map(prev);
                if (data.books?.[0]) {
                    newMap.set(newBookId, data.books[0]);
                }
                return newMap;
            });

            // Place the new book at the top of the list (without duplicates)
            setDisplayedBookIds(prev => [newBookId, ...prev.filter(id => id !== newBookId)]);

            // Only handle selection status, not displayedBookIds
            if (!selectedBooks.includes(newBookId)) {
                onSelectedBooksChange([...selectedBooks, newBookId]);
            }

        } catch (error) {
            console.error('Error refreshing book data after addition:', error);
            toast({
                title: "Erreur",
                description: "Échec de l'ajout du livre",
                variant: "destructive"
            });
        }
    };

    const handleBookEdited = async () => {
        if (displayedBookIds.length > 0) {
            try {
                const response = await fetch(`/api/books?ids=${displayedBookIds.join(',')}`);
                if (response.ok) {
                    const data = await response.json();
                    setBookDetailsMap(new Map(
                        data.books.map((book: Book) => [book.id, book])
                    ));
                }
            } catch (error) {
                console.error('Error refreshing book data:', error);
            }
        }
    };

    const handleBookDeleted = async (deletedBookId: number) => {
        if (displayedBookIds.length > 0) {
            const updatedBookIds = displayedBookIds.filter(id => id !== deletedBookId);
            setDisplayedBookIds(updatedBookIds);

            if (selectedBooks?.includes(deletedBookId)) {
                const updatedSelectedBooks = selectedBooks.filter(id => id !== deletedBookId);
                onSelectedBooksChange(updatedSelectedBooks);
            }

            try {
                if (updatedBookIds.length > 0) {
                    const response = await fetch(`/api/books?ids=${updatedBookIds.join(',')}`);
                    if (response.ok) {
                        const data = await response.json();
                        setBookDetailsMap(new Map(
                            data.books.map((book: Book) => [book.id, book])
                        ));
                    }
                } else {
                    setBookDetailsMap(new Map());
                }
            } catch (error) {
                console.error('Error refreshing book data after deletion:', error);
            }
        }
    };


    const toggleBookSelection = (bookId: number, forceAdd: boolean = false) => {
        const isRemoving = selectedBooks.includes(bookId) && !forceAdd;

        // Handle selection status
        if (isRemoving) {
            onSelectedBooksChange(selectedBooks.filter(id => id !== bookId));
        } else if (!selectedBooks.includes(bookId)) {
            onSelectedBooksChange([...selectedBooks, bookId]);
        }

        // Handle display order for search results (not for handleBookAdded)
        if (!isRemoving && !displayedBookIds.includes(bookId)) {
            // For completely new books from search, add to the displayed list
            setDisplayedBookIds(prev => [bookId, ...prev]);
        } else if (forceAdd && displayedBookIds.includes(bookId)) {
            // For existing books, move to top when explicitly requested
            setDisplayedBookIds(prev => [bookId, ...prev.filter(id => id !== bookId)]);
        }
    };

    const handleRowClick = async (book: Book) => {
        setIsLoading(true);

        try {
            const response = await fetch(`/api/books/${book.id}`);
            if (!response.ok) {
                // Never « réessayer » on a 404: the book is gone and retrying
                // cannot change that. A fusion re-points this list onto the
                // surviving fiche, so there is nothing to forward to here.
                if (response.status === 404) {
                    toast({
                        title: 'Livre introuvable',
                        description:
                            `Le livre n°${book.id} n’existe plus. Rafraîchissez la liste : ` +
                            `il a pu être supprimé ou fusionné depuis son affichage.`,
                        variant: 'destructive',
                    });
                    return;
                }
                throw new Error('Failed to fetch book details');
            }
            const bookDetails = await response.json();

            const genreIds = bookDetails.genres.map((g: { genre: { id: number | string } }) => g.genre.id.toString());

            const formData: BookFormData = {
                title: bookDetails.title || '',
                subtitle: bookDetails.subtitle || '',
                author: bookDetails.author || '',
                publisher: bookDetails.publisher || '',
                // UTC year: this field is saved back verbatim, so a local read
                // shifts the date on every edit west of Greenwich.
                publishedYear: (calendarYear(bookDetails.publishedDate) ?? '').toString(),
                genres: genreIds,
                isbn: bookDetails.isbn || '',
                description: bookDetails.description || '',
                available: Boolean(bookDetails.available),
                hiddenFromCatalogue: Boolean(bookDetails.hiddenFromCatalogue),
                readingDurationMinutes: bookDetails.readingDurationMinutes?.toString() || '',
                pageCount: bookDetails.pageCount
            };

            setSelectedBookForEdit({
                ...book,
                formData
            });
            setEditModalOpen(true);
        } catch (error) {
            console.error('Error fetching book details:', error);
            toast({
                title: "Erreur",
                description: "Échec du chargement des détails du livre. Veuillez réessayer.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectAll = (checked: boolean, books: Book[]) => {
        if (checked) {
            const newSelections = [...new Set([...selectedBooks, ...books.map(book => book.id)])];
            onSelectedBooksChange(newSelections);
        } else {
            const bookIdsToRemove = new Set(books.map(book => book.id));
            onSelectedBooksChange(selectedBooks.filter(id => !bookIdsToRemove.has(id)));
        }
    };

    const areAllSelected = (books: Book[]) => {
        return books.length > 0 && books.every(book => selectedBooks.includes(book.id));
    };

    // Le jour parisien de la coupure par défaut, pour comparer au champ et
    // proposer d'y revenir.
    const defaultSinceDay = windowLabel?.defaultSince
        ? parisDayKey(new Date(windowLabel.defaultSince))
        : null;

    // Le plafond de /api/books (100 par page) peut couper la fenêtre. Comme
    // tout ce qui est chargé part coché, une troncature silencieuse serait une
    // liste tronquée : on la dit, chiffres à l'appui.
    const isTruncated = matchingTotal !== null && matchingTotal > suggestedCount;

    const displayedBookDetails = displayedBookIds
        .map(id => bookDetailsMap.get(id))
        .filter(book => book !== undefined) as Book[];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-foreground">
                    {mode === 'edit' ? 'Livres sélectionnés' : 'Nouveautés disponibles'}
                </h3>
                <div className="flex gap-2">
                    <AddBookButtonBackend onBookAdded={handleBookAdded} />

                    <Dialog
                        open={isOpen}
                        onOpenChange={onDialogOpenChange}
                    >
                        <DialogTrigger asChild>
                            <Button className="bg-muted text-foreground border-border hover:bg-muted">
                                Ajouter un livre existant
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                            <DialogHeader>
                                <DialogTitle className="text-foreground">Recherche de livres</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <Input
                                    type="search"
                                    placeholder="Rechercher par titre, auteur ou ISBN..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-card border-border text-foreground placeholder:text-muted-foreground"
                                />
                                {isSearching ? (
                                    <p className="text-center py-4 text-foreground">Chargement...</p>
                                ) : (
                                    <>
                                        {searchResults.length > 0 ? (
                                            <BookTable
                                                books={searchResults}
                                                isSearchResults={true}
                                                isLoading={isLoading}
                                                displayedBookIds={displayedBookIds}
                                                selectedBooks={selectedBooks}
                                                areAllSelected={areAllSelected}
                                                handleSelectAll={handleSelectAll}
                                                toggleBookSelection={toggleBookSelection}
                                                handleRowClick={handleRowClick}
                                            />
                                        ) : (
                                            debouncedSearchTerm && (
                                                <p className="text-center text-muted-foreground py-4">
                                                    Aucun livre trouvé correspondant à votre recherche.
                                                </p>
                                            )
                                        )}
                                    </>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {mode === 'create' && (
                <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
                    <div className="space-y-1">
                        <label htmlFor="since" className="text-sm font-medium text-foreground">
                            Nouveautés depuis le
                        </label>
                        <Input
                            type="date"
                            id="since"
                            value={since}
                            max={parisDayKey(new Date())}
                            onChange={(e) => {
                                const day = e.target.value;
                                setSince(day);
                                if (day) {
                                    setIsLoadingSuggestions(true);
                                    void loadSuggestions(day);
                                }
                            }}
                            className="bg-card border-border text-foreground w-auto"
                        />
                    </div>
                    <div className="flex-1 min-w-[16rem] text-sm text-muted-foreground">
                        {isLoadingSuggestions ? (
                            'Chargement des nouveautés…'
                        ) : (
                            <>
                                {windowLabel?.defaultSince && (
                                    <>
                                        Par défaut, la date de la dernière liste publiée
                                        {windowLabel.defaultLabel ? ` (« ${windowLabel.defaultLabel} »)` : ''} :{' '}
                                        {parisDate(windowLabel.defaultSince)}.{' '}
                                        {defaultSinceDay && since !== defaultSinceDay && (
                                            <button
                                                type="button"
                                                className="underline hover:text-foreground"
                                                onClick={() => {
                                                    // Sans `since`, le serveur
                                                    // réapplique l'instant exact
                                                    // de la liste — pas son jour
                                                    // arrondi, qui élargirait la
                                                    // fenêtre de quelques heures.
                                                    setIsLoadingSuggestions(true);
                                                    void loadSuggestions(null);
                                                }}
                                            >
                                                Revenir à cette date
                                            </button>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="border border-border rounded-lg bg-card">
                <BookTable
                    books={displayedBookDetails}
                    isLoading={isLoading}
                    displayedBookIds={displayedBookIds}
                    selectedBooks={selectedBooks}
                    areAllSelected={areAllSelected}
                    handleSelectAll={handleSelectAll}
                    toggleBookSelection={toggleBookSelection}
                    handleRowClick={handleRowClick}
                />
            </div>

            <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                    {selectedBooks.length} livres sélectionnés sur {displayedBookIds.length} livres dans la liste
                </p>
                {mode === 'create' && (
                    <>
                        {isTruncated && (
                            <p className="text-sm text-amber-500">
                                {matchingTotal} nouveautés correspondent à cette date, mais seules les{' '}
                                {suggestedCount} plus récentes sont chargées — et donc seules
                                celles-là partiront dans la liste. Choisissez une date plus
                                proche pour toutes les voir.
                            </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                            Seuls les livres disponibles sont proposés : un enregistrement encore
                            en cours n&apos;a rien à faire dans une liste. Utilisez « Ajouter un
                            livre existant » pour en ajouter un hors de cette fenêtre.
                        </p>
                    </>
                )}
            </div>

            {selectedBookForEdit && (
                <EditBookModal
                    isOpen={editModalOpen}
                    onOpenChange={setEditModalOpen}
                    bookId={selectedBookForEdit.id.toString()}
                    initialData={selectedBookForEdit.formData}
                    onBookEdited={handleBookEdited}
                    onBookDeleted={handleBookDeleted}
                />
            )}
        </div>
    );
}