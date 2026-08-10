'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, ChevronsUpDown, Check, Plus, Loader2, FileAudio, FileX2, SlidersHorizontal } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddBookFormBackend, EditBookFormBackend } from '@/admin/BookFormBackendBase';
import { BookAudioModal } from '@/admin/BookAudioModal';
import {
    AudioLinkStatus,
    audioLinkStatusHasAudio,
    audioLinkStatusIsMissing,
    getAudioLinkStatusButtonColor,
    getAudioLinkStatusColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
} from '@/lib/audio-enums';
import { calendarYear } from '@/lib/calendar-date';
import { toast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;
const DEBOUNCE_DELAY = 300;

interface BookFormData {
    title: string;
    subtitle: string,
    author: string;
    publisher: string | undefined;
    publishedYear: string;
    genres: string[];
    isbn: string | undefined;
    description: string | undefined;
    available: boolean;
    hiddenFromCatalogue: boolean;
    readingDurationMinutes: number | undefined;
    pageCount: number | undefined;
    [key: string]: string | number | boolean | string[] | undefined;
}

interface Book {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    isbn: string | null;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    available: boolean;
    hiddenFromCatalogue: boolean;
    genres: {
        genre: {
            id: number;
            name: string;
        };
    }[];
    addedBy: {
        name: string | null;
        email: string | null;
    };
    publishedDate: Date | null;
    description: string | null;
    addedById: number;
    publisher: string | null;
    createdAt: Date | null;
    /** Health of the link to the audio folder, refreshed by the sync script. */
    audioLinkStatus?: AudioLinkStatus;
    /** Tracks counted at the last check; null when there is nothing to count. */
    audioTrackCount?: number | null;
}

interface BookWithFormData extends Book {
    formData: BookFormData;
    /**
     * Which opening of the dialogue this is. Used as the form's React key so
     * every open starts from the details just fetched — see the edit modal.
     */
    openSeq: number;
}

interface SearchResult {
    books: Book[];
    total: number;
    totalPages: number;
    page: number;
    availableCount: number;
    unavailableCount: number;
}

interface BooksTableProps {
    initialBooks: Book[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableGenres?: { id: number; name: string; }[];
    initialTotalBooks: number;
    initialAvailableCount: number;
    initialUnavailableCount: number;
}

/**
 * The audio state of a row, in words.
 *
 * The editor button beside it is colour-coded for the same thing, but colour
 * and a crossed-out icon are a hint you have to already know how to read — and
 * the only way to be *sure* was to open the dialogue. This column says it
 * outright, which is the whole point: "no recording" is a fact about the book,
 * as much as its author, not a detail of the audio tool.
 */
function AudioStatusCell({ book }: { book: Book }) {
    const status = book.audioLinkStatus ?? AudioLinkStatus.UNVERIFIED;
    const count = book.audioTrackCount ?? 0;
    const hasAudio = audioLinkStatusHasAudio(status) && count > 0;

    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs ${getAudioLinkStatusColor(status)}`}
            title={getAudioLinkStatusHint(status)}
        >
            {hasAudio ? <FileAudio className="h-3 w-3" /> : <FileX2 className="h-3 w-3" />}
            {hasAudio ? `${count} piste${count > 1 ? 's' : ''}` : getAudioLinkStatusLabel(status)}
        </span>
    );
}

/**
 * Entry point to the audio editor for one row — and the status light for its
 * recording. A book with nothing to listen to has to be spottable while
 * scrolling the table, so the button itself carries the state: soft red outline
 * and a crossed-out file icon. Deliberately not a filled destructive button —
 * a missing recording is a to-do, not a failure.
 */
function AudioEditorButton({ book, onOpen }: { book: Book; onOpen: () => void }) {
    const status = book.audioLinkStatus ?? AudioLinkStatus.UNVERIFIED;
    const missing = audioLinkStatusIsMissing(status);

    return (
        <Button
            variant="outline"
            size="sm"
            className={getAudioLinkStatusButtonColor(status)}
            onClick={onOpen}
            aria-label={
                missing
                    ? `Ouvrir l’éditeur audio de ${book.title} — ${getAudioLinkStatusLabel(status).toLowerCase()}`
                    : `Ouvrir l’éditeur audio de ${book.title}`
            }
            title={
                missing
                    ? `${getAudioLinkStatusLabel(status)} — ${getAudioLinkStatusHint(status)}`
                    : 'Ouvrir l’éditeur audio'
            }
        >
            {missing ? <FileX2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
        </Button>
    );
}

export default function BooksTable({
                                       initialBooks = [],
                                       initialSearch = '',
                                       totalPages: initialTotalPages = 1,
                                       availableGenres = [],
                                       initialTotalBooks = 0,
                                       initialAvailableCount = 0,
                                       initialUnavailableCount = 0
                                   }: BooksTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Search state
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [selectedFilter, setSelectedFilter] = useState(searchParams?.get('filter') || 'all');
    const [selectedAvailable, setSelectedAvailable] = useState(searchParams?.get('available') || 'all');
    const [selectedHidden, setSelectedHidden] = useState(searchParams?.get('hidden') || 'all');
    const [selectedAudio, setSelectedAudio] = useState(searchParams?.get('audio') || 'all');
    const [currentPage, setCurrentPage] = useState(parseInt(searchParams?.get('page') || '1'));
    const [selectedGenres, setSelectedGenres] = useState<number[]>(() => {
        const genresParam = searchParams?.get('genres');
        return genresParam ? genresParam.split(',').map(Number).filter(id => !isNaN(id)) : [];
    });

    // UI state
    const [genreSearchQuery, setGenreSearchQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    /** Bumped on every opening so the add form is always a blank one. */
    const [addSeq, setAddSeq] = useState(0);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    /**
     * Which dialogue is asking to discard unsaved work, if any.
     *
     * Closing is refused while the form is dirty and this is set instead — the
     * two dialogues are dismissable by Escape and by a click outside, so
     * without it a stray click silently throws away a typed description.
     */
    const [discarding, setDiscarding] = useState<'add' | 'edit' | null>(null);
    const [selectedBook, setSelectedBook] = useState<BookWithFormData | null>(null);
    /** Book whose audio folder is open in the management dialogue. */
    const [audioBook, setAudioBook] = useState<{ id: number; title: string } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingBook, setIsLoadingBook] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Results state - initialize with server data
    const [searchResults, setSearchResults] = useState<SearchResult>(() => ({
        books: initialBooks,
        total: initialTotalBooks,
        page: parseInt(searchParams?.get('page') || '1'),
        totalPages: initialTotalPages,
        availableCount: initialAvailableCount,
        unavailableCount: initialUnavailableCount
    }));

    // Refs for debouncing, request cancellation, and caching
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const initialDataRef = useRef({
        books: initialBooks,
        total: initialTotalBooks,
        totalPages: initialTotalPages,
        availableCount: initialAvailableCount,
        unavailableCount: initialUnavailableCount
    });

    // Track if we need to invalidate cache after mutations
    const cacheInvalidatedRef = useRef(false);

    // Guards the ?book=<id> deep-link so it opens the modal once per id, not on
    // every re-render / router.refresh().
    const openedBookRef = useRef<string | null>(null);

    /** Counts openings of the edit dialogue; see BookWithFormData.openSeq. */
    const openSeqRef = useRef(0);

    // Written by the forms, read only when something tries to close them.
    const addDirtyRef = useRef(false);
    const editDirtyRef = useRef(false);

    // Track if initial load had any filters
    const initialHadFilters = useRef(
        initialSearch ||
        (searchParams?.get('filter') && searchParams?.get('filter') !== 'all') ||
        (searchParams?.get('genres')?.length || 0) > 0 ||
        (searchParams?.get('available') && searchParams?.get('available') !== 'all') ||
        (searchParams?.get('hidden') && searchParams?.get('hidden') !== 'all') ||
        (searchParams?.get('audio') && searchParams?.get('audio') !== 'all')
    );

    // Update URL without page reload
    const updateURL = useCallback((
        search: string,
        filter: string,
        genres: number[],
        page: number,
        available: string,
        hidden: string,
        audio: string
    ) => {
        const params = new URLSearchParams();

        if (search) params.set('search', search);
        if (filter !== 'all') params.set('filter', filter);
        if (genres.length > 0) params.set('genres', genres.join(','));
        if (available !== 'all') params.set('available', available);
        if (hidden !== 'all') params.set('hidden', hidden);
        if (audio !== 'all') params.set('audio', audio);
        if (page > 1) params.set('page', page.toString());

        const url = `/admin/books${params.toString() ? `?${params.toString()}` : ''}`;
        router.replace(url, { scroll: false });
    }, [router]);

    // Perform search with debouncing and caching
    const performSearch = useCallback(async (
        term: string,
        filter: string,
        genreIds: number[],
        page: number,
        available: string,
        hidden: string,
        audio: string,
        forceRefresh = false
    ) => {
        // Cancel any pending search
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Update URL
        updateURL(term, filter, genreIds, page, available, hidden, audio);

        const shouldUseCache = !forceRefresh &&
            !cacheInvalidatedRef.current &&
            !term &&
            genreIds.length === 0 &&
            page === 1 &&
            filter === 'all' &&
            available === 'all' &&
            hidden === 'all' &&
            audio === 'all' &&
            !initialHadFilters.current;

        if (shouldUseCache) {
            setSearchResults({
                books: initialDataRef.current.books,
                total: initialDataRef.current.total,
                page: 1,
                totalPages: initialDataRef.current.totalPages,
                availableCount: initialDataRef.current.availableCount,
                unavailableCount: initialDataRef.current.unavailableCount
            });
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        setError(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const params = new URLSearchParams({
                search: term,
                filter,
                page: page.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });

            if (available !== 'all') params.set('available', available);
            if (hidden !== 'all') params.set('hidden', hidden);
            if (audio !== 'all') params.set('audio', audio);

            genreIds.forEach(id => params.append('genres', id.toString()));

            if (forceRefresh || cacheInvalidatedRef.current) {
                params.set('_t', Date.now().toString());
            }

            const response = await fetch(`/api/books?${params}`, {
                signal: abortController.signal,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            setSearchResults(data);

            if (forceRefresh && !term && genreIds.length === 0 && page === 1 && filter === 'all' && available === 'all' && hidden === 'all' && audio === 'all') {
                initialDataRef.current = {
                    books: data.books,
                    total: data.total,
                    totalPages: data.totalPages,
                    availableCount: data.availableCount,
                    unavailableCount: data.unavailableCount
                };
                cacheInvalidatedRef.current = false;
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError('Une erreur s\'est produite lors de la recherche');
                console.error('Search error:', err);
            }
        } finally {
            setIsSearching(false);
        }
    }, [updateURL]);

    // Debounced search effect
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            performSearch(searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio);
        }, searchTerm ? DEBOUNCE_DELAY : 0);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio, performSearch]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    const handleSearchChange = useCallback((value: string) => {
        setSearchTerm(value);
        if (currentPage !== 1) {
            setCurrentPage(1);
        }
    }, [currentPage]);

    const handleFilterChange = useCallback((filter: string) => {
        setSelectedFilter(filter);
        setCurrentPage(1);
    }, []);

    const handleGenreChange = useCallback((genres: number[]) => {
        setSelectedGenres(genres);
        setCurrentPage(1);
    }, []);

    const handleAvailableChange = useCallback((available: string) => {
        setSelectedAvailable(available);
        setCurrentPage(1);
    }, []);

    // The disponible/en attente counters double as toggle chips: clicking the
    // one already selected clears the filter instead of doing nothing.
    const handleAvailablePillClick = useCallback((value: 'true' | 'false') => {
        handleAvailableChange(selectedAvailable === value ? 'all' : value);
    }, [selectedAvailable, handleAvailableChange]);

    const handleHiddenChange = useCallback((hidden: string) => {
        setSelectedHidden(hidden);
        setCurrentPage(1);
    }, []);

    const handleAudioChange = useCallback((audio: string) => {
        setSelectedAudio(audio);
        setCurrentPage(1);
    }, []);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);

    const removeGenre = (genreId: number) => {
        const newGenres = selectedGenres.filter(id => id !== genreId);
        handleGenreChange(newGenres);
    };

    const handleGenreSelect = (genreId: number) => {
        if (selectedGenres.includes(genreId)) {
            removeGenre(genreId);
        } else {
            handleGenreChange([...selectedGenres, genreId]);
        }
    };

    const openBookEditModal = async (book: Book, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }
        await openBookById(book.id);
    };

    // Fetches a book's full details and opens the edit modal. Shared by the
    // row-click handler and the ?book=<id> deep-link (e.g. from the stats page).
    const openBookById = async (bookId: number | string) => {
        setIsLoadingBook(true);

        try {
            const response = await fetch(`/api/books/${bookId}`, {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch book details');
            }
            const bookDetails = await response.json();

            const genreIds = bookDetails.genres.map((g: { genre: { id: number } }) => g.genre.id);

            const formData: BookFormData = {
                title: bookDetails.title,
                subtitle: bookDetails.subtitle,
                author: bookDetails.author,
                publisher: bookDetails.publisher || undefined,
                // UTC year, not local: what this field shows is what the save
                // writes back, so reading it in the viewer's timezone moves the
                // date every time a book is edited west of Greenwich.
                publishedYear: (calendarYear(bookDetails.publishedDate) ?? new Date().getFullYear())
                    .toString(),
                genres: genreIds.map(String),
                isbn: bookDetails.isbn || undefined,
                description: bookDetails.description || undefined,
                available: Boolean(bookDetails.available),
                hiddenFromCatalogue: Boolean(bookDetails.hiddenFromCatalogue),
                readingDurationMinutes: bookDetails.readingDurationMinutes || undefined,
                pageCount: bookDetails.pageCount || undefined,
            };

            const selectedBookWithForm: BookWithFormData = {
                ...bookDetails,
                formData,
                openSeq: ++openSeqRef.current,
            };

            // The form below is about to mount fresh from these values.
            editDirtyRef.current = false;
            setSelectedBook(selectedBookWithForm);
            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error fetching book details:', error);
            toast({
                title: "Erreur",
                description: "Échec du chargement des détails du livre. Veuillez réessayer.",
                variant: "destructive"
            });
        } finally {
            setIsLoadingBook(false);
        }
    };

    // Deep-link: open the edit modal directly when arriving with ?book=<id>
    // (e.g. from the stats page), even when the book isn't on the current page.
    const bookParam = searchParams?.get('book') ?? null;

    useEffect(() => {
        if (bookParam && openedBookRef.current !== bookParam) {
            openedBookRef.current = bookParam;
            openBookById(bookParam);
        } else if (!bookParam) {
            openedBookRef.current = null;
        }
    }, [bookParam]);

    // Strip the `book` param on close so the deep-link doesn't re-fire and the
    // URL stays clean. History API avoids pre-empting a following router.refresh().
    const clearBookParam = () => {
        if (!searchParams?.get('book')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('book');
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    };

    /**
     * Radix reports Escape, an outside click and the ✕ through the same
     * onOpenChange, so one interception point covers all three: keep `open`
     * true and raise the question instead. Programmatic closes (a successful
     * save) don't come through here at all, and clear the flag anyway.
     */
    const requestCloseAdd = (open: boolean) => {
        if (!open && addDirtyRef.current) {
            setDiscarding('add');
            return;
        }
        setIsAddModalOpen(open);
    };

    const requestCloseEdit = (open: boolean) => {
        if (!open && editDirtyRef.current) {
            setDiscarding('edit');
            return;
        }
        setIsEditModalOpen(open);
        if (!open) clearBookParam();
    };

    const confirmDiscard = () => {
        if (discarding === 'add') {
            addDirtyRef.current = false;
            setIsAddModalOpen(false);
        } else if (discarding === 'edit') {
            editDirtyRef.current = false;
            setIsEditModalOpen(false);
            clearBookParam();
        }
        setDiscarding(null);
    };

    const openAddModal = () => {
        // Fresh form every time: with the discard guard above, nothing reaches
        // this point unsaved by accident, so carrying values over from a
        // previous book would only ever be a way to create a duplicate of it.
        setAddSeq((n) => n + 1);
        addDirtyRef.current = false;
        setIsAddModalOpen(true);
    };

    const handleBookEdited = async (bookId: number, isDeleted = false) => {
        cacheInvalidatedRef.current = true;

        if (isDeleted) {
            setSearchResults(prev => ({
                ...prev,
                books: prev.books.filter(book => book.id !== bookId),
                total: prev.total - 1
            }));
            setIsEditModalOpen(false);
            setSelectedBook(null);

            setTimeout(() => {
                performSearch(searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio, true);
            }, 100);
            return;
        }

        setIsEditModalOpen(false);
        setSelectedBook(null);
        performSearch(searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio, true);
    };

    const handleBookAdded = async () => {
        cacheInvalidatedRef.current = true;
        setIsAddModalOpen(false);
        performSearch(searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio, true);
    };

    const getVisiblePages = (current: number, total: number) => {
        const delta = 2;
        const range = [];
        for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            range.push(i);
        }
        if (current - delta > 2) range.unshift('...');
        if (current + delta < total - 1) range.push('...');
        range.unshift(1);
        if (total > 1) range.push(total);
        return range;
    };

    const visiblePages = getVisiblePages(currentPage, searchResults.totalPages);

    const getGenreName = (genreId: number) => {
        return availableGenres?.find(g => g.id === genreId)?.name || '';
    };

    // Which availability segment (if any) the current filter is showing — the
    // disponible/en attente figures double as toggle chips, mirroring the
    // actif/inactif chips on the users page.
    const availableSelected = selectedAvailable === 'true';
    const unavailableSelected = selectedAvailable === 'false';
    const activeFilterCount = (selectedAudio !== 'all' ? 1 : 0) + (selectedHidden !== 'all' ? 1 : 0);

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <CardTitle className="text-foreground">Gestion des livres</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
                        <span>
                            {searchResults.total} livre{searchResults.total !== 1 ? 's' : ''} au total
                        </span>
                        <span aria-hidden className="text-muted-foreground/50">&#8226;</span>
                        <button
                            type="button"
                            aria-pressed={availableSelected}
                            onClick={() => handleAvailablePillClick('true')}
                            title={availableSelected ? 'Retirer le filtre' : 'Afficher uniquement les disponibles'}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors ${
                                availableSelected
                                    ? 'bg-emerald-950 text-emerald-300 ring-1 ring-inset ring-emerald-800'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${availableSelected ? 'bg-emerald-400' : 'bg-emerald-500/50'}`} />
                            {searchResults.availableCount} disponible{searchResults.availableCount > 1 ? 's' : ''}
                        </button>
                        <button
                            type="button"
                            aria-pressed={unavailableSelected}
                            onClick={() => handleAvailablePillClick('false')}
                            title={unavailableSelected ? 'Retirer le filtre' : 'Afficher uniquement les livres en attente'}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors ${
                                unavailableSelected
                                    ? 'bg-amber-950 text-amber-300 ring-1 ring-inset ring-amber-800'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${unavailableSelected ? 'bg-amber-400' : 'bg-amber-500/50'}`} />
                            {searchResults.unavailableCount} en attente
                        </button>
                    </div>
                </div>
                <Button
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                    onClick={openAddModal}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter un livre
                </Button>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:items-end">
                        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
                            <Input
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Recherche de livres..."
                                className="pl-10 pr-10 bg-card text-foreground border-border placeholder:text-muted-foreground"
                            />
                            <Search className="absolute left-3 top-2.5 text-muted-foreground" size={20} />
                            {isSearching && searchTerm.length > 0 && (
                                <Loader2 className="absolute right-3 top-2.5 text-muted-foreground animate-spin" size={20} />
                            )}
                        </div>

                        <div className="flex flex-col gap-1 w-full sm:w-44">
                            <label htmlFor="book-search-field" className="text-xs font-medium text-muted-foreground">
                                Rechercher dans
                            </label>
                            <select
                                id="book-search-field"
                                value={selectedFilter}
                                onChange={(e) => handleFilterChange(e.target.value)}
                                className="w-full px-4 py-2 rounded-md bg-card text-foreground border-border focus:ring-2 focus:ring-ring"
                            >
                                <option value="all">Tous les champs</option>
                                <option value="title">Titre</option>
                                <option value="author">Auteur</option>
                                <option value="isbn">ISBN</option>
                                <option value="description">Description</option>
                                <option value="genre">Genre</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1 w-full sm:w-auto">
                            <span className="text-xs font-medium text-muted-foreground">Filtres</span>
                            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full sm:w-auto justify-between gap-2 bg-card text-foreground border-border"
                                    >
                                        <span className="flex items-center gap-2">
                                            <SlidersHorizontal className="h-4 w-4" />
                                            Audio &amp; catalogue
                                        </span>
                                        {activeFilterCount > 0 && (
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" collisionPadding={16} className="w-72 space-y-4 bg-card border-border">
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-medium text-muted-foreground">Audio</span>
                                        <div className="grid grid-cols-3 gap-1">
                                            {[
                                                { value: 'all', label: 'Tous' },
                                                { value: 'present', label: 'Avec' },
                                                { value: 'missing', label: 'Sans' },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    aria-pressed={selectedAudio === opt.value}
                                                    onClick={() => handleAudioChange(opt.value)}
                                                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                                        selectedAudio === opt.value
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : 'bg-card text-foreground border-border hover:bg-muted'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-medium text-muted-foreground">Visibilité dans le catalogue</span>
                                        <div className="grid grid-cols-3 gap-1">
                                            {[
                                                { value: 'all', label: 'Toutes' },
                                                { value: 'false', label: 'Visible' },
                                                { value: 'true', label: 'Masqué' },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    aria-pressed={selectedHidden === opt.value}
                                                    onClick={() => handleHiddenChange(opt.value)}
                                                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                                        selectedHidden === opt.value
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : 'bg-card text-foreground border-border hover:bg-muted'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {availableGenres && availableGenres.length > 0 && (
                            <div className="flex flex-col gap-1 w-full sm:w-64">
                                <span className="text-xs font-medium text-muted-foreground">Genres</span>
                                <Popover open={open} onOpenChange={setOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={open}
                                            className="w-full justify-between bg-card text-foreground border-border"
                                        >
                                            {selectedGenres.length > 0
                                                ? `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''} sélectionné${selectedGenres.length > 1 ? 's' : ''}`
                                                : "Sélectionner des genres..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" collisionPadding={16} className="w-[min(250px,calc(100vw-2rem))] p-0 bg-card border-border">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Rechercher des genres..."
                                                value={genreSearchQuery}
                                                onChange={(e) => setGenreSearchQuery(e.target.value)}
                                                className="mb-2 bg-muted text-foreground border-border"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {availableGenres
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(genreSearchQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-sm cursor-pointer"
                                                            onClick={() => {
                                                                handleGenreSelect(genre.id);
                                                                setGenreSearchQuery('');
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${
                                                                    selectedGenres.includes(genre.id)
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                }`}
                                                            />
                                                            {genre.name}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}
                    </div>

                    {selectedGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {selectedGenres.map(genreId => {
                                const genreName = getGenreName(genreId);
                                return genreName ? (
                                    <div
                                        key={genreId}
                                        className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm flex items-center"
                                    >
                                        {genreName}
                                        <button
                                            type="button"
                                            onClick={() => removeGenre(genreId)}
                                            className="ml-2 hover:text-blue-600"
                                        >
                                            <X className="h-3 w-3"/>
                                        </button>
                                    </div>
                                ) : null;
                            })}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="text-center py-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mt-4 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
                        {error}
                    </div>
                )}

                <div className="relative mt-4">
                    {isSearching && searchResults.books.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 bg-card rounded-lg">
                            <Loader2 className="animate-spin h-12 w-12 text-blue-400" />
                            <p className="mt-4 text-foreground">Recherche en cours...</p>
                        </div>
                    ) : searchResults.books.length === 0 ? (
                        <div className="text-center py-12 bg-card rounded-lg">
                            <p className="text-foreground">
                                {searchTerm || selectedGenres.length > 0
                                    ? 'Aucun résultat trouvé pour votre recherche'
                                    : 'Aucun livre disponible'}
                            </p>
                        </div>
                    ) : (
                        <div className={`transition-opacity duration-200 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>
                            <div className="rounded-md border border-border bg-card">
                                <Table>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border">
                                            <TableHead className="text-foreground font-medium">Titre</TableHead>
                                            <TableHead className="text-foreground font-medium">Auteur</TableHead>
                                            <TableHead className="text-foreground font-medium">Genres</TableHead>
                                            <TableHead className="text-foreground font-medium">Durée de lecture</TableHead>
                                            <TableHead className="text-foreground font-medium">Audio</TableHead>
                                            <TableHead className="text-foreground font-medium">Disponible</TableHead>
                                            <TableHead className="text-foreground font-medium">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {searchResults.books.map((book) => (
                                            <TableRow
                                                key={book.id}
                                                className="border-b border-border hover:bg-muted cursor-pointer"
                                                onClick={() => openBookEditModal(book)}
                                            >
                                                <TableCell className="text-foreground">
                                                    <div>
                                                        <div className="font-medium">{book.title}</div>
                                                        {book.subtitle && (
                                                            <div className="text-sm text-muted-foreground">{book.subtitle}</div>
                                                        )}
                                                        {book.isbn && (
                                                            <div className="text-sm text-muted-foreground">
                                                                ISBN: {book.isbn}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-foreground">{book.author}</TableCell>
                                                <TableCell className="text-foreground">
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {book.genres?.slice(0, 2).map((g, idx) => (
                                                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 whitespace-nowrap">
                                                                {g.genre.name}
                                                            </span>
                                                        ))}
                                                        {book.genres?.length > 2 && (
                                                            <span className="text-xs text-muted-foreground whitespace-nowrap">+{book.genres.length - 2} plus</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {book.readingDurationMinutes
                                                        ? `${Math.floor(book.readingDurationMinutes / 60)}h ${book.readingDurationMinutes % 60}min`
                                                        : 'N/D'
                                                    }
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    <AudioStatusCell book={book} />
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    <div className="flex flex-wrap gap-1">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                                            book.available
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {book.available ? 'Disponible' : 'En attente'}
                                                        </span>
                                                        {book.hiddenFromCatalogue && (
                                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-800 whitespace-nowrap">
                                                                Masqué
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="bg-muted text-foreground border-border hover:bg-accent"
                                                            onClick={(e) => openBookEditModal(book, e)}
                                                        >
                                                            Modifier
                                                        </Button>
                                                        <AudioEditorButton
                                                            book={book}
                                                            onOpen={() => setAudioBook({ id: book.id, title: book.title })}
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {searchResults.totalPages > 1 && (
                    <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1}
                        >
                            {'<<'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                        >
                            {'<'}
                        </Button>
                        {visiblePages.map((page, index) => (
                            typeof page === 'number' ? (
                                <Button
                                    key={index}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    className={currentPage === page
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-card text-foreground border-border hover:bg-muted"}
                                    onClick={() => handlePageChange(page)}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-muted-foreground px-2">{page}</span>
                            )
                        ))}
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === searchResults.totalPages}
                        >
                            {'>'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(searchResults.totalPages)}
                            disabled={currentPage === searchResults.totalPages}
                        >
                            {'>>'}
                        </Button>
                    </div>
                )}

                {searchResults.totalPages > 1 && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                        Page {currentPage} sur {searchResults.totalPages}
                    </p>
                )}
            </CardContent>

            {/* Book loading overlay */}
            {isLoadingBook && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                    <span className="text-white text-sm">Chargement du livre...</span>
                </div>
            )}

            {/* Add Book Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={requestCloseAdd}>
                <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Ajouter un nouveau livre</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddBookFormBackend
                            key={addSeq}
                            onSuccess={handleBookAdded}
                            dirtyRef={addDirtyRef}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Book Modal */}
            {selectedBook && (
                <Dialog open={isEditModalOpen} onOpenChange={requestCloseEdit}>
                    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">Modifier le livre</DialogTitle>
                        </DialogHeader>
                        <div className="overflow-y-auto px-1">
                            {/* key: the form seeds its state from initialData on
                                mount only, and closing the dialogue leaves
                                selectedBook set. Without a fresh identity per
                                opening React reuses the instance, so the next
                                book opens showing the previous one's values
                                while the save targets the new book's id —
                                overwriting one book with another's data. Keyed
                                on the opening rather than the book id so that
                                reopening the *same* book also discards fields
                                abandoned last time and shows what was just
                                refetched. */}
                            <EditBookFormBackend
                                key={selectedBook.openSeq}
                                bookId={selectedBook.id.toString()}
                                initialData={selectedBook.formData}
                                onSuccess={handleBookEdited}
                                dirtyRef={editDirtyRef}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Discard unsaved changes? */}
            <AlertDialog open={discarding !== null} onOpenChange={(open) => !open && setDiscarding(null)}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">
                            Abandonner les modifications ?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {discarding === 'add'
                                ? 'Ce livre n’a pas encore été créé. En fermant, tout ce qui a été saisi sera perdu.'
                                : 'Les modifications apportées à ce livre n’ont pas été enregistrées. En fermant, elles seront perdues.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-muted text-foreground border-border hover:bg-muted">
                            Continuer la saisie
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDiscard}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Abandonner
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Audio folder management */}
            {audioBook && (
                <BookAudioModal
                    isOpen={audioBook !== null}
                    onOpenChange={(open) => {
                        if (!open) setAudioBook(null);
                    }}
                    bookId={audioBook.id}
                    // Uploading or deleting a track moves audioLinkStatus, and
                    // with it the colour of the button that opened this dialogue.
                    onChanged={() => {
                        cacheInvalidatedRef.current = true;
                        performSearch(searchTerm, selectedFilter, selectedGenres, currentPage, selectedAvailable, selectedHidden, selectedAudio, true);
                    }}
                />
            )}
        </Card>
    );
}