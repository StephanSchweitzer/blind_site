import 'server-only';

import { prisma } from '@/lib/prisma';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Refuse de rattacher une demande ou une attribution à une fiche livre supprimée.
 *
 * Les sélecteurs de livre n'en proposent jamais (l'extension de suppression
 * douce les cache de toute recherche), mais rien côté serveur ne le vérifiait :
 * un formulaire resté ouvert pendant qu'un autre onglet supprimait la fiche, ou
 * un lien `?book=` gardé en favori, créait une demande vivante sur un livre
 * invisible — celle-là même que deleteBookWithAudio refuse d'abandonner quand
 * elle existe au moment de la suppression.
 *
 * Seules les fiches supprimées sont cherchées : un identifiant qui n'existe pas
 * du tout reste refusé par la clé étrangère, comme avant.
 *
 * Ce contrôle-ci est le refus RAPIDE, lu avant toute la validation de la route.
 * Il ne suffit pas seul : une suppression peut se conclure entre lui et
 * l'écriture. Le verrou vient de lockLiveBooks, dans la transaction qui écrit.
 */
export async function guardLiveBooks(
    bookIds: number[],
): Promise<{ ok: true } | { ok: false; message: string; httpStatus: number }> {
    const ids = uniqueIds(bookIds);
    if (!ids.length) return { ok: true };

    // `deletedAt` nommé explicitement : c'est ce qui lève le filtre de
    // l'extension (lib/prisma.ts) pour cette lecture.
    const deleted = await prisma.book.findMany({
        where: { id: { in: ids }, deletedAt: { not: null } },
        select: { id: true, title: true },
    });
    if (!deleted.length) return { ok: true };

    return { ok: false, httpStatus: 409, message: deletedBooksMessage(deleted) };
}

/** Levée DANS la transaction pour l'annuler ; la route la rend en 409. */
export class DeletedBookError extends Error {
    readonly httpStatus = 409;
    constructor(message: string) {
        super(message);
        this.name = 'DeletedBookError';
    }
}

/**
 * Le même refus que guardLiveBooks, mais sous verrou, dans la transaction qui
 * rattache la demande ou l'attribution au livre.
 *
 * Pourquoi un verrou : guardLiveBooks lit, puis la route valide, puis écrit.
 * La suppression d'un livre fait de même dans l'autre sens (compter l'usage
 * vivant, puis poser `deletedAt` — et en mode corbeille, déplacer les pistes
 * entre les deux, jusqu'à 45 s). Deux lectures croisées laissaient passer une
 * demande neuve sur une fiche qui disparaissait dans la foulée.
 *
 * `FOR SHARE` ici, `FOR UPDATE` dans lockBookForDeletion
 * (lib/books/deletionGuard.ts) : les deux s'excluent sur la ligne du livre.
 * Celui qui arrive second attend la validation de l'autre, puis relit la
 * ligne à jour (READ COMMITTED) — ce côté-ci voit alors `deletedAt`, la
 * suppression voit la nouvelle demande. Le verrou tombe avec la transaction.
 *
 * Requête brute : Prisma n'exprime pas `FOR SHARE`. Elle échappe aussi à
 * l'extension soft-delete, ce qu'on veut — c'est justement la fiche
 * supprimée qu'on cherche.
 */
export async function lockLiveBooks(tx: TransactionClient, bookIds: number[]): Promise<void> {
    const ids = uniqueIds(bookIds);
    if (!ids.length) return;

    const rows = await tx.$queryRaw<{ id: number; title: string; deletedAt: Date | null }[]>`
        SELECT id, title, "deletedAt" FROM "Book" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR SHARE`;
    const deleted = rows.filter((r) => r.deletedAt !== null);
    if (deleted.length) throw new DeletedBookError(deletedBooksMessage(deleted));
}

function uniqueIds(bookIds: number[]): number[] {
    return [...new Set(bookIds.filter((id) => Number.isInteger(id)))];
}

function deletedBooksMessage(deleted: { id: number; title: string }[]): string {
    const named = deleted.map((b) => `« ${b.title} » (n°${b.id})`).join(', ');
    return (
        `${deleted.length > 1 ? 'Ces livres ont' : 'Ce livre a'} été supprimé${deleted.length > 1 ? 's' : ''} ` +
        `du catalogue : ${named}. Restaurez la fiche avant de lui rattacher une demande ou une attribution.`
    );
}
