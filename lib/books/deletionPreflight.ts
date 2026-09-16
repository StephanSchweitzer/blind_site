import 'server-only';

import { prisma } from '@/lib/prisma';
import { listRawObjects, toOrderedTracks } from '@/lib/audio/bucket';
import { resolvePrefix } from '@/lib/audio/state';
import { booksSharingAudioFolder, sharedFolderRefusal } from '@/lib/audio/sharedFolder';
import {
    readBookUsage,
    bookUsageBlocksDeletion,
    bookUsageRefusal,
    bookUsageLinks,
} from './deletionGuard';
import type { BookDeletionPreflightResponse } from '@/types/api/book.api';

/**
 * Tout ce qu'il faut savoir AVANT de proposer de supprimer une fiche livre :
 * ce qui l'interdit, et ce qu'il reste à décider.
 *
 * POURQUOI UNE SEULE FONCTION, APPELÉE DEUX FOIS
 *
 * L'interface ne découvrait ces refus qu'en tentant la suppression et en lisant
 * le 409 : le permanent confirmait « supprimer », attendait, et apprenait
 * seulement alors qu'une demande le nommait ou qu'un jumeau partageait son
 * dossier audio. La fenêtre de suppression interroge donc ce contrôle à
 * l'ouverture (GET /api/books/[id]/deletion-check) — et la route DELETE le
 * refait, sur les mêmes lignes de code, avant d'agir. Deux appels, une seule
 * définition : la fenêtre et la tentative ne peuvent pas être en désaccord, et
 * ce que la fenêtre a lu il y a une minute est revérifié au moment d'écrire.
 *
 * Le coût est un LIST du préfixe à l'ouverture de la fenêtre — le même que
 * l'ouverture de l'éditeur audio, donc non mis en cache. Ce listing est rendu
 * à l'appelant (`objects`) pour que le chemin d'écriture n'en paie pas un second.
 */

/**
 * La forme rendue est celle de la réponse de GET /api/books/[id]/deletion-check
 * (types/api/book.api.ts) : la fenêtre de suppression est un composant client et
 * ne peut pas dépendre de ce module `server-only`. Un seul type, donc, pour que
 * les deux côtés ne dérivent pas.
 *
 * Ce qu'il porte, et pourquoi :
 *  - `usageRefusal` / `usage` / `links` : les demandes et attributions, vivantes
 *    et supprimées, avec de quoi les atteindre ;
 *  - `audio.sharedRefusal` : le dossier est aussi celui d'une autre fiche, donc
 *    aucune option ne doit être proposée — supprimer ici viderait le dossier du
 *    jumeau, dont l'enregistrement est souvent la seule copie ;
 *  - `audio.trashCount` : des pistes sont déjà en corbeille pour ce livre. Elles
 *    perdent leur fiche avec lui (`bookId` est SetNull) et ne restent lisibles
 *    que par l'empreinte de markTrashOrigin — la fenêtre le dit.
 */
export type BookDeletionPreflight = BookDeletionPreflightResponse;

export interface BookDeletionCheck {
    book: { id: number; title: string; audioFilepath: string | null } | null;
    preflight: BookDeletionPreflight | null;
    /** Listing brut, complet et non filtré du préfixe (voir refreshBookAudioState). */
    objects: { key: string; size: number }[];
}

export async function readBookDeletionCheck(bookId: number): Promise<BookDeletionCheck> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true, audio_filepath: true },
    });
    if (!book) return { book: null, preflight: null, objects: [] };

    const prefix = resolvePrefix(book.audio_filepath);
    const [usage, sharedWith, trashCount, objects] = await Promise.all([
        readBookUsage(bookId),
        booksSharingAudioFolder(bookId, book.audio_filepath),
        prisma.deletedAudioTrack.count({ where: { bookId, restoredAt: null, purgedAt: null } }),
        prefix ? listRawObjects(prefix) : Promise.resolve([]),
    ]);

    // Mêmes règles de comptage que refreshBookAudioState : l'audio directement
    // dans le dossier, jamais un sous-dossier — un objet qu'aucun chemin
    // d'écriture ne peut toucher ne doit pas peser dans une décision.
    const tracks = toOrderedTracks(objects, prefix);

    const usageRefusal = bookUsageBlocksDeletion(usage) ? bookUsageRefusal(usage) : null;
    const sharedRefusal = sharedWith.length
        ? sharedFolderRefusal(sharedWith, 'supprimer ce livre')
        : null;

    return {
        book: { id: book.id, title: book.title, audioFilepath: book.audio_filepath },
        objects,
        preflight: {
            bookId,
            title: book.title,
            usageRefusal,
            usage,
            links: bookUsageLinks(bookId),
            audio: {
                prefix,
                trackCount: tracks.length,
                sizeBytes: tracks.reduce((total, t) => total + t.sizeBytes, 0),
                sharedWith,
                sharedRefusal,
                trashCount,
            },
            blocked: usageRefusal !== null || sharedRefusal !== null,
        },
    };
}
