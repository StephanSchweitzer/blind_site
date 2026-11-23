import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { putTrackUrl, headTrack, headTrackChecksum, listBookTracks, listRawObjects, isAudioKey } from '@/lib/audio/bucket';
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
import { claimUploadLease, isLeaseToken, UPLOAD_LEASE_SECONDS } from '@/lib/audio/uploadLease';
import { issueKeyTicket, verifyKeyTicket } from '@/lib/audio/keyTicket';
import { revalidateChangedBooks, snapshotPublicBooks } from '@/lib/revalidate-public';

/**
 * A presigned PUT lives no longer than the upload's claim on the book.
 *
 * It used to live an hour against a ten-minute claim: a tab asleep for more
 * than ten minutes (a laptop lid closed mid-upload) lost the book to another
 * upload, which was given the same « next » name — and on waking, its retry
 * re-sent the old URL over that upload's file. Expiry is only checked when a
 * PUT starts, so a long transfer is unaffected; the dialogue re-signs a URL
 * that is getting old before using it (hooks/useAudioUpload.ts), and that
 * re-signing request renews the claim — or is refused because the book is
 * someone else's now.
 */
const URL_TTL_SECONDS = UPLOAD_LEASE_SECONDS;
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
     * The ticket that came with `existingKey` (lib/audio/keyTicket.ts). Needed
     * only to re-sign an ABSENT key: without it, a crafted request could name
     * any free key and skip nextTrackName.
     */
    keyTicket?: unknown;
    /**
     * « Remplacer » : the bucket key of the track this one file takes the place
     * of. Honoured on a single-file request only. The FIRST request moves the
     * old take (replaceOne below); retries also carry `existingKey`, the slot
     * they were given, and are never allowed to fall through to a fresh name —
     * see « A replacement's retry » in the loop.
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
    const replaceKey = files.length === 1 && typeof files[0].replaceKey === 'string' ? files[0].replaceKey : '';
    if (replaceKey && typeof files[0].existingKey !== 'string') {
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
        /**
         * Already in the bucket with this file's bytes (see the reuse rule
         * above): no URL, the dialogue skips the PUT and commits it.
         */
        landed: boolean;
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
        // directly in it (no sub-folder: nothing lists those, see
        // toOrderedTracks), NAMES SOMETHING THAT COULD BE A TRACK, and is
        // either:
        //  - absent — the earlier PUT never landed: the key is signed again,
        //    and writing it overwrites nothing (the upload lease keeps any
        //    other upload out of the folder meanwhile). Only with the ticket
        //    this route handed out with the key (lib/audio/keyTicket.ts): an
        //    absent key skips nextTrackName, so without proof that WE assigned
        //    it, a crafted one could land anywhere in the playing order;
        //  - or present with the SAME BYTES — the SHA-256 B2 stored for it
        //    (headTrackChecksum) equals this file's. It landed; nothing is
        //    signed (`landed`), the dialogue skips the PUT and hands it
        //    straight to the commit, which is what the lost answer was for.
        // A key present with anything else is not reused: not this file's
        // earlier attempt, so it falls through to a fresh name below exactly as
        // if no existingKey had been offered. Same size used to be enough to
        // re-sign it — so a crafted existingKey naming another track of the
        // same size in the folder overwrote that take, with only B2's 30-day
        // noncurrent version left of it. A PUT is now only ever signed onto a
        // key that holds nothing.
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
        let landed = false;
        if (requestedKey && isKeyInsidePrefix(requestedKey, prefix)) {
            const requestedName = requestedKey.slice(prefix.length);
            const nameIsUsable =
                !requestedName.includes('/') &&
                isAllowedAudioExtension(requestedName) &&
                !isAppleDoubleName(requestedName);
            const currentSize = sizeByExistingKey.get(requestedKey);
            if (nameIsUsable && currentSize === undefined && verifyKeyTicket(bookId, requestedKey, f.keyTicket)) {
                reuseKey = requestedKey;
            } else if (
                nameIsUsable &&
                currentSize === size &&
                (await headTrackChecksum(requestedKey)) === checksum
            ) {
                reuseKey = requestedKey;
                landed = true;
            }
        }

        // --- A replacement's retry ---------------------------------------------
        //
        // Its slot is the replaced track's place in the playing order. When the
        // slot now holds something else — typically the OLD take, restored from
        // the corbeille after the first PUT failed — falling through to a fresh
        // name put the new take LAST, while the dialogue announced it « à la
        // place de l'ancienne ». Refused instead: which version stays is the
        // permanent's call, and « Remplacer » on that line makes it.
        if (replaceKey) {
            const slot =
                isKeyInsidePrefix(replaceKey, prefix) ? `${prefix}${replacementName(prefix, replaceKey, originalName)}` : '';
            if (!reuseKey || requestedKey !== slot) {
                return NextResponse.json(
                    {
                        message:
                            'La place de la piste remplacée est de nouveau occupée — l’ancienne version y a sans ' +
                            'doute été restaurée entre-temps. Rien n’a été envoyé. Pour la remplacer, cliquez de ' +
                            'nouveau sur « Remplacer » sur sa ligne.',
                        replaceConflict: true,
                    },
                    { status: 409 },
                );
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
                // A name that cannot sort after the last track stays so on a
                // retry: `namingRefused` tells the dialogue not to retry it.
                return NextResponse.json({ message: (e as Error).message, namingRefused: true }, { status: 409 });
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
            landed,
            checksum,
        });
    }

    // One remaining storage-level check, pooled rather than serial, for every
    // key about to be signed: the listing could be a few hundred milliseconds
    // stale. That covers a reused key too — it is only reused when the listing
    // showed it ABSENT, and « a PUT is only ever signed onto a key that holds
    // nothing » has to hold at signing time, not at listing time. A key that
    // already holds this file's bytes is `landed` and signs nothing.
    const checked = await pool(
        results.filter((r) => !r.landed),
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

    // Sign only now that every name in the batch is confirmed free — and never
    // a key that already holds this file (`landed`).
    for (const r of results) {
        if (r.landed) continue;
        r.url = await putTrackUrl(r.key, r.contentType, r.checksum, URL_TTL_SECONDS);
    }

    return NextResponse.json({
        prefix,
        expiresIn: URL_TTL_SECONDS,
        // What the dialogue reads; `strategy` and the checksum it sent stay here.
        files: results.map(({ originalName, filename, key, url, contentType, reused, landed }) => ({
            originalName,
            filename,
            key,
            url,
            contentType,
            reused,
            landed,
            // Offered back with `existingKey` on a retry, and with the key to commit.
            ticket: issueKeyTicket(bookId, key),
        })),
        skipped,
    });
});

