import 'server-only';

import { prisma } from '@/lib/prisma';
import { resolvePrefix } from '@/lib/audio/state';

/**
 * Ce que la suppression d'une fiche avait détaché, et qui revient avec elle.
 *
 * Le pendant de markTrashOrigin (lib/audio/trash.ts) et de queueOrphanFolder
 * (lib/audio/orphanFolders.ts), pour le seul chemin qui ressuscite un livre :
 * la restauration d'une suppression depuis le journal des modifications
 * (/admin/stats, 14 jours). Cette route recrée la ligne à SON identifiant
 * d'origine et refuse si la place est prise — c'est précisément ce qui rend ce
 * rattachement possible, et sûr.
 *
 * Sans lui, une fiche restaurée revenait avec une corbeille vide pendant que ses
 * fichiers restaient rangés sous un livre supprimé, et son dossier continuait
 * d'être annoncé comme orphelin alors qu'elle le revendiquait de nouveau.
 *
 * Deux garde-fous, et ce sont eux qui comptent :
 *  - `bookId: null` : une ligne déjà rattachée à un livre — une fusion les
 *    réattribue au survivant — n'est jamais reprise. Rejouer une restauration ne
 *    peut donc rien défaire.
 *  - la ligne d'orphelin n'est retirée que si PERSONNE ne s'est prononcé dessus
 *    (ni rattachée, ni écartée) : ces décisions-là appartiennent à l'écran des
 *    orphelins, pas à ce chemin.
 *
 * Les deux tables se corrigent d'elles-mêmes au prochain passage de
 * scripts/sync-audio-links.ts, donc l'appelant peut traiter un échec comme sans
 * gravité — le livre, lui, est déjà restauré.
 */
export interface RestoredBookAudio {
    /** Lignes de corbeille rendues au livre. */
    reattachedTracks: number;
    /** Le dossier ne figure plus dans la file des orphelins. */
    clearedOrphan: boolean;
}

export async function reattachAudioAfterBookRestore(
    bookId: number,
    audioFilepath: string | null | undefined,
): Promise<RestoredBookAudio> {
    const { count: reattachedTracks } = await prisma.deletedAudioTrack.updateMany({
        where: { originBookId: bookId, bookId: null },
        data: { bookId },
    });

    let clearedOrphan = false;
    // Les deux écritures du chemin existent dans le corpus (avec et sans « / »
    // final) : les deux sont comparées, comme dans booksSharingAudioFolder.
    const prefix = resolvePrefix(audioFilepath);
    if (prefix) {
        const { count } = await prisma.orphanAudioFolder.deleteMany({
            where: {
                prefix: { in: [prefix, prefix.slice(0, -1)] },
                resolvedAt: null,
                dismissedAt: null,
            },
        });
        clearedOrphan = count > 0;
    }

    return { reattachedTracks, clearedOrphan };
}
