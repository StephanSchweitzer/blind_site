import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { putTrackUrl, headTrack, listBookTracks, listRawObjects, isAudioKey } from '@/lib/audio/bucket';
import { resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import {
    nextTrackName,
    isAllowedAudioExtension,
    isAppleDoubleName,
    splitExtension,
    newBookFolderPrefix,
    alreadyUploadedFinder,
} from '@/lib/audio/naming';
import { MAX_UPLOAD_BYTES } from '@/lib/audio/folder-selection';
import { pool } from '@/lib/concurrency';
import { booksSharingAudioFolder, sharedFolderUploadRefusal } from '@/lib/audio/sharedFolder';
import { softDeleteTrack, AudioTrashError } from '@/lib/audio/trash';
import { claimUploadLease, isLeaseToken } from '@/lib/audio/uploadLease';

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
    /**
     * « Remplacer » : the bucket key of the track this one file takes the place
     * of. Honoured on a single-file request only, and only on the FIRST
     * request — retries come back with `existingKey`. See replaceOne below.
     */
    replaceKey?: unknown;
    /**
     * Base64 SHA-256 of the file's bytes, computed client-side
     * (hooks/useAudioUpload.ts's `sha256Base64`) before this request is even
     * sent. Required so `putTrackUrl` can sign it into the URL — B2 needs the
     * value in hand at signing time (see bucket-core.ts's `putTrackUrl` doc
     * comment for why it can't just be sent along with the PUT unsigned).
     */
    checksum?: unknown;
}

