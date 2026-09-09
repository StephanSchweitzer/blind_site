import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

/**
 * Quels livres figurent déjà dans une liste de livres, et dans lesquelles.
 *
 * Sert l'avertissement du sélecteur de livres : la coupure « nouveautés depuis
 * la dernière liste » ne rattrape pas tout — un livre ajouté à la main à une
 * liste ancienne, ou une fiche recréée après coup, repasse pour une nouveauté.
 * Le permanent doit pouvoir le voir avant de publier deux fois le même titre.
 *
 * Renvoyé en bloc, sans paramètre `ids` : CoupsDeCoeurBooks est une table de
 * jonction minuscule (une centaine de lignes en dev, quelques milliers au pire
 * en production — une liste porte une vingtaine de livres), là où la suggestion
 * affiche couramment plus de mille identifiants. Tout envoyer tient dans une
 * requête et une URL courte, quand `?ids=` demanderait de découper la question
 * en une dizaine d'appels. Le balayage sans index sur `bookId` (la clé primaire
 * est `(coupsDeCoeurId, bookId)`) porte donc sur une table qu'on lit d'un bloc
 * de toute façon.
 */
export const GET = withAdmin(async () => {
    try {
        const [rows, lists] = await Promise.all([
            prisma.coupsDeCoeurBooks.findMany({
                select: { bookId: true, coupsDeCoeurId: true },
            }),
            prisma.coupsDeCoeur.findMany({
                select: { id: true, title: true, active: true },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        // Les listes d'un livre sortent de la plus récente à la plus ancienne :
        // l'avertissement n'en nomme qu'une, autant que ce soit celle dont le
        // permanent se souvient.
        const rank = new Map(lists.map((list, index) => [list.id, index]));
        const books: Record<number, number[]> = {};
        for (const row of rows) {
            (books[row.bookId] ??= []).push(row.coupsDeCoeurId);
        }
        for (const ids of Object.values(books)) {
            ids.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
        }

        return NextResponse.json({
            lists: Object.fromEntries(
                lists.map((list) => [list.id, { title: list.title, active: list.active }])
            ),
            books,
        });
    } catch (error) {
        console.error('Failed to fetch coups de coeur memberships:', error);
        return NextResponse.json(
            { error: 'Failed to fetch memberships' },
            { status: 500 }
        );
    }
});
