import React from 'react';
import { Dos } from '@/components/Dos';

/**
 * L'en-tête de chaque page publique : la rangée de dos de livres, le titre, une
 * ou deux phrases d'introduction.
 *
 * Aligné à gauche, sans encadré. Chaque page ouvrait sur la même grande boîte
 * centrée en verre dépoli, soulignée d'un trait en dégradé : un premier écran
 * entier sur téléphone, qui repoussait sous le pli ce qu'on venait chercher
 * (la recherche du catalogue, ses filtres). Celui-ci tient en quelques lignes.
 */
export function PageHeader({
    title,
    children,
}: {
    title: string;
    /** L'introduction, sous le titre. */
    children?: React.ReactNode;
}) {
    return (
        <header className="space-y-4">
            <Dos />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">{title}</h1>
            {children && (
                <div className="max-w-prose text-lg text-muted-foreground space-y-2">{children}</div>
            )}
        </header>
    );
}