/**
 * The name a « Remplacer » gives the new take: the old one's, extension aside.
 * Same extension: the exact old name, its case included. Otherwise the old base
 * with the new extension — the base is what decides the place.
 */
function replacementName(prefix: string, replaceKey: string, originalName: string): string {
    const oldName = replaceKey.slice(prefix.length);
    const oldSplit = splitExtension(oldName);
    const newExt = splitExtension(originalName).ext;
    return newExt === oldSplit.ext ? oldName : `${oldSplit.base}.${newExt}`;
}

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
    const newExt = splitExtension(originalName).ext;
    const filename = replacementName(prefix, replaceKey, originalName);
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
        // The move rewrites the book's audio columns — one track fewer, so the
        // duration is blanked and the announcement cleared — and nothing else
        // on this path told the public pages. If the new take never lands, they
        // kept the old duration for a day while the fiche said « Non calculée ».
        const publicBefore = await snapshotPublicBooks([bookId]);
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
        await revalidateChangedBooks(publicBefore);
    } else {
        // Absent already. Legitimate when an earlier request of this same
        // « Remplacer » moved it and lost its answer — then this book's
        // corbeille holds it, still unrestored: the slot is that track's place.
        // Otherwise replaceKey names nothing this book ever held, and signing it
        // would place a file anywhere in the playing order without going
        // through nextTrackName.
        const movedOut = await prisma.deletedAudioTrack.findFirst({
            where: { bookId, originalKey: replaceKey, restoredAt: null, purgedAt: null },
            select: { id: true },
        });
        if (!movedOut) {
            return NextResponse.json(
                { message: 'La piste à remplacer n’est plus dans le dossier : actualisez la liste des pistes.' },
                { status: 409 },
            );
        }
    }

    const contentType = MIME[newExt] ?? 'application/octet-stream';
    const url = await putTrackUrl(key, contentType, checksum, URL_TTL_SECONDS);
    return NextResponse.json({
        prefix,
        expiresIn: URL_TTL_SECONDS,
        files: [
            { originalName, filename, key, url, contentType, reused: false, landed: false, ticket: issueKeyTicket(bookId, key) },
        ],
        skipped: [],
        replaced,
    });
}
