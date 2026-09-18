import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, X, AlertCircle } from "lucide-react";
import BookSearch from "@/app/admin/books/components/book-search";
import { BookAudioButton } from '@/admin/BookAudioButton';
import { DeleteBookModal } from '@/admin/DeleteBookModal';
import BookDeletedNotice from '@/admin/BookDeletedNotice';
import DurationInputs from "@/components/ui/duration-inputs";
import { useToast } from "@/hooks/use-toast";
import { useFormToast } from "@/hooks/useFormToast";
import { apiErrorToast } from '@/admin/ApiErrorMessage';
import { toUserFacingError, userErrorFromResponse } from '@/lib/user-error';

interface Genre {
    id: string;
    name: string;
}

export interface BookFormData {
    publisher: string | undefined;
    title: string;
    subtitle: string | undefined;
    author: string;
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


interface BookSearchData {
    title: string;
    subtitle: string | undefined;
    author: string;
    description: string;
    isbn: string | undefined;
    publishedMonth: string;
    publishedYear: string;
    pageCount: number | undefined;
    publisher: string;
    estimatedReadingTime?: string;
}

/** Seed for a brand-new book, and the baseline the add form is compared against. */
const EMPTY_FORM: BookFormData = {
    title: '',
    subtitle: '',
    author: '',
    publisher: '',
    publishedYear: '',
    genres: [],
    isbn: '',
    description: '',
    available: false,
    hiddenFromCatalogue: false,
    readingDurationMinutes: 0,
    pageCount: undefined,
};

interface BookFormBackendBaseProps {
    initialData?: BookFormData;
    onSubmit: (formData: BookFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (bookId: number, isDeleted?: boolean) => void;
    /**
     * La fiche vient d'être supprimée pour de bon. Le formulaire n'appelle plus
     * la route lui-même : DeleteBookModal porte le contrôle préalable, la
     * décision sur le dossier audio et l'appel (voir handleDeleteClick).
     */
    onDeleted?: () => void;
    showDelete?: boolean;
    /** Existing book — enables the audio editor. Absent while creating one. */
    audioBookId?: number;
    /**
     * Written by the form, read by whoever owns the dialogue around it: true
     * while the fields differ from what they were seeded with.
     *
     * A ref rather than a callback on purpose. Dirtiness changes on every
     * keystroke but is only ever *read* at the moment someone tries to close,
     * so pushing it into parent state would re-render the whole dialogue per
     * character to answer a question nobody is asking yet.
     */
    dirtyRef?: React.RefObject<boolean>;
    /** The book is soft-deleted: every field and action below is disabled until it's restored. */
    readOnly?: boolean;
}

export function BookFormBackendBase({
                                        initialData,
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        title,
                                        onSuccess,
                                        onDeleted,
                                        showDelete,
                                        audioBookId,
                                        dirtyRef,
                                        readOnly = false,
                                    }: BookFormBackendBaseProps) {
    const [formData, setFormDataState] = useState<BookFormData>(initialData || EMPTY_FORM);

    /**
     * What the form was seeded with, and the live value beside it.
     *
     * The component is mounted fresh for each opening (the callers key it), so
     * this snapshot is taken once and stays the right baseline for its whole
     * life — « modifié » means "differs from the book as it was loaded", not
     * "someone touched a key", so typing a character and deleting it again
     * leaves the form clean and closes without a prompt.
     */
    const pristineRef = useRef(JSON.stringify(initialData || EMPTY_FORM));
    const formDataRef = useRef(formData);

    /**
     * The single write path for the form. Recomputing dirtiness here — in the
     * event handler, on a value derived from a ref — keeps React's updater
     * pure: it receives a finished object rather than a function that also has
     * to record a side effect on the way through.
     */
    const setFormData = (update: (prev: BookFormData) => BookFormData) => {
        const next = update(formDataRef.current);
        formDataRef.current = next;
        if (dirtyRef) dirtyRef.current = JSON.stringify(next) !== pristineRef.current;
        setFormDataState(next);
    };

    const [genres, setGenres] = useState<Genre[]>([]);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** La fenêtre de suppression, qui porte refus, décision audio et appel. */
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { toastError } = useFormToast();

    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const response = await fetch('/api/genres');
                if (response.ok) {
                    const data = await response.json();
                    // Temporary allow any to cast to string because of type inconsistencies. Don't want to refactor right now
                     
                    const genresWithStringIds = data.map((genre: any) => ({
                        ...genre,
                        id: genre.id.toString()
                    }));
                    setGenres(genresWithStringIds);
                }
            } catch (error) {
                console.error('Error fetching genres:', error);
                setError('Échec du chargement des genres'); toastError('Échec du chargement des genres');
            }
        };

