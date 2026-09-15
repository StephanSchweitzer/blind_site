'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import ListeDeLivresForm, { ListeDeLivresPayload, ListeDeLivresValues } from '../components/liste-de-livres-form';
import { ListBook } from '../components/list-book';

interface LoadedList {
    id: number;
    title: string;
    description: string | null;
    audioPath: string | null;
    active: boolean;
    createdAt: string;
    books: { book: ListBook }[];
}

export default function ModifierListeDeLivresPage() {
    const router = useRouter();
    const { id } = useParams();
    const listId = Number(id);

    const [loaded, setLoaded] = useState<{ values: ListeDeLivresValues; createdAt: string } | null>(null);

    useEffect(() => {
        if (!Number.isInteger(listId)) return;
        let active = true;

        fetch(`/api/listes-de-livres/${listId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error('LOAD_FAILED');
                return res.json() as Promise<LoadedList>;
            })
            .then((data) => {
                if (!active) return;
                setLoaded({
                    createdAt: data.createdAt,
                    values: {
                        title: data.title,
                        description: data.description ?? '',
                        audioPath: data.audioPath || null,
                        active: data.active,
                        books: data.books.map((entry) => entry.book),
                    },
                });
            })
            .catch((err) => {
                console.error('Erreur lors du chargement de la liste de livres:', err);
                if (active) router.push('/admin/listes-de-livres');
            });

        return () => {
            active = false;
        };
    }, [listId, router]);

    if (!loaded) {
        return <LoadingSkeleton message="Chargement de la liste de livres..." variant="admin" />;
    }

    const update = async (payload: ListeDeLivresPayload) => {
        const res = await fetch(`/api/listes-de-livres/${listId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Échec de la mise à jour de la liste de livres.');
    };

    const remove = async () => {
        const res = await fetch(`/api/listes-de-livres/${listId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Échec de la suppression de la liste de livres.');
    };

    return (
        <ListeDeLivresForm
            listId={listId}
            createdAt={loaded.createdAt}
            initialValues={loaded.values}
            onSave={update}
            onDelete={remove}
        />
    );
}
