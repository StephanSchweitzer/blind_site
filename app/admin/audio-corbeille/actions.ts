'use server';

import { prisma } from '@/lib/prisma';
import { asAdmin, type CurrentUser } from '@/lib/auth/guards';
import { refresh } from 'next/cache';
import { revalidateChangedBooks, snapshotPublicBooks, type PublicBooksSnapshot } from '@/lib/revalidate-public';
import { restoreTrack, restoreTracksByIds, AudioTrashError } from '@/lib/audio/trash';
import { purgeTrashNow } from '@/lib/audio/purge';
import { describeClaimant, findFolderClaimant } from '@/lib/audio/sharedFolder';
import { listRawObjects } from '@/lib/audio/bucket';
import { pool } from '@/lib/concurrency';

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

/**
 * Les livres dont ces lignes de corbeille viennent, lus avant la restauration.
 * Ne jette pas, comme snapshotPublicBooks : null fera tout invalider.
 */
async function snapshotTrashedBooks(trashIds: number[]): Promise<PublicBooksSnapshot> {
    try {
        const rows = await prisma.deletedAudioTrack.findMany({
            where: { id: { in: trashIds } },
            select: { bookId: true },
        });
        return await snapshotPublicBooks(rows.map((r) => r.bookId));
    } catch (error) {
        console.error('snapshotTrashedBooks:', error);
        return null;
    }
}

/** Le titre de la fiche supprimée dont viennent ces lignes, s'il y en a une. */
async function deletedBookOf(trashIds: number[]): Promise<string | null> {
    const row = await prisma.deletedAudioTrack.findFirst({
        where: { id: { in: trashIds }, book: { deletedAt: { not: null } } },
        select: { book: { select: { title: true } } },
    });
    return row?.book?.title ?? null;
}

