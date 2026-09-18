import 'server-only';

import { prisma } from '@/lib/prisma';

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
 */
export async function guardLiveBooks(
    bookIds: number[],
): Promise<{ ok: true } | { ok: false; message: string; httpStatus: number }> {
    const ids = [...new Set(bookIds.filter((id) => Number.isInteger(id)))];
    if (!ids.length) return { ok: true };

    // `deletedAt` nommé explicitement : c'est ce qui lève le filtre de
    // l'extension (lib/prisma.ts) pour cette lecture.
    const deleted = await prisma.book.findMany({
        where: { id: { in: ids }, deletedAt: { not: null } },
        select: { id: true, title: true },
    });
    if (!deleted.length) return { ok: true };

    const named = deleted.map((b) => `« ${b.title} » (n°${b.id})`).join(', ');
    return {
        ok: false,
        httpStatus: 409,
        message:
            `${deleted.length > 1 ? 'Ces livres ont' : 'Ce livre a'} été supprimé${deleted.length > 1 ? 's' : ''} ` +
            `du catalogue : ${named}. Restaurez la fiche avant de lui rattacher une demande ou une attribution.`,
    };
}