        fetchGenres();
    }, [toastError]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: name === 'pageCount' || name === 'publishedYear' || name === 'readingDurationMinutes'
                ? value === '' ? undefined : Number(value)
                : value,
        }));
    };

    /**
     * The « Recalculer » button has already written the duration server-side, so
     * this only realigns the field the form is displaying. Deliberately NOT
     * marked dirty: nothing here is an unsaved edit, and prompting the permanent
     * to save a value the server just stored would be a lie about what happened.
     */
    const handleMeasuredDuration = (readingDurationMinutes: number | null) => {
        setFormData(prev => ({
            ...prev,
            readingDurationMinutes: readingDurationMinutes ?? undefined,
        }));
    };

    const handleBookSelect = (bookData: BookSearchData) => {
        // Convert estimated reading time to minutes if available
        let readingDurationMinutes = undefined;

        if (bookData.estimatedReadingTime) {
            // Parse time format like "13 h 30 min" or "45 min"
            const timeString = bookData.estimatedReadingTime;
            let minutes = 0;

            // Extract hours if present
            const hoursMatch = timeString.match(/(\d+)\s*h/);
            if (hoursMatch) {
                minutes += parseInt(hoursMatch[1]) * 60;
            }

            // Extract minutes if present
            const minutesMatch = timeString.match(/(\d+)\s*min/);
            if (minutesMatch) {
                minutes += parseInt(minutesMatch[1]);
            }

            readingDurationMinutes = minutes;
        }

        setFormData(prev => ({
            ...prev,
            title: bookData.title,
            subtitle: bookData.subtitle,
            author: bookData.author,
            description: bookData.description,
            isbn: bookData.isbn,
            publishedYear: bookData.publishedYear,
            pageCount: bookData.pageCount,
            publisher: bookData.publisher,
            readingDurationMinutes: readingDurationMinutes
        }));
    };

    const handleGenreSelect = (genreId: string) => {
        setFormData(prevData => {
            const newGenres = prevData.genres.includes(genreId)
                ? prevData.genres.filter(id => id !== genreId)
                : [...prevData.genres, genreId];
            return {
                ...prevData,
                genres: newGenres,
            };
        });
    };

    const removeGenre = (genreId: string) => {
        setFormData(prevData => ({
            ...prevData,
            genres: prevData.genres.filter(id => id !== genreId),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);
        setError(null);

        try {
            const newBookId = await onSubmit(formData);
            // Saved: there is nothing left to lose, so closing must not prompt.
            if (dirtyRef) dirtyRef.current = false;
            if (onSuccess) {
                onSuccess(newBookId);
            }
        } catch (err) {
            // Wrapper (Add/Edit) already toasts the detailed error — with the
            // contact line when the cause is unknown; inline only here.
            const msg = err instanceof Error ? err.message : 'Échec du traitement du livre';
            setError(msg);
            return;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Plus de `window.confirm` : la fenêtre de suppression commence par LIRE ce
     * qui empêche de supprimer (demandes et attributions, dossier audio partagé
     * avec une autre fiche) et demande ce que devient l'enregistrement. Elle
     * appelle la route elle-même ; ici il ne reste qu'à l'ouvrir.
     *
     * `dirtyRef` n'est pas remis à zéro tant que rien n'est supprimé : le refus
     * est maintenant le cas le plus probable de cette fenêtre, et perdre une
     * saisie en cours pour un refus serait une double peine.
     */
    const handleDeleteClick = () => setDeleteOpen(true);

    return (
        <>
        <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-foreground">{title}</CardTitle>
                    {audioBookId != null && (
                        <BookAudioButton
                            bookId={audioBookId}
                            bookTitle={formData.title}
                            size="sm"
                            disabled={readOnly}
                        />
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="destructive" className="border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-900/20">
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <AlertTitle className="text-red-600 dark:text-red-400">Erreur</AlertTitle>
                            <AlertDescription className="text-foreground mt-1">
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}

                    {!initialData && <BookSearch onBookSelect={handleBookSelect}/>}

                    <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-60">
                    <div className="grid gap-6">
                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-foreground">
                                Titre *
                            </label>
                            <Input
                                type="text"
                                name="title"
                                id="title"
                                required
                                value={formData.title}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                placeholder="Indiquer le titre du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-foreground">
                                Sous-titre
                            </label>
                            <Input
                                type="text"
                                name="subtitle"
                                id="subtitle"
                                value={formData.subtitle || ''}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                placeholder="Indiquer le sous-titre du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="author" className="text-sm font-medium text-foreground">
                                Auteur *
                            </label>
                            <Input
                                type="text"
                                name="author"
                                id="author"
                                required
                                value={formData.author}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                placeholder="Indiquer l'auteur du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="publisher" className="text-sm font-medium text-foreground">
                                Éditeur
                            </label>
                            <Input
                                type="text"
                                name="publisher"
                                id="publisher"
                                value={formData.publisher || ''}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                placeholder="Indiquer l'éditeur du livre"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="publishedYear" className="text-sm font-medium text-foreground">
                                    Année de publication *
                                </label>
                                <Input
                                    type="number"
                                    name="publishedYear"
                                    id="publishedYear"
                                    required
                                    min="1800"
                                    max={new Date().getFullYear()}
                                    value={formData.publishedYear || ''}
                                    onChange={handleChange}
                                    className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Année de publication"
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="pageCount" className="text-sm font-medium text-foreground">
                                    Nombre de pages
                                </label>
                                <Input
                                    type="number"
                                    name="pageCount"
                                    id="pageCount"
                                    min="1"
                                    value={formData.pageCount || ''}
                                    onChange={handleChange}
                                    className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Nombre de pages"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Genres
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {formData.genres.map(genreId => {
                                    const genre = genres.find(g => g.id === genreId);
                                    return genre ? (
                                        <div
                                            key={genre.id}
                                            className="bg-blue-100 dark:bg-blue-900/70 text-blue-900 dark:text-blue-50 rounded-full px-3 py-1 text-sm flex items-center border border-blue-300 dark:border-blue-600/60"
                                        >
                                            {genre.name}
                                            <button
                                                type="button"
                                                onClick={() => removeGenre(genre.id)}
                                                className="ml-2 hover:text-muted-foreground"
                                            >
                                                <X className="h-3 w-3"/>
                                            </button>
                                        </div>
                                    ) : null;
                                })}
                            </div>
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={open}
                                        className="w-full justify-between bg-field border-border text-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <span className="truncate min-w-0">
                                            {formData.genres.length > 0
                                                ? 'Sélectionner plus des genres associés...'
                                                : 'Sélectionner les genres associés...'}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    align="start"
                                    collisionPadding={16}
                                    className="w-[min(16rem,calc(100vw-2rem))] p-0 bg-card border-border"
                                >
                                    <div className="flex flex-col h-80">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Recherche de genres..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="mb-2 bg-muted border-border text-foreground"
                                            />
                                        </div>
                                        <div
                                            className="flex-1 overflow-y-auto"
                                            onWheel={(e) => {
                                                e.stopPropagation();
                                                const container = e.currentTarget;
                                                container.scrollTop += e.deltaY;
                                            }}
                                        >
                                            <div className="p-2">
                                                {genres
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(searchQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full min-w-0 px-2 py-1.5 text-sm hover:bg-muted text-foreground rounded-sm cursor-pointer"
                                                            onClick={() => {
                                                                handleGenreSelect(genre.id);
                                                                setSearchQuery('');
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${
                                                                    formData.genres.includes(genre.id)
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                }`}
                                                            />
                                                            <span className="break-words">{genre.name}</span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="isbn" className="text-sm font-medium text-foreground">
                                ISBN
                            </label>
                            <Input
                                type="text"
                                name="isbn"
                                id="isbn"
                                value={formData.isbn || ''}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                placeholder="Indiquer le numéro ISBN du livre (facultatif)"
                            />
                        </div>

                        <DurationInputs
                            formData={formData}
                            bookId={audioBookId}
                            onMeasured={handleMeasuredDuration}
                        />

                        <div className="space-y-2">
                            <label htmlFor="description" className="text-sm font-medium text-foreground">
                                Description
                            </label>
                            <Textarea
                                name="description"
                                id="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground min-h-[150px]"
                                placeholder="Décrire le livre pour aider les personnes à comprendre de quoi il s'agit."
                            />
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                name="available"
                                id="available"
                                checked={formData.available}
                                onCheckedChange={(checked) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        available: checked as boolean
                                    }));
                                }}
                                className="border-2 border-border data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 data-[state=unchecked]:bg-transparent transition-colors duration-150"
                            />
                            <label htmlFor="available" className="text-sm font-medium text-foreground">
                                Disponible
                            </label>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    name="hiddenFromCatalogue"
                                    id="hiddenFromCatalogue"
                                    checked={formData.hiddenFromCatalogue}
                                    onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                            ...prev,
                                            hiddenFromCatalogue: checked as boolean
                                        }));
                                    }}
                                    className="border-2 border-border data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 data-[state=unchecked]:bg-transparent transition-colors duration-150"
                                />
                                <label htmlFor="hiddenFromCatalogue" className="text-sm font-medium text-foreground">
                                    Masqué du catalogue public
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6">
                                Le livre n&apos;apparait plus dans le Catalogue, ni dans les &quot;Listes de livres&quot; adressées régulièrement aux adhérents  (ex. un livre au sujet sensible ou extrême (religion, politique, moeurs….). Le livre reste cependant accessible aux permanentes.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-muted hover:bg-muted text-foreground border-border"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDeleted && audioBookId != null && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-600 hover:bg-red-700 text-white border-red-600 dark:border-red-500"
                            >
                                Supprimer le livre
                            </Button>
                        )}
                    </div>
                    </fieldset>
                </form>
            </CardContent>
        </Card>

        {onDeleted && audioBookId != null && (
            <DeleteBookModal
                isOpen={deleteOpen}
                onOpenChange={setDeleteOpen}
                bookId={audioBookId}
                bookTitle={formData.title}
                onDeleted={() => {
                    // La fiche n'existe plus : les modifications en cours sont
                    // sans objet, et prévenir « vous allez perdre vos changements »
                    // en fermant serait faux.
                    if (dirtyRef) dirtyRef.current = false;
                    onDeleted();
                }}
            />
        )}
        </>
    );
}

export function AddBookFormBackend({ onSuccess, dirtyRef }: {
    onSuccess?: (bookId: number) => void,
    dirtyRef?: React.RefObject<boolean>
}) {
    const { toast } = useToast();

    const handleSubmit = async (formData: BookFormData): Promise<number> => {
        const formattedDate = formData.publishedYear
            ? `${formData.publishedYear}-01-01`
            : null;

        try {
            const response = await fetch('/api/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    publishedDate: formattedDate,
                    genres: formData.genres?.map(genre => parseInt(genre, 10)),
                }),
            });

            // `.catch` : une page d'erreur de l'hébergeur (délai, 502) n'est pas du
            // JSON, et le `response.json()` nu jetait alors une SyntaxError qui
            // finissait en « Échec du traitement du livre » sans toast.
            const data = await response.json().catch(() => null);

            // Le serveur nomme lui-même le livre qui porte déjà l'ISBN (409).
            if (!response.ok) throw userErrorFromResponse(response, data);

            toast({
                // @ts-expect-error same jsx problem
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">Le livre a été créé avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return data.book.id;
        } catch (error) {
            // Une coupure réseau passait ici sans AUCUN toast : seul un
            // « Échec du traitement du livre » s'affichait en bas du formulaire.
            const e = toUserFacingError(error);
            toast(apiErrorToast(e, { title: 'Création impossible', action: `Créer le livre « ${formData.title} »` }));
            throw e;
        }
    };

    return (
        <BookFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Ajouter le livre"
            loadingText="En ajoutant..."
            title="Ajouter un nouveau livre"
            onSuccess={onSuccess}
            dirtyRef={dirtyRef}
        />
    );
}

export function EditBookFormBackend({ bookId, initialData, deletedAt, onSuccess, onRestored, dirtyRef }: {
    bookId: string,
    initialData: BookFormData,
    /** ISO string when this fiche is soft-deleted; null/undefined otherwise. */
    deletedAt?: string | null,
    onSuccess?: (bookId: number, isDeleted?: boolean) => void,
    /** Fires once the fiche is restored, so a parent list can refresh its cached rows. */
    onRestored?: () => void,
    dirtyRef?: React.RefObject<boolean>
}) {
    const { toast } = useToast();
    const [isDeleted, setIsDeleted] = useState(Boolean(deletedAt));

    /**
     * L'appel de suppression, le refus et le sort du dossier audio vivent
     * maintenant dans DeleteBookModal — y compris le toast, qui doit dire ce
     * qu'est devenu l'enregistrement (laissé en place, transféré, mis en
     * corbeille) et non un « supprimé avec succès » qui passait le sujet sous
     * silence. Il ne reste ici qu'à refermer la fenêtre de modification.
     */
    const handleDeleted = () => {
        if (onSuccess) onSuccess(parseInt(bookId), true);
    };

    const handleSubmit = async (formData: BookFormData): Promise<number> => {
        const formattedDate = formData.publishedYear
            ? `${formData.publishedYear}-01-01`
            : null;

        try {
            const submissionData = {
                title: formData.title,
                subtitle: formData.subtitle || null,
                author: formData.author,
                publisher: formData.publisher || null,
                publishedDate: formattedDate,
                genres: formData.genres.filter(Boolean),
                isbn: formData.isbn || null,
                description: formData.description || null,
                available: formData.available,
                hiddenFromCatalogue: formData.hiddenFromCatalogue,
                // readingDurationMinutes n'est pas renvoyé : il est calculé à partir
                // des fichiers audio, la route l'ignore, et ce formulaire n'en tient
                // qu'une copie prise à l'ouverture — la renvoyer effaçait la mesure
                // faite entre-temps. Voir PUT /api/books/[id].
                pageCount: formData.pageCount
                    ? parseInt(formData.pageCount.toString())
                    : null
            };

            const response = await fetch(`/api/books/${bookId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(submissionData),
            });

            if (!response.ok) {
                // Le serveur nomme lui-même le livre qui porte déjà l'ISBN (409).
                throw userErrorFromResponse(response, await response.json().catch(() => null));
            }

            toast({
                // @ts-expect-error same jsx problem
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">Le livre a été mis à jour avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return parseInt(bookId);
        } catch (error) {
            const e = toUserFacingError(error);
            toast(apiErrorToast(e, { title: 'Enregistrement impossible', action: `Modifier le livre #${bookId}` }));
            throw e;
        }
    };

    return (
        <>
            {isDeleted && deletedAt && (
                <div className="mb-4">
                    <BookDeletedNotice
                        bookId={Number(bookId)}
                        title={initialData.title}
                        deletedAt={deletedAt}
                        onRestored={() => {
                            setIsDeleted(false);
                            onRestored?.();
                        }}
                    />
                </div>
            )}
            <BookFormBackendBase
                initialData={initialData}
                onSubmit={handleSubmit}
                onDeleted={handleDeleted}
                showDelete={true}
                submitButtonText="Mettre à jour le livre"
                loadingText="En cours de mise à jour..."
                title="Modifier le livre"
                onSuccess={onSuccess}
                audioBookId={Number.isInteger(Number(bookId)) ? Number(bookId) : undefined}
                dirtyRef={dirtyRef}
                readOnly={isDeleted}
            />
        </>
    );
}