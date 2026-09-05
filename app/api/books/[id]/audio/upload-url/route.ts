import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { putTrackUrl, headTrack, listBookTracks, listRawObjects } from '@/lib/audio/bucket';
import { resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import {
    nextTrackName,
    isAllowedAudioExtension,
    isAppleDoubleName,
    splitExtension,
    newBookFolderPrefix,
} from '@/lib/audio/naming';
import { MAX_UPLOAD_BYTES } from '@/lib/audio/folder-selection';
import { pool } from '@/lib/concurrency';

/** Presigned PUTs are short-lived; a stalled upload asks for a fresh URL. */
const URL_TTL_SECONDS = 3600;
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
    /**
     * A key this same original file was already assigned by an earlier
     * signing request (a prior pass, or a "Renvoyer les fichiers en échec"
     * retry) — see hooks/useAudioUpload.ts's assignedKeysRef. Offering it
     * back lets a retry re-sign the identical key instead of being renamed
     * into a fresh slot; see the loop below for when it's honoured.
     */
    existingKey?: unknown;
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

    // Structural checks first, before the folder is even looked up: a batch
    // with one bad file used to fail after possibly already creating the
    // book's folder for the other 49. None of this needs the bucket.
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
    const sizeByExistingKey = new Map(existing.map((t) => [t.key, t.sizeBytes]));
    // `nextTrackName` guarantees each new name sorts after everything so far,
    // and every assigned name is fed back into `names` before the next file is
    // numbered — so a collision can only be against something already in this
    // listing or already assigned earlier in this same batch, both of which
    // are right here in memory. That used to be re-verified with a `headTrack`
    // per file (an extra ~50 serial round trips before a single byte moved);
    // a Set lookup answers the same question for free.
    const nameSet = new Set(names);

    const results: {
        originalName: string;
        filename: string;
        key: string;
        url: string;
        contentType: string;
        strategy: string;
        /** True when `key` was reused via `existingKey`, not freshly minted. */
        reused: boolean;
    }[] = [];

    for (const f of files) {
        // Already validated above (name present, allowed extension, size in range).
        const originalName = f.name as string;
        const size = f.size as number;

        // --- Re-sign an existing key instead of minting a new name ----------
        //
        // This is what makes a retry idempotent rather than a duplicate. The
        // scenario: N files PUT successfully, then the commit call itself
        // fails (blip, cold start) — hooks/useAudioUpload.ts marks the whole
        // sent batch recoverable, and a later pass (internal recovery, or a
        // manual "Renvoyer les fichiers en échec") re-requests a URL for the
        // same original file. Naming it fresh would land it under a new
        // number, leaving the first, successful upload in place — silently
        // doubling the track and its billed weight.
        //
        // Honoured only when the key belongs to this book's folder
        // (isKeyInsidePrefix — a client-supplied key is not trusted blindly),
        // NAMES SOMETHING THAT COULD BE A TRACK, and is either absent (the
        // earlier PUT never actually landed) or already sitting at the
        // announced size (it landed; a retry PUT is then an idempotent
        // overwrite of identical bytes — see putWithRetry's doc comment). A key
        // occupied at some OTHER size is not reused: that is not this file's
        // earlier attempt, so it falls through to a fresh name below exactly as
        // if no existingKey had been offered.
        //
        // The name check matters because this branch is the one place a
        // filename reaches the bucket WITHOUT passing through nextTrackName,
        // which is where the extension and AppleDouble rules are enforced for
        // every fresh name. Containment alone let a crafted request announce
        // `x.mp3` and be signed for `…/x.html` or `…/._piste.mp3` inside the
        // folder — objects isAudioKey then filters out of every listing, so
        // they would sit there counted by nothing and noticed by no one.
        // Same rules, both paths (see .claude/rules/audio-storage.md), and the
        // same fallthrough as a size mismatch rather than a refusal: a retry
        // must never be harder to complete than the first attempt.
        const requestedKey = typeof f.existingKey === 'string' ? f.existingKey : '';
        let reuseKey: string | null = null;
        if (requestedKey && isKeyInsidePrefix(requestedKey, prefix)) {
            const requestedName = requestedKey.slice(prefix.length);
            const nameIsUsable =
                isAllowedAudioExtension(requestedName) && !isAppleDoubleName(requestedName);
            const currentSize = sizeByExistingKey.get(requestedKey);
            if (nameIsUsable && (currentSize === undefined || currentSize === size)) {
                reuseKey = requestedKey;
            }
        }

        let filename: string;
        let strategy: string;
        let key: string;

        if (reuseKey) {
            key = reuseKey;
            filename = key.slice(prefix.length);
            strategy = 'reprise-cle-existante';
        } else {
            let named;
            try {
                named = nextTrackName(names, originalName);
            } catch (e) {
                return NextResponse.json({ message: (e as Error).message }, { status: 409 });
            }

            if (nameSet.has(named.filename)) {
                return NextResponse.json(
                    { message: `Un fichier nommé « ${named.filename} » existe déjà dans ce dossier.` },
                    { status: 409 },
                );
            }

            filename = named.filename;
            strategy = named.strategy;
            key = `${prefix}${filename}`;

            // Feed the assigned name back in so the next file in the same
            // batch is numbered after it, not alongside it.
            names.push(filename);
            nameSet.add(filename);
        }

        const ext = splitExtension(filename).ext;
        const contentType = MIME[ext] ?? 'application/octet-stream';

        results.push({ originalName, filename, key, url: '', contentType, strategy, reused: Boolean(reuseKey) });
    }

    // One remaining storage-level check, pooled rather than serial, and only
    // for freshly-minted names: a listing that went stale in the last few
    // hundred milliseconds — most plausibly a second admin's batch landing
    // between our listing and this one — could still make one of them
    // collide even though nothing in memory saw it coming. A reused key is
    // deliberately NOT re-checked here: finding it already occupied at the
    // matching size is the expected, harmless case the whole feature exists
    // to allow, not a clash to reject.
    const checked = await pool(
        results.filter((r) => !r.reused),
        10,
        async (r) => ({ key: r.key, taken: (await headTrack(r.key)) !== null }),
    );
    const clash = checked.find((c) => c.taken);
    if (clash) {
        return NextResponse.json(
            {
                message: `Un fichier nommé « ${clash.key.slice(prefix.length)} » existe déjà dans ce dossier.`,
            },
            { status: 409 },
        );
    }

    // Sign only now that every name in the batch is confirmed free.
    for (const r of results) {
        r.url = await putTrackUrl(r.key, r.contentType, URL_TTL_SECONDS);
    }

    return NextResponse.json({ prefix, expiresIn: URL_TTL_SECONDS, files: results });
});
