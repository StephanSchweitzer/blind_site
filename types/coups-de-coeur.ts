export interface Genre {
    id: number;
    name: string;
}

// This matches exactly what BookModal expects
export interface Book {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    description: string;
    publishedDate: Date | null;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    isbn: string | null;
    publisher: string | null;
    available: boolean;
    createdAt: Date;
    updatedAt: Date;
    addedById: number;
    genres: {
        genre: Genre;
    }[];
}

export interface CoupDeCoeur {
    id: number;
    title: string;
    description: string;
    audioPath: string;
    books: {
        book: Book;
    }[];
}

export interface CoupsDeCoeurResponse {
    items: CoupDeCoeur[];
    total: number;
    page: number;
    totalPages: number;
}