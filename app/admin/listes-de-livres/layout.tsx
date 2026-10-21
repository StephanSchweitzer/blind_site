import type { ReactNode } from 'react';

// Le titre de l'onglet vit ici plutôt que dans chaque page : l'édition, la
// création et l'aperçu d'une liste sont des pages client, qui ne peuvent pas
// exporter de `metadata` elles-mêmes.
export const metadata = { title: 'Listes de livres' };

export default function ListesDeLivresLayout({ children }: { children: ReactNode }) {
    return children;
}
