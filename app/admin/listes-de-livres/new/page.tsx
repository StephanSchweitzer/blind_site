'use client';

import React from 'react';
import ListeDeLivresForm, { ListeDeLivresPayload } from '../components/liste-de-livres-form';

const EMPTY = { title: '', description: '', audioPath: null, active: true, books: [] };

export default function NouvelleListeDeLivresPage() {
    const create = async (payload: ListeDeLivresPayload) => {
        const res = await fetch('/api/listes-de-livres', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Échec de la création de la liste de livres.');
    };

    return <ListeDeLivresForm initialValues={EMPTY} onSave={create} />;
}
