'use server';

import { asAdmin, type CurrentUser } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { restoreTrack, restoreTracksByIds, AudioTrashError } from '@/lib/audio/trash';

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

/**
 * Restaurer d'un coup toutes les lignes d'un groupe (un livre) affiché sur
 * cet écran — le pendant « tout le livre » de restoreTrashedTrack ci-dessus,
 * pour la carte dépliée d'un livre qui a laissé plusieurs fichiers en
 * corbeille.
 *
 * Passe par restoreTracksByIds plutôt que restoreTracks(bookId) : un groupe
 * « sans fiche » n'a justement plus de bookId à filtrer dessus, et
 * restoreTracks(bookId: null) restaurerait tous les orphelins du système au
 * lieu du seul groupe affiché. Les ids viennent directement de ce que le
 * client a sous les yeux — la même population que celle sur laquelle il
 * propose déjà un bouton Restaurer par fichier.
 */
export async function restoreTrashedGroup(trashIds: number[]): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        const ids = trashIds.filter((id) => Number.isInteger(id));
        if (!ids.length) return { ok: false, message: 'Identifiants invalides' };

        try {
            const { restored, failed } = await restoreTracksByIds({ trashIds: ids, userId: me.id });
            revalidateAdmin();
            if (restored > 0) revalidateCatalogue();

            if (failed.length === 0) {
                return {
                    ok: true,
                    message: `${restored} fichier${restored > 1 ? 's' : ''} restauré${restored > 1 ? 's' : ''}.`,
                };
            }
            if (restored === 0) {
                return {
                    ok: false,
                    message: `Aucun fichier restauré — ${failed[0].reason}${failed.length > 1 ? ` (et ${failed.length - 1} autre${failed.length > 2 ? 's' : ''})` : ''}.`,
                };
            }
            return {
                ok: true,
                message: `${restored} fichier${restored > 1 ? 's' : ''} restauré${restored > 1 ? 's' : ''}, ${failed.length} échec${failed.length > 1 ? 's' : ''} (${failed[0].reason}).`,
            };
        } catch (e) {
            console.error('restoreTrashedGroup error:', e);
            return { ok: false, message: 'La restauration a échoué.' };
        }
    });
}