export async function restoreTrashedTrack(trashId: number): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        if (!Number.isInteger(trashId)) return { ok: false, message: 'Identifiant invalide' };

        try {
            const publicBefore = await snapshotTrashedBooks([trashId]);
            const { bookId, originalKey } = await restoreTrack({ trashId, userId: me.id });
            refresh();
            // La durée du livre a pu changer : le catalogue public l'affiche.
            if (bookId) await revalidateChangedBooks(publicBefore);
            if (bookId) {
                // Une fiche supprimée (soft delete) garde son dossier : le fichier y
                // revient, mais rien ne le montre tant que la fiche est supprimée.
                // « Restauré dans le dossier du livre » laissait le chercher.
                const book = await prisma.book.findUnique({
                    where: { id: bookId },
                    select: { title: true, deletedAt: true },
                });
                return {
                    ok: true,
                    message: book?.deletedAt
                        ? `Fichier restauré dans le dossier de la fiche supprimée « ${book.title} » : il ` +
                          'réapparaîtra avec elle si vous la restaurez.'
                        : 'Fichier restauré dans le dossier du livre.',
                };
            }

            // Sans fiche : le dossier a pu être rattaché depuis à un livre, qui
            // vient alors de gagner la piste (settleRestoredFolders l'a relu).
            const claimant = await findFolderClaimant(originalKey.slice(0, originalKey.lastIndexOf('/') + 1));
            return {
                ok: true,
                message: claimant
                    ? `Fichier restauré dans son dossier d’origine, qui appartient aujourd’hui à ${describeClaimant(claimant)}.`
                    : 'Fichier restauré dans son dossier d’origine. Ce dossier n’appartenant à ' +
                      'aucune fiche, il apparaît dans Audio orphelin.',
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
 * Par identifiants plutôt que par livre : un groupe « sans fiche » n'a
 * justement plus de bookId à filtrer dessus, et filtrer sur `bookId: null`
 * restaurerait tous les orphelins du système au lieu du seul groupe affiché.
 * Les ids viennent directement de ce que le
 * client a sous les yeux — la même population que celle sur laquelle il
 * propose déjà un bouton Restaurer par fichier.
 */
/**
 * Ce qu'une restauration de groupe a déjà fait aux appels précédents — voir
 * GROUP_RESTORE_TIME_BUDGET_MS. Rendu par chaque appel, renvoyé tel quel par
 * le suivant, pour que le dernier message compte tout le groupe.
 */
export interface GroupRestoreCarry {
    restored: number;
    failed: number;
    firstReason: string | null;
}

export type GroupRestoreResult = ActionResult & {
    /** Lignes pas encore commencées : à repasser, avec `carry`, à l'appel suivant. */
    remainingIds?: number[];
    carry?: GroupRestoreCarry;
};

/**
 * Combien de temps un appel lance encore des tranches de copies — le même
 * budget que les routes de suppression et de restauration d'un livre, pour la
 * même raison (une carte de cet écran a porté 108 fichiers, 1,8 Go). L'écran
 * rappelle avec `remainingIds` tant qu'il en reste et que l'appel a avancé.
 */
const GROUP_RESTORE_TIME_BUDGET_MS = 25_000;

export async function restoreTrashedGroup(
    trashIds: number[],
    carry: GroupRestoreCarry = { restored: 0, failed: 0, firstReason: null },
): Promise<GroupRestoreResult> {
    return asAdmin<GroupRestoreResult>(DENIED, async (me) => {
        const deadline = Date.now() + GROUP_RESTORE_TIME_BUDGET_MS;
        const ids = trashIds.filter((id) => Number.isInteger(id));
        if (!ids.length) return { ok: false, message: 'Identifiants invalides' };

        try {
            const publicBefore = await snapshotTrashedBooks(ids);
            const step = await restoreTracksByIds({ trashIds: ids, userId: me.id, deadline });
            refresh();
            if (step.restored > 0) await revalidateChangedBooks(publicBefore);

            const total: GroupRestoreCarry = {
                restored: carry.restored + step.restored,
                failed: carry.failed + step.failed.length,
                firstReason: carry.firstReason ?? step.failed[0]?.reason ?? null,
            };
            // Il en reste, et cet appel a avancé : l'écran rappelle.
            if (step.remainingIds.length && step.restored > 0) {
                return {
                    ok: true,
                    message: `${total.restored} fichier${total.restored > 1 ? 's' : ''} restauré${total.restored > 1 ? 's' : ''}…`,
                    remainingIds: step.remainingIds,
                    carry: total,
                };
            }

            // Coupé sans avoir rien ramené : ce qui reste compte comme un échec.
            const { restored } = total;
            const failedCount = total.failed + step.remainingIds.length;
            const reason = total.firstReason ?? 'interrompu avant la fin — relancez la restauration';
            // Même précision qu'à l'unité : revenus chez une fiche supprimée.
            const deletedBook = restored ? await deletedBookOf(ids) : null;
            const where = deletedBook
                ? ` Ils sont dans le dossier de la fiche supprimée « ${deletedBook} » : ils réapparaîtront avec elle si vous la restaurez.`
                : '';
            if (failedCount === 0) {
                return {
                    ok: true,
                    message: `${restored} fichier${restored > 1 ? 's' : ''} restauré${restored > 1 ? 's' : ''}.${where}`,
                };
            }
            if (restored === 0) {
                return {
                    ok: false,
                    message: `Aucun fichier restauré — ${reason}${failedCount > 1 ? ` (et ${failedCount - 1} autre${failedCount > 2 ? 's' : ''})` : ''}.`,
                };
            }
            return {
                ok: true,
                message: `${restored} fichier${restored > 1 ? 's' : ''} restauré${restored > 1 ? 's' : ''}, ${failedCount} échec${failedCount > 1 ? 's' : ''} (${reason}).${where}`,
            };
        } catch (e) {
            console.error('restoreTrashedGroup error:', e);
            return {
                ok: false,
                message: carry.restored
                    ? `La restauration s’est interrompue après ${carry.restored} fichier${carry.restored > 1 ? 's' : ''} : relancez-la pour le reste.`
                    : 'La restauration a échoué.',
            };
        }
    });
}

/**
 * « Supprimer définitivement » : un fichier ou tout un groupe, sans attendre la
 * purge nocturne — voir purgeTrashNow (lib/audio/purge.ts) pour ce qui est
 * effacé et pourquoi. Par identifiants, comme restoreTrashedGroup, pour la même
 * raison : un groupe « sans fiche » n'a plus de bookId à filtrer.
 *
 * Rien à rafraîchir côté livre : l'objet effacé vivait sous `corbeille/`, pas
 * dans le dossier du livre, donc ni la durée ni le nombre de pistes ne bougent.
 */
export async function purgeTrashedTracks(trashIds: number[]): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        const ids = trashIds.filter((id) => Number.isInteger(id));
        if (!ids.length) return { ok: false, message: 'Identifiants invalides' };

        try {
            const { purged, failed, skipped } = await purgeTrashNow({ trashIds: ids, userId: me.id });
            refresh();

            const s = (n: number) => (n > 1 ? 's' : '');
            if (purged === 0 && failed === 0) {
                return {
                    ok: false,
                    message: `Rien à supprimer — ${skipped > 1 ? 'ces fichiers ont' : 'ce fichier a'} déjà été restauré${s(skipped)} ou supprimé${s(skipped)}.`,
                };
            }
            if (failed === 0) {
                return {
                    ok: true,
                    message: `${purged} fichier${s(purged)} supprimé${s(purged)} définitivement.`,
                };
            }
            return {
                ok: purged > 0,
                message:
                    `${purged} fichier${s(purged)} supprimé${s(purged)}, ${failed} échec${s(failed)} : ` +
                    `le stockage a refusé la suppression. ${failed > 1 ? 'Ils restent' : 'Il reste'} dans la corbeille ; réessayez.`,
            };
        } catch (e) {
            console.error('purgeTrashedTracks error:', e);
            return { ok: false, message: 'La suppression définitive a échoué.' };
        }
    });
}

