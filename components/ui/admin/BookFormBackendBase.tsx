import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, X, AlertCircle } from "lucide-react";
import BookSearch from "@/app/admin/books/components/book-search";
import DurationInputs from "@/components/ui/duration-inputs";
import { useToast } from "@/hooks/use-toast";

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

interface BookFormBackendBaseProps {
    initialData?: BookFormData;
    onSubmit: (formData: BookFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (bookId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
}

export function BookFormBackendBase({
                                        initialData,
                                        onSubmit,
                                        submitButtonText,
                                        loadingText,
                                        title,
                                        onSuccess,
                                        onDelete,
                                        showDelete
                                    }: BookFormBackendBaseProps) {
    const [formData, setFormData] = useState<BookFormData>(initialData || {
        title: '',
        subtitle: '',
        author: '',
        publisher: '',
        publishedYear: '',
        genres: [],
        isbn: '',
        description: '',
        available: true,
        readingDurationMinutes: 0,
        pageCount: undefined,
    });

    console.log(formData)


    const [genres, setGenres] = useState<Genre[]>([]);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const response = await fetch('/api/genres');
                if (response.ok) {
                    const data = await response.json();
                    setGenres(data);
                }
            } catch (error) {
                console.error('Error fetching genres:', error);
                setError('Failed to fetch genres');
            }
        };

