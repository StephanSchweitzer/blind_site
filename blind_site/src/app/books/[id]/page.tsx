// app/books/[id]/page.tsx
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { AppRouter } from '@/server/router';

interface BookDetailProps {
    params: { id: string };
}

export default async function BookDetail({ params }: BookDetailProps) {
    const trpc = createTRPCProxyClient<AppRouter>({
        links: [
            httpBatchLink({
                url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/trpc`,
            }),
        ],
    });

    const bookId = parseInt(params.id);
    const book = await trpc.book.getById.query(bookId);

    if (!book) {
        return (
            <main className="container mx-auto p-4">
                <p>Book not found.</p>
            </main>
        );
    }

    return (
        <main className="container mx-auto p-4">
            <h1 className="text-3xl font-bold">{book.title}</h1>
            <p className="mt-2 text-xl">by {book.author}</p>
            <p className="mt-4">{book.description}</p>
        </main>
    );
}
