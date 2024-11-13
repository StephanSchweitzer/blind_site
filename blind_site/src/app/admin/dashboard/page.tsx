// app/admin/dashboard/page.tsx
'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpc } from '@/utils/trpc';

export default function AdminDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [description, setDescription] = useState('');

    const utils = trpc.useContext();
    const addBook = trpc.book.add.useMutation({
        onSuccess: () => {
            utils.book.getAll.invalidate();
        },
    });

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/admin/login');
        }
    }, [status, router]);

    if (status === 'loading') {
        return <p>Loading...</p>;
    }

    const handleAddBook = async (e: React.FormEvent) => {
        e.preventDefault();
        await addBook.mutateAsync({ title, author, description });
        setTitle('');
        setAuthor('');
        setDescription('');
    };

    return (
        <main className="container mx-auto p-4">
            <div className="flex justify-between">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <button onClick={() => signOut()} className="text-red-500">
                    Logout
                </button>
            </div>
            <form onSubmit={handleAddBook} className="mt-4">
                <input
                    type="text"
                    placeholder="Title"
                    className="w-full p-2 border"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Author"
                    className="w-full p-2 border mt-2"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                />
                <textarea
                    placeholder="Description"
                    className="w-full p-2 border mt-2"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
                <button className="w-full bg-green-500 text-white p-2 mt-4">
                    Add Book
                </button>
            </form>
        </main>
    );
}
