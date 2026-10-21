import { StickySubmitBar } from '@/components/ui/admin/StickySubmitBar';
import React, { useState, useMemo, useRef } from 'react';
import { useReferenceData } from '@/components/admin/ReferenceDataProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, X } from "lucide-react";
import BookSearch from "@/app/admin/books/components/book-search";
import { BookAudioButton } from '@/admin/BookAudioButton';
import { DeleteBookModal } from '@/admin/DeleteBookModal';
import BookDeletedNotice from '@/admin/BookDeletedNotice';
import DurationInputs from "@/components/ui/duration-inputs";
import { useToast } from "@/hooks/use-toast";
import { markToasted, useFormToast } from '@/hooks/useFormToast';
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

    const referenceData = useReferenceData();
    // The form keys genres by string id (formData.genres), the reference list by number.
    const genres = useMemo<Genre[]>(
        () => referenceData.genres.map((genre) => ({ ...genre, id: genre.id.toString() })),
        [referenceData.genres]
    );
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toastFailure } = useFormToast();
    /** La fenêtre de suppression, qui porte refus, décision audio et appel. */
    const [deleteOpen, setDeleteOpen] = useState(false);

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

        try {
            const newBookId = await onSubmit(formData);
            // Saved: there is nothing left to lose, so closing must not prompt.
            if (dirtyRef) dirtyRef.current = false;
            if (onSuccess) {
                onSuccess(newBookId);
            }
        } catch (err) {
            // Wrapper (Add/Edit) already toasts the detailed error — with the
            // contact line when the cause is unknown. The red box that repeated
            // it at the top of the form is gone.
            toastFailure(err);
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
        <div>
                    {audioBookId != null && (
                        <div className="mb-4 flex justify-end">
                        <BookAudioButton
                            bookId={audioBookId}
                            bookTitle={formData.title}
                            size="sm"
                            disabled={readOnly}
                        />
                        </div>
                    )}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {!initialData && <BookSearch onBookSelect={handleBookSelect}/>}

                    {/* min-w-0 : voir OrderFormBackendBase — sans lui, un fieldset
                        s'élargit au champ le plus large et déborde du modal. */}
                    <fieldset disabled={readOnly} className="min-w-0 space-y-6 disabled:opacity-60">
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
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="subtitle" className="text-sm font-medium text-foreground">
                                Sous-titre
                            </label>
                            <Input
                                type="text"
                                name="subtitle"
                                id="subtitle"
                                value={formData.subtitle || ''}
                                onChange={handleChange}
                                className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
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
                            />
                        </div>

                        {/* Année, pages et ISBN sur une rangée : trois champs courts. */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="publishedYear" className="text-sm font-medium text-foreground">
                                    Année de publication
                                </label>
                                <Input
                                    type="number"
                                    name="publishedYear"
                                    id="publishedYear"
                                    min="1800"
                                    max={new Date().getFullYear()}
                                    value={formData.publishedYear || ''}
                                    onChange={handleChange}
                                    className="bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
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
                                />
                            </div>

                            <div className="space-y-2 col-span-2 sm:col-span-1">
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
                                                ? 'Ajouter un genre…'
                                                : 'Choisir les genres…'}
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

                        {/* Pas sur un livre qu'on crée : il n'a encore aucun fichier
                            audio, la durée ne pourrait qu'y lire « Non calculée ». */}
                        {audioBookId != null && (
                            <DurationInputs
                                formData={formData}
                                bookId={audioBookId}
                                onMeasured={handleMeasuredDuration}
                            />
                        )}

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
                                N&apos;apparaît ni dans le catalogue ni dans les listes de livres envoyées aux adhérents (ex. sujet sensible : religion, politique, mœurs…). Reste visible ici.
                            </p>
                        </div>
                    </div>

                    <StickySubmitBar>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            variant="save" className="w-full"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>
                    </StickySubmitBar>
                    <div className="space-y-4">
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
            </div>

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
                title: "Livre créé",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return data.book.id;
        } catch (error) {
            // Une coupure réseau passait ici sans AUCUN toast : seul un
            // « Échec du traitement du livre » s'affichait en bas du formulaire.
            const e = toUserFacingError(error);
            toast(apiErrorToast(e, { title: 'Création impossible', action: `Créer le livre « ${formData.title} »` }));
            throw markToasted(e);
        }
    };

    return (
        <BookFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Ajouter le livre"
            loadingText="Ajout en cours…"
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
                title: "Livre enregistré",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            return parseInt(bookId);
        } catch (error) {
            const e = toUserFacingError(error);
            toast(apiErrorToast(e, { title: 'Enregistrement impossible', action: `Modifier le livre #${bookId}` }));
            throw markToasted(e);
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
                loadingText="Enregistrement…"
                onSuccess={onSuccess}
                audioBookId={Number.isInteger(Number(bookId)) ? Number(bookId) : undefined}
                dirtyRef={dirtyRef}
                readOnly={isDeleted}
            />
        </>
    );
}