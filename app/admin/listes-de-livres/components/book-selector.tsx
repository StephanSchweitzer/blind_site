import React, { useState, useEffect, useRef } from 'react';
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
import { parisDate } from '@/lib/paris-day';
import { ListRef, membershipLabel } from './list-membership';
import RecentBooksPicker, { RecentBook } from './recent-books-picker';

type Book = RecentBook;

interface BookSelectorProps {
    selectedBooks?: number[];
    onSelectedBooksChange: (bookIds: number[]) => void;
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
    membership: Map<number, ListRef[]>;
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
                       membership,
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
                                {membership.has(book.id) && (
                                    <span className="text-sm text-amber-500">
                                        {membershipLabel(membership.get(book.id)!)}
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
                        .filter((id) => id !== coupDeCoeurId)
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
    }, [coupDeCoeurId]);

    useEffect(() => {
        document.body.style.cursor = isLoading ? 'wait' : 'default';
        return () => {
            document.body.style.cursor = 'default';
        };
    }, [isLoading]);

    useEffect(() => {
        if (initialLoadDone.current) return;
        initialLoadDone.current = true;

        // Le fetch vit dans une fonction async définie ici, comme partout
        // ailleurs dans ce fichier : l'effet ne fait que la lancer.
        //
        // Rien n'est ajouté d'office : une nouvelle liste s'ouvre vide, une
        // liste existante avec ses livres. Les nouveautés passent par
        // RecentBooksPicker, où chaque titre se coche un par un.
        const fetchInitialBooks = async () => {
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
    }, [selectedBooks]);

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

    // Les nouveautés cochées dans RecentBooksPicker : en tête de liste, comme
    // tout ajout délibéré, et cochées. Un livre déjà affiché mais décoché est
    // remonté et recoché plutôt que dupliqué.
    const handleRecentBooksAdded = (books: Book[]) => {
        const ids = books.map((book) => book.id);
        const added = new Set(ids);

        setBookDetailsMap(prev => {
            const next = new Map(prev);
            books.forEach((book) => next.set(book.id, book));
            return next;
        });
        setDisplayedBookIds(prev => [...ids, ...prev.filter(id => !added.has(id))]);
        onSelectedBooksChange([...selectedBooks.filter(id => !added.has(id)), ...ids]);
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

    // Les livres cochés qui figurent déjà ailleurs. Comptés sur la sélection,
    // pas sur l'affichage : c'est ce qui partira dans la liste qui compte.
    const alreadyListed = selectedBooks.filter((id) => membership.has(id));

    const displayedBookDetails = displayedBookIds
        .map(id => bookDetailsMap.get(id))
        .filter(book => book !== undefined) as Book[];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-foreground">
                    Livres sélectionnés
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
                                                membership={membership}
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

            <RecentBooksPicker
                selectedBookIds={selectedBooks}
                membership={membership}
                onAdd={handleRecentBooksAdded}
            />

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
                    membership={membership}
                />
            </div>

            <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                    {selectedBooks.length} livres sélectionnés sur {displayedBookIds.length} livres dans la liste
                </p>
                {/* Un avertissement, pas une règle : republier un titre est
                    parfois voulu (une lecture reprise, une liste thématique).
                    Rien n'est donc décoché d'office — mais le décochage tient
                    en un clic, sans quoi il faudrait retrouver ces livres un
                    par un au milieu de plusieurs centaines. */}
                {alreadyListed.length > 0 && (
                    <p className="text-sm text-amber-500">
                        {alreadyListed.length === 1
                            ? '1 livre sélectionné figure déjà dans une autre liste de livres.'
                            : `${alreadyListed.length} livres sélectionnés figurent déjà dans une autre liste de livres.`}{' '}
                        <button
                            type="button"
                            className="underline hover:text-foreground"
                            onClick={() => {
                                const drop = new Set(alreadyListed);
                                onSelectedBooksChange(selectedBooks.filter((id) => !drop.has(id)));
                            }}
                        >
                            {alreadyListed.length === 1 ? 'Le décocher' : 'Les décocher'}
                        </button>
                    </p>
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