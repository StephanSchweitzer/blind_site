'use server';

import { asAdmin, type CurrentUser } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { restoreTrack, AudioTrashError } from '@/lib/audio/trash';

/**
 * Restaurer une piste depuis la corbeille audio générale.
 *
 * POURQUOI CETTE ACTION EXISTE À CÔTÉ DE LA ROUTE PAR LIVRE
 *
 * POST /api/books/[id]/audio/trash exige que la ligne appartienne au livre nommé
 * dans l'URL — une bonne règle, qui rend justement irrécupérable la ligne dont la
 * fiche a été supprimée : `bookId` passe à null (SetNull) et il n'y a plus
 * d'identifiant à mettre dans l'URL. C'est exactement la population que cet écran
 * existe pour montrer.
 *
 * restoreTrack, lui, sait déjà travailler sans livre : il réécrit l'objet à sa
 * clé d'origine, refuse d'écraser un fichier qui occuperait la place, et ne
 * rafraîchit l'état audio que s'il reste un livre à rafraîchir. Le dossier
 * restauré n'appartenant à personne, il ressort dans /admin/audio-orphelins, où
 * il peut être rattaché — c'est la suite normale.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const DENIED: ActionResult = { ok: false, message: 'Permissions insuffisantes' };

const asAdminAction = (body: (me: CurrentUser) => Promise<ActionResult>) => asAdmin(DENIED, body);

export async function restoreTrashedTrack(trashId: number): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        if (!Number.isInteger(trashId)) return { ok: false, message: 'Identifiant invalide' };

        try {
            const { bookId } = await restoreTrack({ trashId, userId: me.id });
            revalidateAdmin();
            // Le poids du livre a pu changer : le catalogue public l'affiche.
            if (bookId) revalidateCatalogue();
            return {
                ok: true,
                message: bookId
                    ? 'Fichier restauré dans le dossier du livre.'
                    : 'Fichier restauré dans son dossier d’origine. Ce dossier n’appartenant à ' +
                      'aucune fiche, il apparaîtra dans Audio orphelins.',
            };
        } catch (e) {
            if (e instanceof AudioTrashError) return { ok: false, message: e.message };
            console.error('restoreTrashedTrack error:', e);
            return { ok: false, message: 'La restauration a échoué.' };
        }
    });
}
