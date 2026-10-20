'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, EyeOff } from 'lucide-react';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CoupDeCoeurList } from '@/listes-de-livres/CoupDeCoeurList';
import { BookModal } from '@/components/BookModal';
import { visibleListEntries } from '@/lib/books/listEntries';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { PublicBook } from '@/lib/books/publicBook';

type AdminListBook = CoupDeCoeur['books'][number] & {
    book: { deletedAt?: string | null; hiddenFromCatalogue?: boolean };
};
type AdminList = Omit<CoupDeCoeur, 'books'> & { active: boolean; books: AdminListBook[] };

/**
 * Une liste telle que les visiteurs la voient sur /listes-de-livres, avec les
 * mêmes composants — y compris une liste masquée, que le site public ne montre
 * pas : c'est surtout pour elle qu'on la regarde avant de la rendre visible.
 *
 * Ce qui est montré est la version enregistrée, lue par la route d'édition,
 * puis réduite à ce que le site affiche (visibleListEntries). Le haut de la page
 * publique — recherche, pagination, coordonnées — n'est pas repris : il ne
 * dépend pas de la liste.
 */
export default function ApercuListeDeLivresPage() {
    const { id } = useParams();
    const listId = Number(id);

    const [list, setList] = useState<AdminList | null>(null);
    const [failed, setFailed] = useState(false);
    const [selectedBook, setSelectedBook] = useState<PublicBook | null>(null);

    useEffect(() => {
        if (!Number.isInteger(listId)) return;
        let active = true;
        fetch(`/api/listes-de-livres/${listId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error('LOAD_FAILED');
                return res.json() as Promise<AdminList>;
            })
            .then((data) => {
                if (active) setList(data);
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => {
            active = false;
        };
    }, [listId]);

    const editorUrl = `/admin/listes-de-livres/${listId}`;

    if (failed || !Number.isInteger(listId)) {
        return (
            <Alert variant="destructive">
                <AlertDescription>Cette liste n&apos;a pas pu être chargée.</AlertDescription>
            </Alert>
        );
    }
    if (!list) {
        return <LoadingSkeleton message="Chargement de l'aperçu..." variant="admin" />;
    }

    const content: CoupDeCoeur[] = [{ ...list, books: visibleListEntries(list.books) }];

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="space-y-3">
                <Link
                    prefetch={false}
                    href={editorUrl}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> Retour à la liste
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Aperçu</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        La liste telle qu&apos;elle apparaît sur le site public, dans sa dernière version enregistrée.
                        Les livres supprimés ou masqués du catalogue n&apos;y figurent pas.
                    </p>
                </div>
                {!list.active && (
                    <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
                        <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        Cette liste est masquée : les visiteurs ne la voient pas encore.
                    </p>
                )}
            </div>

            <CoupDeCoeurList content={content} onBookClick={setSelectedBook} isTransitioning={false} />

            <BookModal book={selectedBook} isOpen={selectedBook !== null} onClose={() => setSelectedBook(null)} />
        </div>
    );
}
