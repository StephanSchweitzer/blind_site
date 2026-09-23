import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { prisma } from '@/lib/prisma';
import { resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import { softDeleteTrack, AudioTrashError } from '@/lib/audio/trash';
import { booksSharingAudioFolder, sharedFolderRefusal } from '@/lib/audio/sharedFolder';
import { renameTrack, AudioRenameError } from '@/lib/audio/rename';
import { splitExtension, isAppleDoubleName } from '@/lib/audio/naming';
import { isAudioKey } from '@/lib/audio/bucket';
import { unexpectedErrorResponse } from '@/lib/api-errors';

/**
 * Remove one track from a book's folder — into the corbeille, not out of
 * existence. See lib/audio/trash.ts for the copy-verify-then-delete sequence.
 *
 * Deliberate constraints:
 *  - one track per request. There is no bulk delete and no folder delete; the
 *    catalogue holds volunteer recordings that frequently have no other copy,
 *    and no dialogue button should be able to remove more than one at a time.
 *  - the key must resolve inside this book's own folder, re-checked here rather
 *    than trusted from the client.
 *  - the caller must echo back the exact filename, which the UI obtains by
 *    making the admin confirm against the displayed row.
 */
export const DELETE = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const key = typeof body?.key === 'string' ? body.key : '';
    const confirmFilename = typeof body?.filename === 'string' ? body.filename : '';

    if (!key) {
        return NextResponse.json({ message: 'Clé manquante' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    const prefix = resolvePrefix(book.audio_filepath);
    if (!isKeyInsidePrefix(key, prefix)) {
        return NextResponse.json(
            { message: 'Ce fichier n’appartient pas au dossier de ce livre.' },
            { status: 403 },
        );
    }

    // Le dossier peut être celui de deux fiches : supprimer la piste ici la
    // retire aussi à l'autre livre, sans que rien ne le dise. Refus nommant le
    // jumeau — voir lib/audio/sharedFolder.ts.
    const sharing = await booksSharingAudioFolder(bookId, book.audio_filepath);
    if (sharing.length) {
        return NextResponse.json(
            {
                message: sharedFolderRefusal(sharing, 'supprimer cette piste'),
                sharedWith: sharing,
            },
            { status: 409 },
        );
    }

    const filename = key.slice(prefix.length);

    // The client must name the file it means. Guards against a stale dialogue
    // acting on a row that has since shifted position.
    if (confirmFilename !== filename) {
        return NextResponse.json(
            { message: 'La confirmation ne correspond pas au fichier ciblé.' },
            { status: 409 },
        );
    }

    try {
        const result = await softDeleteTrack({
            bookId,
            key,
            filename,
            userId: me.id,
        });
        // Le catalogue public affiche la durée et la disponibilité, que
        // refreshBookAudioState vient de relire : sans cette invalidation, il gardait
        // l'ancienne jusqu'à une heure (le repli de unstable_cache).
        revalidateCatalogue();
        return NextResponse.json({
            message: `« ${filename} » a été déplacé dans la corbeille.`,
            ...result,
            sizeBytes: result.sizeBytes,
        });
    } catch (e) {
        if (e instanceof AudioTrashError) {
            return NextResponse.json({ message: e.message }, { status: 409 });
        }
        // « Le fichier est intact » était faux une fois sur deux : le journal
        // (AudioTrackEvent), le fichier témoin et la relecture de l'état audio
        // s'écrivent APRÈS le retrait de l'original. On ne sait pas où ça a lâché.
        return unexpectedErrorResponse({
            where: `DELETE /api/books/${bookId}/audio/track`,
            error: e,
            what: `La suppression de « ${filename} » a échoué.`,
            outcome:
                'La piste a pu être déplacée dans la corbeille malgré tout : rouvrez l’éditeur ' +
                'audio pour voir où elle est avant de recommencer.',
        });
    }
});

const extensionOf = (name: string): string => splitExtension(name).ext;

/**
 * Rename one track in place. Fixes the case where a file's own name is what
 * puts it out of order in the natural-sort listing (see lib/audio/bucket-core.ts):
 * the sort is already correct given the filename, so the filename is what
 * has to change.
 *
 * The extension is not up for negotiation — swapping it wouldn't just be
 * cosmetic, it could drop the file out of the AUDIO_EXT filter that decides
 * whether it counts as a track at all.
 */
export const PATCH = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const key = typeof body?.key === 'string' ? body.key : '';
    const confirmFilename = typeof body?.filename === 'string' ? body.filename : '';
    const newName = typeof body?.newName === 'string' ? body.newName.trim() : '';

    if (!key) {
        return NextResponse.json({ message: 'Clé manquante' }, { status: 400 });
    }
    if (!newName) {
        return NextResponse.json({ message: 'Le nouveau nom est vide.' }, { status: 400 });
    }
    if (newName.includes('/') || newName.includes('..') || newName.length > 255) {
        return NextResponse.json({ message: 'Nom de fichier invalide.' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    const prefix = resolvePrefix(book.audio_filepath);
    if (!isKeyInsidePrefix(key, prefix)) {
        return NextResponse.json(
            { message: 'Ce fichier n’appartient pas au dossier de ce livre.' },
            { status: 403 },
        );
    }

    const filename = key.slice(prefix.length);

    if (confirmFilename !== filename) {
        return NextResponse.json(
            { message: 'La confirmation ne correspond pas au fichier ciblé.' },
            { status: 409 },
        );
    }

    // Même refus que la suppression : renommer une piste d'un dossier partagé la
    // renomme — et peut la déplacer dans l'ordre de lecture — pour l'autre fiche
    // aussi, dont l'état audio ne serait pas relu.
    const sharing = await booksSharingAudioFolder(bookId, book.audio_filepath);
    if (sharing.length) {
        return NextResponse.json(
            {
                message: sharedFolderRefusal(sharing, 'renommer cette piste'),
                sharedWith: sharing,
            },
            { status: 409 },
        );
    }

    // Une piste avant, une piste après — isAudioKey, la définition que tous les
    // listings appliquent. Le renommage ne vérifiait que l'extension : un nom en
    // « ._ » (le marqueur AppleDouble, cf. isAppleDoubleName) passait, et la piste
    // disparaissait de tous les listings, de la durée et du poids de
    // l'enregistrement, sans avoir quitté le dossier. Dans l'autre sens, renommer
    // un fichier AppleDouble lui donnait un nom de piste : 300 octets de
    // métadonnées Mac entraient dans l'ordre de lecture.
    if (!isAudioKey(key)) {
        return NextResponse.json(
            { message: 'Ce fichier n’est pas une piste audio : il ne se renomme pas.' },
            { status: 400 },
        );
    }

    if (extensionOf(newName) !== extensionOf(filename)) {
        return NextResponse.json(
            { message: `L’extension doit rester « .${extensionOf(filename)} ».` },
            { status: 400 },
        );
    }

    // Le nouveau nom, lui, sous la règle d'écriture : isAppleDoubleName, comme
    // l'envoi (upload-url). L'extension vient d'être vérifiée, c'est tout ce qui
    // restait pour que la piste renommée soit encore une piste.
    if (isAppleDoubleName(newName)) {
        return NextResponse.json(
            {
                message:
                    'Ce nom ferait disparaître la piste des listings : un nom commençant par « ._ » ' +
                    '(ou contenant « ._ » après un espace) est celui d’un fichier de métadonnées Mac.',
            },
            { status: 400 },
        );
    }

    const newKey = `${prefix}${newName}`;

    try {
        const result = await renameTrack({ bookId, oldKey: key, newKey, userId: me.id });
        // Même raison que la suppression ci-dessus.
        revalidateCatalogue();
        return NextResponse.json({
            message: `« ${filename} » a été renommé en « ${newName} ».`,
            key: newKey,
            filename: newName,
            sizeBytes: result.sizeBytes,
        });
    } catch (e) {
        if (e instanceof AudioRenameError) {
            return NextResponse.json({ message: e.message }, { status: 409 });
        }
        // Même raison que pour la suppression : la copie peut avoir abouti
        // sans que l'original soit retiré (la piste existe alors sous ses deux
        // noms), ou tout peut être fait sauf le journal et l'état audio.
        return unexpectedErrorResponse({
            where: `PATCH /api/books/${bookId}/audio/track`,
            error: e,
            what: `Le renommage de « ${filename} » a échoué.`,
            outcome:
                'Il a pu aboutir en partie — la piste peut même apparaître sous ses deux noms : ' +
                'rouvrez l’éditeur audio pour vérifier avant de recommencer.',
        });
    }
});