/**
 * Ce que le stockage dit aujourd'hui des lignes affichées : celles qui ne
 * peuvent PAS revenir, pour que l'écran le dise avant le clic.
 *
 *  - `occupied` : un fichier occupe de nouveau la clé d'origine — le plus
 *    souvent la nouvelle version d'un « Remplacer ». La restauration refuse
 *    d'écraser ; « Restaurer » était proposé quand même, et « Restaurer tout »
 *    finissait en « 1 restauré, 28 échecs ».
 *  - `copyMissing` : la copie de corbeille n'est plus dans le stockage. La ligne
 *    restait « Dans la corbeille » pour toujours, son bouton échouant à chaque
 *    clic sur « copie introuvable ». « Supprimer définitivement » la range dans
 *    « Purgées » : la suppression d'une clé absente réussit (voir purge.ts).
 *
 * Une LIST par dossier touché (dossier d'origine, dossier de corbeille), jamais
 * un HEAD par fichier : une page tient des centaines de lignes. Un dossier que
 * le stockage n'a pas su lister ne signale rien — l'écran reste comme avant.
 */
export type TrashStorageState = { ok: true; occupied: number[]; copyMissing: number[] } | { ok: false };

/** Assez pour une page entière de groupes dépliés. */
const MAX_STORAGE_IDS = 2000;
/**
 * Une copie toute neuve peut manquer à une LIST encore en retard sur l'écriture :
 * une ligne plus jeune que ça n'est jamais dite « copie absente ».
 */
const COPY_MISSING_MIN_AGE_MS = 5 * 60 * 1000;

const folderOf = (key: string) => key.slice(0, key.lastIndexOf('/') + 1);

export async function readTrashStorage(trashIds: number[]): Promise<TrashStorageState> {
    return asAdmin<TrashStorageState>({ ok: false }, async () => {
        const ids = trashIds.filter((id) => Number.isInteger(id)).slice(0, MAX_STORAGE_IDS);
        if (!ids.length) return { ok: true, occupied: [], copyMissing: [] };
        const rows = await prisma.deletedAudioTrack.findMany({
            where: { id: { in: ids }, restoredAt: null, purgedAt: null },
            select: { id: true, originalKey: true, trashKey: true, deletedAt: true },
        });
        const folders = [...new Set(rows.flatMap((r) => [folderOf(r.originalKey), folderOf(r.trashKey)]))];
        const listed = new Map<string, Set<string> | null>();
        await pool(folders, 4, async (folder) => {
            try {
                listed.set(folder, new Set((await listRawObjects(folder)).map((o) => o.key)));
            } catch (e) {
                console.error('readTrashStorage: dossier non listé', folder, e);
                listed.set(folder, null);
            }
        });
        const settledBefore = Date.now() - COPY_MISSING_MIN_AGE_MS;
        return {
            ok: true,
            occupied: rows.filter((r) => listed.get(folderOf(r.originalKey))?.has(r.originalKey)).map((r) => r.id),
            copyMissing: rows
                .filter((r) => {
                    const inTrash = listed.get(folderOf(r.trashKey));
                    return inTrash != null && !inTrash.has(r.trashKey) && r.deletedAt.getTime() < settledBefore;
                })
                .map((r) => r.id),
        };
    });
}
