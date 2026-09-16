import { prisma } from '@/lib/prisma';
import { resolveMergedBook } from '@/lib/books/merged';

/**
 * Le filtre « ce livre » des listes de demandes et d'attributions
 * (`?bookId=123`).
 *
 * Un filtre dédié plutôt qu'un numéro de livre accepté par la recherche : un
 * nombre tapé dans la recherche désigne déjà une demande (et, côté
 * attributions, une attribution), et les trois séries de numéros se
 * chevauchent — « 16440 » aurait ramené l'attribution cherchée noyée parmi les
 * lignes du livre n°16440. Ici l'intention est explicite, affichée dans un
 * badge qu'on retire d'un clic, et l'URL se partage. Il se pose depuis la liste
 * elle-même (BookFilterPicker) autant que depuis un lien du catalogue.
 *
 * Le sous-titre est porté jusqu'ici pour ce sélecteur : le corpus tient des
 * séries dont les volumes ne se distinguent QUE par lui (« Le Collier de la
 * Reine » — Tome 1 / Tome 2 / 1-2, même auteur). Sans lui, le champ annonce le
 * livre choisi sous un libellé qui en désigne trois — ce que ce filtre est
 * précisément là pour éviter.
 */
export type BookFilter = { id: number; title: string; subtitle: string | null; author: string };

export async function resolveBookFilter(raw: string | string[] | undefined): Promise<BookFilter | null> {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const bookId = Number(value);
    if (!value || !Number.isInteger(bookId) || bookId <= 0) return null;

    const select = { id: true, title: true, subtitle: true, author: true } as const;
    const book = await prisma.book.findUnique({ where: { id: bookId }, select });
    if (book) return book;

    // Un lien vers une fiche fusionnée depuis mène à la fiche conservée : la
    // fusion y a déplacé ses demandes et attributions (voir lib/books/merged.ts).
    const merged = await resolveMergedBook(bookId);
    if (!merged) return null;
    // Un identifiant introuvable renvoie null, et la page ignore alors le
    // filtre plutôt que d'afficher une liste vide sans badge pour l'expliquer.
    return prisma.book.findUnique({ where: { id: merged.canonicalId }, select });
}