        fetchGenres();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: name === 'pageCount' || name === 'publishedYear' || name === 'readingDurationMinutes'
                ? value === '' ? undefined : Number(value)
                : value,
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
            if (onSuccess) {
                onSuccess(newBookId);
            }
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to process book');
            }
            return;
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (window.confirm('Êtes-vous sûr de vouloir supprimer ce livre ?')) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('Failed to delete book');
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-700">
                <CardTitle className="text-gray-100">{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="destructive" className="border-red-500 bg-red-900/20">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                            <AlertTitle className="text-red-400">Erreur</AlertTitle>
                            <AlertDescription className="text-gray-200 mt-1">
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}

                    <BookSearch onBookSelect={handleBookSelect}/>

                    <div className="grid gap-6">
                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-gray-200">
                                Titre *
                            </label>
                            <Input
                                type="text"
                                name="title"
                                id="title"
                                required
                                value={formData.title}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                placeholder="Indiquer le titre du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-gray-200">
                                Sous-titre
                            </label>
                            <Input
                                type="text"
                                name="subtitle"
                                id="subtitle"
                                value={formData.subtitle || ''}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                placeholder="Indiquer le sous-titre du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="author" className="text-sm font-medium text-gray-200">
                                Auteur *
                            </label>
                            <Input
                                type="text"
                                name="author"
                                id="author"
                                required
                                value={formData.author}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                placeholder="Indiquer l'auteur du livre"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="publisher" className="text-sm font-medium text-gray-200">
                                Éditeur
                            </label>
                            <Input
                                type="text"
                                name="publisher"
                                id="publisher"
                                value={formData.publisher || ''}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                placeholder="Indiquer l'éditeur du livre"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="publishedYear" className="text-sm font-medium text-gray-200">
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
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Année de publication"
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="pageCount" className="text-sm font-medium text-gray-200">
                                    Nombre de pages
                                </label>
                                <Input
                                    type="number"
                                    name="pageCount"
                                    id="pageCount"
                                    min="1"
                                    value={formData.pageCount || ''}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Nombre de pages"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">
                                Genres
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {formData.genres.map(genreId => {
                                    const genre = genres.find(g => g.id === genreId);
                                    return genre ? (
                                        <div
                                            key={genre.id}
                                            className="bg-blue-200 text-gray-000 rounded-full px-3 py-1 text-sm flex items-center border border-gray-700"
                                        >
                                            {genre.name}
                                            <button
                                                type="button"
                                                onClick={() => removeGenre(genre.id)}
                                                className="ml-2 hover:text-gray-400"
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
                                        className="w-full justify-between bg-gray-800 border-gray-100 text-gray-200 hover:bg-gray-700 hover:text-gray-100"
                                    >
                                        {formData.genres.length > 0
                                            ? 'Sélectionner plus des genres associés...'
                                            : 'Sélectionner les genres associés...'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0 bg-gray-800 border-gray-700">
                                    <div className="flex flex-col h-80">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Recherche de genres..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="mb-2 bg-gray-700 border-gray-600 text-gray-100"
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
                                                            className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-700 text-gray-200 rounded-sm cursor-pointer"
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
                                                            {genre.name}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="isbn" className="text-sm font-medium text-gray-200">
                                ISBN
                            </label>
                            <Input
                                type="text"
                                name="isbn"
                                id="isbn"
                                value={formData.isbn || ''}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                placeholder="Indiquer le numéro ISBN du livre (facultatif)"
                            />
                        </div>

                        <DurationInputs formData={formData} handleChange={handleChange}/>

                        <div className="space-y-2">
                            <label htmlFor="description" className="text-sm font-medium text-gray-200">
                                Description
                            </label>
                            <Textarea
                                name="description"
                                id="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400 min-h-[150px]"
                                placeholder="Décrire le livre pour aider les utilisateurs à comprendre de quoi il s'agit."
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
                                className="border-gray-700 data-[state=checked]:bg-gray-700"
                            />
                            <label htmlFor="available" className="text-sm font-medium text-gray-200">
                                Disponible
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-100"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-700 hover:bg-red-600 text-gray-100 border-red-500"
                            >
                                Supprimer le livre
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

export function AddBookFormBackend({ onSuccess }: { onSuccess?: (bookId: number) => void }) {
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
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                let errorMessage = 'Échec de la création du livre';

                if (response.status === 409) {
                    errorMessage = 'Un livre avec cet ISBN existe déjà dans la base de données. Veuillez vérifier l\'ISBN ou mettre à jour le livre existant.';
                } else if (data?.message) {
                    errorMessage = data.message;
                }

                toast({
                    variant: "destructive",
                    // @ts-expect-error same jsx problem
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{errorMessage}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error same jsx problem
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">Le livre a été créé avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return data.book.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <BookFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Ajouter le livre"
            loadingText="En ajoutant..."
            title="Ajouter un nouveau livre"
            onSuccess={onSuccess}
        />
    );
}

export function EditBookFormBackend({ bookId, initialData, onSuccess }: {
    bookId: string,
    initialData: BookFormData,
    onSuccess?: (bookId: number, isDeleted?: boolean) => void
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Failed to delete book');
            }

            toast({
                // @ts-expect-error same jsx problem
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">Le livre a été supprimé avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            if (onSuccess) {
                onSuccess(parseInt(bookId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: BookFormData): Promise<number> => {
        const formattedDate = formData.publishedYear
            ? `${formData.publishedYear}-01-01`
            : null;

        try {
            const submissionData = {
                title: formData.title,
                subtitle: formData.subtitle,
                author: formData.author,
                publisher: formData.publisher || null,
                publishedDate: formattedDate,
                genres: formData.genres.filter(Boolean),
                isbn: formData.isbn || null,
                description: formData.description || null,
                available: formData.available,
                readingDurationMinutes: formData.readingDurationMinutes
                    ? parseInt(formData.readingDurationMinutes.toString())
                    : null,
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
                const errorData = await response.json().catch(() => null);
                let errorMessage = 'Échec de la mise à jour du livre';

                if (response.status === 409) {
                    errorMessage = 'Un livre avec cet ISBN existe déjà dans la base de données. Veuillez vérifier l\'ISBN ou mettre à jour le livre existant.';
                } else if (errorData?.message) {
                    errorMessage = errorData.message;
                }

                toast({
                    variant: "destructive",
                    // @ts-expect-error same jsx problem
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{errorMessage}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error same jsx problem
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">Le livre a été mis à jour avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return parseInt(bookId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <BookFormBackendBase
            initialData={initialData}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            showDelete={true}
            submitButtonText="Mettre à jour le livre"
            loadingText="En cours de mise à jour..."
            title="Modifier le livre"
            onSuccess={onSuccess}
        />
    );
}