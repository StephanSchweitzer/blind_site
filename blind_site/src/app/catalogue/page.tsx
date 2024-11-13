// app/catalogue/page.tsx
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { AppRouter } from '@/server/router';
import Link from 'next/link';

export default async function Catalogue() {
    const trpc = createTRPCProxyClient<AppRouter>({
        links: [
            httpBatchLink({
                url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/trpc`,
            }),
        ],
    });

    const books = await trpc.book.getAll.query();

    return (
        <main className="container mx-auto p-4">
            <h1 className="text-2xl font-bold">Catalogue</h1>
            <table className="min-w-full mt-4">
                <thead>
                <tr>
                    <th className="border px-4 py-2">Title</th>
                    <th className="border px-4 py-2">Author</th>
                </tr>
                </thead>
                <tbody>
                {books.map((book) => (
                    <tr key={book.id} className="hover:bg-gray-100">
                        <td className="border px-4 py-2">
                            <Link href={`/books/${book.id}`}>{book.title}</Link>
                        </td>
                        <td className="border px-4 py-2">{book.author}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </main>
    );
}
