import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import { softDeleteTrack, AudioTrashError } from '@/lib/audio/trash';
import { renameTrack, AudioRenameError } from '@/lib/audio/rename';
import { splitExtension } from '@/lib/audio/naming';

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
        return NextResponse.json({
            message: `« ${filename} » a été déplacé dans la corbeille.`,
            ...result,
            sizeBytes: result.sizeBytes,
        });
    } catch (e) {
        if (e instanceof AudioTrashError) {
            return NextResponse.json({ message: e.message }, { status: 409 });
        }
        console.error('Suppression audio échouée', e);
        return NextResponse.json(
            { message: 'La suppression a échoué. Le fichier est intact.' },
            { status: 500 },
        );
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

    if (extensionOf(newName) !== extensionOf(filename)) {
        return NextResponse.json(
            { message: `L’extension doit rester « .${extensionOf(filename)} ».` },
            { status: 400 },
        );
    }

    const newKey = `${prefix}${newName}`;

    try {
        const result = await renameTrack({ bookId, oldKey: key, newKey, userId: me.id });
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
        console.error('Renommage audio échoué', e);
        return NextResponse.json(
            { message: 'Le renommage a échoué. Le fichier est intact.' },
            { status: 500 },
        );
    }
});