/** Base64 SHA-256: 32 bytes -> 44 base64 chars, one trailing '=' pad. */
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

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
export const POST = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const files: RequestedFile[] = Array.isArray(body?.files) ? body.files : [];

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
        if (typeof f.checksum !== 'string' || !SHA256_BASE64.test(f.checksum)) {
            return NextResponse.json(
                { message: `Somme de contrôle manquante ou invalide pour « ${originalName} »` },
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

    // Un dossier revendiqué par deux fiches : y ajouter des pistes les ajoute à
    // l'autre aussi. Même refus que la suppression et le renommage
    // (lib/audio/sharedFolder.ts), `sharedWith` permettant à l'envoi de
    // s'arrêter là au lieu de retenter.
    const sharing = await booksSharingAudioFolder(bookId, book.audio_filepath);
    if (sharing.length) {
        return NextResponse.json(
            { message: sharedFolderUploadRefusal(sharing), sharedWith: sharing },
            { status: 409 },
        );
    }

    // Un seul envoi à la fois sur ce livre : deux envois simultanés reçoivent
    // le même nom de piste suivante, et le second écrase le premier. Voir
    // lib/audio/uploadLease.ts. Avant de créer le dossier : un envoi refusé ne
    // doit rien laisser derrière lui.
    if (!isLeaseToken(body?.leaseToken)) {
        return NextResponse.json(
            { message: 'Rechargez la page avant d’envoyer des fichiers : elle date d’une version précédente.' },
            { status: 400 },
        );
    }
    const lease = await claimUploadLease(bookId, me.id, body.leaseToken);
    if (!lease.ok) {
        return NextResponse.json(
            { message: lease.message, uploadLease: { holder: lease.holder, until: lease.until } },
            { status: 409 },
        );
    }

    // --- The book has no folder yet -----------------------------------------
    // Creating one is just Book.audio_filepath being set — there's nothing an
    // admin can usefully decide before that write, so it happens inline rather
    // than as a separate confirmation step. The one real risk is the folder
    // number: it falls back to Book.id for books created after the Access
    // import, and that can collide with a real Access id belonging to another
    // book's (possibly still-unlinked) recordings. So the occupancy check
    // always runs first — a prefix that already holds something is refused
    // rather than written into, and the admin is pointed at the orphan screen
    // to attach the real folder instead of creating a duplicate.
    if (!prefix) {
        const proposed = newBookFolderPrefix(book);
        const occupants = await listRawObjects(proposed);
        if (occupants.length) {
            return NextResponse.json(
                {
                    message:
                        'Un dossier existe déjà à cet emplacement et appartient peut-être à un autre livre. ' +
                        'L’enregistrement de ce livre existe peut-être déjà sous un autre nom : ' +
                        'vérifiez la page Audio orphelin et rattachez le bon dossier au lieu d’en créer un nouveau.',
                    occupied: true,
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

    // --- « Remplacer » : one file, into the slot of an existing track --------
    const replaceKey = files.length === 1 && typeof files[0].replaceKey === 'string' && typeof files[0].existingKey !== 'string'
        ? files[0].replaceKey
        : '';
    if (replaceKey) {
        return replaceOne({ bookId, prefix, replaceKey, file: files[0], userId: me.id });
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
    // Matched against the listing as it was BEFORE this batch: a file can only
    // duplicate something that was already there, never a sibling in its own
    // selection (one folder cannot hold two files of the same name).
    const findAlreadyUploaded = alreadyUploadedFinder(existing);
    /** Files already in the folder, not signed — see the duplicate guard below. */
    const skipped: { originalName: string; existingName: string }[] = [];

    const results: {
        originalName: string;
        filename: string;
        key: string;
        url: string;
        contentType: string;
        strategy: string;
        /** True when `key` was reused via `existingKey`, not freshly minted. */
        reused: boolean;
        checksum: string;
    }[] = [];

    for (const f of files) {
        // Already validated above (name present, allowed extension, size in range,
        // checksum present and shaped like a base64 SHA-256).
        const originalName = f.name as string;
        const size = f.size as number;
        const checksum = f.checksum as string;

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

        // --- The same file is already in the folder: don't send it again ----
        //
        // A second pick of a folder used to append a complete new set after
        // the first, because every fresh name sorts after the last track and
        // `existingKey` only survives within one upload session. Same title
        // (numbering aside) and same size to the byte is that file; it is
        // reported back as skipped rather than refused, so re-picking a folder
        // after a half-failed upload sends exactly what is missing. Not
        // applied to a reused key, which by design names this file's own
        // earlier landing.
        const alreadyThere = reuseKey ? null : findAlreadyUploaded({ name: originalName, size });
        if (alreadyThere) {
            skipped.push({ originalName, existingName: alreadyThere });
            continue;
        }

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

        results.push({
            originalName,
            filename,
            key,
            url: '',
            contentType,
            strategy,
            reused: Boolean(reuseKey),
            checksum,
        });
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
        r.url = await putTrackUrl(r.key, r.contentType, r.checksum, URL_TTL_SECONDS);
    }

    return NextResponse.json({ prefix, expiresIn: URL_TTL_SECONDS, files: results, skipped });
});

/**
 * « Remplacer » : sign ONE file into the place of an existing track.
 *
 * The alternative used to be « supprimez d'abord l'ancienne, puis envoyez la
 * nouvelle » — and a new file is always named after the folder's last track
 * (nextTrackName), so chapter 5 re-recorded played LAST, on the portal, in the
 * ZIP and on every CD burned from it, with nothing to say so.
 *
 * Here the new take inherits the old one's name (its extension aside), hence
 * its place in the playing order. The old take goes through the ordinary
 * corbeille path FIRST — copy, verify, row, then removal (softDeleteTrack) — and
 * only once it is out of the way is the PUT signed. So:
 *  - the corbeille refusing (B2 down) → 409, nothing signed, nothing lost;
 *  - the PUT then failing → the slot is empty and the old take is restorable;
 *    the dialogue's retry re-signs the same key through `existingKey`, never
 *    through this function again, so a landed new take is never trashed by a
 *    retry.
 */
async function replaceOne(opts: {
    bookId: number;
    prefix: string;
    replaceKey: string;
    file: RequestedFile;
    userId: number;
}): Promise<NextResponse> {
    const { bookId, prefix, replaceKey, file, userId } = opts;
    // Validated by the caller's structural pass.
    const originalName = file.name as string;
    const checksum = file.checksum as string;

    if (!isKeyInsidePrefix(replaceKey, prefix) || !isAudioKey(replaceKey)) {
        return NextResponse.json(
            { message: 'La piste à remplacer n’appartient pas au dossier de ce livre.' },
            { status: 403 },
        );
    }

    const oldName = replaceKey.slice(prefix.length);
    const oldSplit = splitExtension(oldName);
    const newExt = splitExtension(originalName).ext;
    // Same extension: the exact old key, its case included. Otherwise the old
    // base with the new extension — the base is what decides the place.
    const filename = newExt === oldSplit.ext ? oldName : `${oldSplit.base}.${newExt}`;
    const key = `${prefix}${filename}`;
    if (isAppleDoubleName(filename)) {
        return NextResponse.json({ message: 'Nom de piste invalide.' }, { status: 400 });
    }

    // A different extension lands on a different key: it must be free BEFORE the
    // old take is moved, or the refusal would come with the old take gone.
    if (key !== replaceKey && (await headTrack(key))) {
        return NextResponse.json(
            { message: `Un fichier nommé « ${filename} » existe déjà dans ce dossier.` },
            { status: 409 },
        );
    }

    let replaced: { filename: string; trashId: number } | null = null;
    if (await headTrack(replaceKey)) {
        try {
            const moved = await softDeleteTrack({ bookId, key: replaceKey, filename: oldName, userId });
            replaced = { filename: oldName, trashId: moved.trashId };
        } catch (e) {
            if (e instanceof AudioTrashError) {
                return NextResponse.json(
                    { message: `L’ancienne version n’a pas pu être mise en corbeille : ${e.message} Rien n’a été envoyé.` },
                    { status: 409 },
                );
            }
            throw e;
        }
    }
    // Absent already: an earlier request moved it and its answer was lost —
    // the slot is simply free.

    const contentType = MIME[newExt] ?? 'application/octet-stream';
    const url = await putTrackUrl(key, contentType, checksum, URL_TTL_SECONDS);
    return NextResponse.json({
        prefix,
        expiresIn: URL_TTL_SECONDS,
        files: [
            {
                originalName,
                filename,
                key,
                url,
                contentType,
                strategy: 'remplacement',
                reused: false,
                checksum,
            },
        ],
        skipped: [],
        replaced,
    });
}
