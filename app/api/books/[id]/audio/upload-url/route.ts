import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { putTrackUrl, headTrack, listBookTracks, listRawObjects } from '@/lib/audio/bucket';
import { resolvePrefix } from '@/lib/audio/state';
import { nextTrackName, isAllowedAudioExtension, splitExtension, newBookFolderPrefix } from '@/lib/audio/naming';

/** Presigned PUTs are short-lived; a stalled upload asks for a fresh URL. */
const URL_TTL_SECONDS = 3600;
/** Generous next to the ~55 MB the corpus tops out at, while still bounded. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
/** One dialogue action shouldn't be able to queue an unbounded batch. */
const MAX_FILES_PER_REQUEST = 50;

/**
 * Content type is decided here, not by the browser.
 *
 * The signature covers the Content-Type header, so the client has to send back
 * exactly what was signed or B2 rejects the PUT. Deriving it server-side and
 * telling the client what to use removes a whole class of "works on my machine"
 * upload failures caused by browsers guessing differently.
 */
const MIME: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    m4b: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    flac: 'audio/flac',
    aac: 'audio/aac',
    wma: 'audio/x-ms-wma',
    aif: 'audio/aiff',
    aiff: 'audio/aiff',
};

interface RequestedFile {
    name?: unknown;
    size?: unknown;
}

/**
 * Mint presigned PUT URLs so the browser can upload straight to B2.
 *
 * The bytes never pass through Vercel — a folder of 40 tracks is well over a
 * gigabyte, and proxying that through a serverless function would be slow,
 * metered and pointless. The server's whole job is naming the object and signing
 * the URL, which is what keeps the B2 credentials off the client.
 *
 * Requires a B2 CORS rule allowing `s3_put` from the site origin. Without it the
 * browser's preflight fails and every upload dies before it starts.
 */
export const POST = withAdmin(async (req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const files: RequestedFile[] = Array.isArray(body?.files) ? body.files : [];
    const createFolder = body?.createFolder === true;

    if (!files.length) {
        return NextResponse.json({ message: 'Aucun fichier demandé' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
        return NextResponse.json(
            { message: `Maximum ${MAX_FILES_PER_REQUEST} fichiers par envoi` },
            { status: 400 },
        );
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true, audio_filepath: true, source_access_id: true },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    let prefix = resolvePrefix(book.audio_filepath);

    // --- The book has no folder yet -----------------------------------------
    // Creating one writes Book.audio_filepath, so it needs the admin's explicit
    // say-so rather than happening as a side effect of dropping in a file.
    if (!prefix) {
        const proposed = newBookFolderPrefix(book);
        if (!createFolder) {
            return NextResponse.json(
                {
                    message: 'Ce livre n’a pas encore de dossier audio.',
                    needsFolder: true,
                    proposedPrefix: proposed,
                },
                { status: 409 },
            );
        }

        // The folder number falls back to Book.id for books created after the
        // Access import, and that can collide with a real Access id. Never write
        // into a prefix that already holds something — it could be another
        // book's recordings.
        const occupants = await listRawObjects(proposed);
        if (occupants.length) {
            return NextResponse.json(
                {
                    message:
                        'Un dossier existe déjà à cet emplacement et appartient peut-être à un autre livre. ' +
                        'Rattachez le livre à ce dossier au lieu d’en créer un nouveau.',
                    proposedPrefix: proposed,
                },
                { status: 409 },
            );
        }

        await prisma.book.update({
            where: { id: bookId },
            data: { audio_filepath: proposed },
        });
        prefix = proposed;
    }

    // --- Name each file so it sorts after everything already there ------------
    const existing = await listBookTracks(prefix);
    const names = existing.map((t) => t.name);

    const results: { originalName: string; filename: string; key: string; url: string; contentType: string; strategy: string }[] = [];

    for (const f of files) {
        const originalName = typeof f.name === 'string' ? f.name : '';
        const size = typeof f.size === 'number' ? f.size : -1;

        if (!originalName) {
            return NextResponse.json({ message: 'Nom de fichier manquant' }, { status: 400 });
        }
        if (!isAllowedAudioExtension(originalName)) {
            return NextResponse.json(
                { message: `« ${originalName} » n’est pas un format audio accepté.` },
                { status: 400 },
            );
        }
        if (size < 0) {
            return NextResponse.json(
                { message: `Taille manquante pour « ${originalName} »` },
                { status: 400 },
            );
        }
        if (size === 0) {
            return NextResponse.json(
                { message: `« ${originalName} » est vide.` },
                { status: 400 },
            );
        }
        if (size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { message: `« ${originalName} » dépasse la taille maximale (500 Mo).` },
                { status: 400 },
            );
        }

        let named;
        try {
            named = nextTrackName(names, originalName);
        } catch (e) {
            return NextResponse.json({ message: (e as Error).message }, { status: 409 });
        }

        const key = `${prefix}${named.filename}`;

        // A name collision here means the numbering logic produced something
        // that already exists. Refuse rather than sign a URL that would
        // overwrite a recording — with a 30-day version window, an overwrite is
        // a slow-motion loss.
        if (await headTrack(key)) {
            return NextResponse.json(
                { message: `Un fichier nommé « ${named.filename} » existe déjà dans ce dossier.` },
                { status: 409 },
            );
        }

        const ext = splitExtension(named.filename).ext;
        const contentType = MIME[ext] ?? 'application/octet-stream';

        results.push({
            originalName,
            filename: named.filename,
            key,
            url: await putTrackUrl(key, contentType, URL_TTL_SECONDS),
            contentType,
            strategy: named.strategy,
        });

        // Feed the assigned name back in so the next file in the same batch is
        // numbered after it, not alongside it.
        names.push(named.filename);
    }

    return NextResponse.json({ prefix, expiresIn: URL_TTL_SECONDS, files: results });
});
