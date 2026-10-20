'use client';

import React from 'react';
import ListeDeLivresForm, { ListeDeLivresPayload } from '../components/liste-de-livres-form';

const EMPTY = { title: '', description: '', audioPath: null, active: true, books: [], notes: {}, customOrder: false };

export default function NouvelleListeDeLivresPage() {
    const create = async (payload: ListeDeLivresPayload) => {
        const res = await fetch('/api/listes-de-livres', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Échec de la création de la liste de livres.');
        const created = (await res.json().catch(() => null)) as { id?: unknown } | null;
        return typeof created?.id === 'number' ? { id: created.id } : undefined;
    };

    return <ListeDeLivresForm initialValues={EMPTY} onSave={create} />;
}
