/**
 * End-to-end check of the audio management logic against the real bucket.
 *
 *   node --conditions=react-server --import tsx scripts/_verify-audio.ts
 *
 * (the react-server condition stubs out `server-only` so lib/audio/state.ts and
 * trash.ts — the actual production modules — can run under Node.)
 *
 * Works in its own scratch prefixes under the root `2022/` tree, which is the
 * cancelled-upload copy, NOT the live `dirt/` catalogue. Creates its own files,
 * exercises delete/restore/FOLDER_EMPTY, and removes everything at the end.
 *
 * Since November 2026 it also drives the real route handlers and server
 * actions (upload-url, commit, track, tracks, upload-lease, the orphan
 * linking), which need the session and cache stubs of e2e-next-stubs.cjs:
 *
 *   node --env-file=.env --conditions=react-server --require ./scripts/e2e-next-stubs.cjs --import tsx scripts/audio-manage.e2e.ts --real-bucket
 *
 * Never calls purgeExpiredAudioTrash: the dev database is a stale copy whose
 * old corbeille rows name production's real corbeille copies.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest } from 'next/server';
import {
    getS3,
    AUDIO_BUCKET,
    listBookTracks,
    listRawObjects,
    headTrack,
    headTrackChecksum,
    copyTrack,
    naturalCompare,
} from '../lib/audio/bucket';
import { refreshBookAudioState, isKeyInsidePrefix, resolvePrefix } from '../lib/audio/state';
import {
    softDeleteTrack,
    softDeleteTracks,
    restoreTrack,
    restoreTracksByIds,
    trashKeyFor,
    LEFTOVER_MARGIN_MS,
    TRASH_PREFIX,
} from '../lib/audio/trash';
import { renameTrack, AudioRenameError } from '../lib/audio/rename';
import { purgeTrashNow } from '../lib/audio/purge';
import { linkOrphanToBook } from '../app/admin/audio-orphelins/actions';
import * as uploadUrlRoute from '../app/api/books/[id]/audio/upload-url/route';
import * as commitRoute from '../app/api/books/[id]/audio/commit/route';
import * as trackRoute from '../app/api/books/[id]/audio/track/route';
import * as tracksRoute from '../app/api/books/[id]/audio/tracks/route';
import * as leaseRoute from '../app/api/books/[id]/audio/upload-lease/route';
import { prisma } from '../lib/prisma';

const SCRATCH = '2022/_eca-test-audio/';
/** 23 tracks: three slices of ten for the bulk corbeille moves and restores. */
const SLICES = '2022/_eca-test-audio-slices/';
/** A folder no book claims, attached through the orphan screen's action. */
const ORPHAN = '2022/_eca-test-audio-orphan/';
const SCRATCHES = [SCRATCH, SLICES, ORPHAN];

/**
 * A corbeille copy (`corbeille/<id>/<timestamp>-<name>`) of a file this script
 * created. The cleanup sweeps the test books' corbeille folders with this and
 * nothing broader — see the note there.
 */
function isOwnFile(key: string): boolean {
    const name = key.slice(key.lastIndexOf('/') + 1).replace(/^\d+-/, '');
    return (
        FILES.includes(name) ||
        / Tranche\.mp3$/.test(name) ||
        / Orphelin\.mp3$/.test(name) ||
        /Nouvelle prise [AB]( bis)?\.mp3$/.test(name)
    );
}
const TITLE = 'ZZZ Test audio — ne pas utiliser';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`),
    );
}

/** Deliberately awkward names: the corpus shape we must order correctly. */
const FILES = [
    '1000 01- Introduction à l!abbé.mp3',
    '1000 02- Deuxième partie.mp3',
    '1000 10- Dixième partie.mp3',
];

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('base64');

async function putScratch(name: string, bytes: number, prefix = SCRATCH, fill = 7) {
    const body = Buffer.alloc(bytes, fill);
    await getS3().send(
        new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: `${prefix}${name}`,
            Body: body,
            ContentType: 'audio/mpeg',
            // Sent the way the dialogue's presigned PUTs are (see putTrackUrl).
            ChecksumSHA256: sha256(body),
        }),
    );
}

async function main() {
    if (!process.env.DATABASE_URL?.includes('localhost')) {
        throw new Error('Refus : base non locale.');
    }
    if (SCRATCHES.some((p) => p.startsWith('dirt/'))) throw new Error('Refus : le scratch ne doit jamais viser dirt/.');
    if (!(globalThis as { __e2eNextStubs?: boolean }).__e2eNextStubs) {
        throw new Error('Lancez avec --require ./scripts/e2e-next-stubs.cjs (voir l’en-tête).');
    }
    // This one writes to the REAL bucket (scratch prefixes under 2022/), to
    // prove B2 itself behaves — checksums on HEAD, copy sizes, DeleteObjects.
    // Ordinary checks of the audio code belong in scripts/audio-fake-bucket.test.ts,
    // which touches no bucket at all. So the real one takes an explicit flag:
    // a leftover from a run that died (four `_eca-test-objectlock-retest-*`
    // objects were still there in November 2026) is a cost paid for nothing.
    if (!process.argv.includes('--real-bucket')) {
        throw new Error(
            'Ce test écrit dans le VRAI stockage. Ajoutez --real-bucket pour le lancer ; sinon, ' +
                'utilisez scripts/audio-fake-bucket.test.ts.',
        );
    }

    console.log(`Bucket ${AUDIO_BUCKET}, scratch ${SCRATCH}\n`);

    // --- setup ------------------------------------------------------------
    for (let i = 0; i < FILES.length; i++) await putScratch(FILES[i], 1024 * (i + 1));

    const found = await prisma.book.findFirst({ where: { title: TITLE } });
    const book = found
        ? await prisma.book.update({ where: { id: found.id }, data: { audio_filepath: SCRATCH } })
        : await prisma.book.create({
              data: {
                  title: TITLE,
                  author: 'Test',
                  audio_filepath: SCRATCH,
                  addedById: 1,
                  available: false,
              },
          });
    const bookId = book.id;
    console.log(`livre de test #${bookId}\n`);

    // --- ordering ---------------------------------------------------------
    const tracks = await listBookTracks(SCRATCH);
    check('3 pistes listées', tracks.length, 3);
    check(
        'ordre naturel (10 après 02, pas avant)',
        tracks.map((t) => t.name),
        FILES,
    );

    // --- status refresh ---------------------------------------------------
    let state = await refreshBookAudioState(bookId);
    check('statut OK avec des pistes', state.status, 'OK');
    check('compteur de pistes', state.trackCount, 3);

    // --- containment guard ------------------------------------------------
    check('clé du dossier acceptée', isKeyInsidePrefix(`${SCRATCH}x.mp3`, SCRATCH), true);
    check('clé d’un autre dossier refusée', isKeyInsidePrefix('dirt/2022/autre/x.mp3', SCRATCH), false);
    check('traversée refusée', isKeyInsidePrefix(`${SCRATCH}../x.mp3`, SCRATCH), false);
    check('sous-dossier refusé', isKeyInsidePrefix(`${SCRATCH}sub/x.mp3`, SCRATCH), false);
    check('préfixe normalisé avec slash final', resolvePrefix('a/b'), 'a/b/');

    // --- soft delete ------------------------------------------------------
    const victim = tracks[2];
    const sizeBefore = victim.sizeBytes;
    const del = await softDeleteTrack({
        bookId,
        key: victim.key,
        filename: victim.name,
        userId: 1,
    });
    check('original retiré du dossier', await headTrack(victim.key), null);
    const inTrash = await headTrack(del.trashKey);
    check('copie présente dans la corbeille', inTrash?.sizeBytes, sizeBefore);

    state = await refreshBookAudioState(bookId);
    check('compteur décrémenté après suppression', state.trackCount, 2);
    check('statut toujours OK', state.status, 'OK');

    // --- delete the rest → FOLDER_EMPTY ------------------------------------
    const remaining = await listBookTracks(SCRATCH);
    const deletions = [del.trashId];
    for (const t of remaining) {
        const d = await softDeleteTrack({ bookId, key: t.key, filename: t.name, userId: 1 });
        deletions.push(d.trashId);
    }
    state = await refreshBookAudioState(bookId);
    check('dernier fichier supprimé → FOLDER_EMPTY (et non OK)', state.status, 'FOLDER_EMPTY');
    check('compteur nul, pas zéro-avec-OK', state.trackCount, null);

    // --- restore -----------------------------------------------------------
    for (const id of deletions) await restoreTrack({ trashId: id, userId: 1 });
    const back = await listBookTracks(SCRATCH);
    check('toutes les pistes restaurées', back.length, 3);
    check('ordre préservé après restauration', back.map((t) => t.name), FILES);
    check('taille préservée', back[2].sizeBytes, sizeBefore);

    const rows = await prisma.deletedAudioTrack.findMany({
        where: { bookId },
        select: { restoredAt: true },
    });
    check('toutes les entrées marquées restaurées', rows.every((r) => r.restoredAt !== null), true);

    // --- bulk soft delete --------------------------------------------------
    // The path book deletion and « vider le dossier » both take. It must reach
    // the same end state as the loop it replaced, and — unlike that loop — be
    // safe to run twice, because that is what makes a timeout survivable.
    const bulkTracks = (await listBookTracks(SCRATCH)).map((t) => ({
        key: t.key,
        name: t.name,
        sizeBytes: t.sizeBytes,
    }));
    const bulk = await softDeleteTracks({ bookId, prefix: SCRATCH, tracks: bulkTracks, userId: 1 });
    check('suppression groupée : 3 pistes déplacées', bulk.moved, 3);
    check('suppression groupée : aucun échec', bulk.failed.length, 0);
    check('dossier vidé', (await listBookTracks(SCRATCH)).length, 0);

    state = await refreshBookAudioState(bookId);
    check('FOLDER_EMPTY après suppression groupée', state.status, 'FOLDER_EMPTY');
    check('compteur nul après suppression groupée', state.trackCount, null);

    const parked = await prisma.deletedAudioTrack.findMany({
        where: { bookId, restoredAt: null },
        select: { id: true, trashKey: true, sizeBytes: true },
    });
    check('une entrée de corbeille par piste', parked.length, 3);
    check(
        'copies réellement présentes dans la corbeille',
        (await Promise.all(parked.map((p) => headTrack(p.trashKey)))).every((h) => h !== null),
        true,
    );

    // Re-running the identical call must be a no-op rather than a second set of
    // copies — this is the resume path after a timeout.
    const bulkAgain = await softDeleteTracks({
        bookId,
        prefix: SCRATCH,
        tracks: bulkTracks,
        userId: 1,
    });
    check('reprise : rien de redéplacé', bulkAgain.moved, 0);
    check('reprise : tout reconnu comme déjà en corbeille', bulkAgain.skipped, 3);
    check('reprise : aucun échec', bulkAgain.failed.length, 0);
    check(
        'reprise : aucune copie en double',
        await prisma.deletedAudioTrack.count({ where: { bookId, restoredAt: null } }),
        3,
    );

    for (const p of parked) await restoreTrack({ trashId: p.id, userId: 1 });
    check('restaurées après suppression groupée', (await listBookTracks(SCRATCH)).length, 3);

    // --- refreshBookAudioState(objects) — caller-supplied listing ----------
    // Added so commit/route.ts and the manage dialogue could stop listing the
    // same prefix a second time. Must agree exactly with the self-listing
    // path it replaces for those callers.
    const rawObjects = await listRawObjects(SCRATCH);
    const selfListed = await refreshBookAudioState(bookId);
    const callerSupplied = await refreshBookAudioState(bookId, null, true, rawObjects);
    check('objects fourni : même statut que l’auto-listing', callerSupplied.status, selfListed.status);
    check('objects fourni : même compteur', callerSupplied.trackCount, selfListed.trackCount);
    check('objects fourni : même poids', callerSupplied.sizeKb, selfListed.sizeKb);

    // --- softDeleteTracks(priorObjects, skipFinalisation) -------------------
    // Added so tracks/route.ts (« vider le dossier ») could hand over the
    // listing it already made instead of paying for ensureFolderPlaceholder's
    // and refreshBookAudioState's own LISTs. Two things must hold: the
    // remainder it computes must match reality, and skipFinalisation must
    // really skip — the cached counters must NOT move until something else
    // refreshes them.
    const beforeSkip = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audioTrackCount: true },
    });
    const preMutationListing = await listRawObjects(SCRATCH);
    const tracksForPriorTest = (await listBookTracks(SCRATCH)).map((t) => ({
        key: t.key,
        name: t.name,
        sizeBytes: t.sizeBytes,
    }));
    const skipResult = await softDeleteTracks({
        bookId,
        prefix: SCRATCH,
        tracks: tracksForPriorTest,
        userId: 1,
        priorObjects: preMutationListing,
        skipFinalisation: true,
    });
    check('priorObjects : 3 pistes déplacées', skipResult.moved, 3);
    check('priorObjects : aucun échec', skipResult.failed.length, 0);
    const afterSkip = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audioTrackCount: true },
    });
    check(
        'skipFinalisation : le compteur en cache n’a pas bougé tout seul',
        afterSkip?.audioTrackCount,
        beforeSkip?.audioTrackCount,
    );
    // The folder is now actually empty; let a normal refresh (with the
    // computed remainder, not a fresh list) catch it up.
    const remainderKeys = new Set(tracksForPriorTest.map((t) => t.key));
    const remainder = preMutationListing.filter((o) => !remainderKeys.has(o.key));
    const afterManualRefresh = await refreshBookAudioState(bookId, null, true, remainder);
    check('remainder calculé : FOLDER_EMPTY', afterManualRefresh.status, 'FOLDER_EMPTY');
    check('remainder calculé : dossier réellement vide', (await listBookTracks(SCRATCH)).length, 0);

    const parkedAgain = await prisma.deletedAudioTrack.findMany({
        where: { bookId, restoredAt: null },
        select: { id: true },
    });
    for (const p of parkedAgain) await restoreTrack({ trashId: p.id, userId: 1 });
    check('restaurées après le test priorObjects', (await listBookTracks(SCRATCH)).length, 3);

    // --- re-upload under a name still in the corbeille ----------------------
    // A corbeille row naming the key used to make ANY later file under that key
    // count as « déjà dans la corbeille »: a re-recorded track could never be
    // deleted again. Same size on purpose — the case size alone can't tell apart.
    const re = back[1];
    const reFirst = await softDeleteTrack({ bookId, key: re.key, filename: re.name, userId: 1 });
    await putScratch(re.name, re.sizeBytes); // re-recorded, re-uploaded, same byte count
    let reError = '';
    let reSecond: Awaited<ReturnType<typeof softDeleteTrack>> | null = null;
    try {
        reSecond = await softDeleteTrack({ bookId, key: re.key, filename: re.name, userId: 1 });
    } catch (e) {
        reError = (e as Error).message;
    }
    check('réenvoi : la nouvelle version se supprime aussi', reError, '');
    check('réenvoi : nouvelle entrée de corbeille', !!reSecond && reSecond.trashId !== reFirst.trashId, true);
    check('réenvoi : retirée du dossier', await headTrack(re.key), null);
    check(
        'réenvoi : deux versions en corbeille pour la même clé',
        await prisma.deletedAudioTrack.count({ where: { bookId, originalKey: re.key, restoredAt: null } }),
        2,
    );

    // Restored together, the two versions would race for the same key: the
    // most recent one wins, the older stays in the corbeille.
    const both = await restoreTracksByIds({ trashIds: [reFirst.trashId, reSecond!.trashId], userId: 1 });
    check('deux versions : une seule restaurée', both.restored, 1);
    check(
        'deux versions : l’autre refusée, avec la raison',
        both.failed.length === 1 && both.failed[0].reason.includes('plus récente'),
        true,
    );
    const [firstRow, secondRow] = await Promise.all([
        prisma.deletedAudioTrack.findUnique({ where: { id: reFirst.trashId }, select: { restoredAt: true } }),
        prisma.deletedAudioTrack.findUnique({ where: { id: reSecond!.trashId }, select: { restoredAt: true } }),
    ]);
    check('deux versions : c’est la plus récente qui revient', !!secondRow?.restoredAt, true);
    check('deux versions : l’ancienne reste en corbeille', firstRow?.restoredAt ?? null, null);
    check('deux versions : la copie de l’ancienne existe toujours', (await headTrack(reFirst.trashKey)) !== null, true);
    check('deux versions : le fichier est revenu', (await headTrack(re.key))?.sizeBytes, re.sizeBytes);

    // --- leftover of an interrupted move -------------------------------------
    // Copy and row written, original never removed: the next attempt must
    // finish the job — remove the original, no second copy, no second row.
    // The row is dated past the margin, as a move made well after the upload.
    const lo = back[0];
    const loTrashKey = trashKeyFor(bookId, lo.name);
    await copyTrack(lo.key, loTrashKey);
    const loRow = await prisma.deletedAudioTrack.create({
        data: {
            bookId,
            originalKey: lo.key,
            trashKey: loTrashKey,
            filename: lo.name,
            sizeBytes: BigInt(lo.sizeBytes),
            deletedById: 1,
            deletedAt: new Date(Date.now() + LEFTOVER_MARGIN_MS + 60_000),
        },
    });
    const resumed = await softDeleteTracks({
        bookId,
        prefix: SCRATCH,
        tracks: [{ key: lo.key, name: lo.name, sizeBytes: lo.sizeBytes }],
        userId: 1,
    });
    check('reprise d’un déplacement interrompu : rien recopié', resumed.moved, 0);
    check('reprise : reconnu comme reste', resumed.skipped, 1);
    check('reprise : aucun échec', resumed.failed.length, 0);
    check('reprise : rattaché à la ligne existante', resumed.parked[0]?.trashId, loRow.id);
    check('reprise : original retiré', await headTrack(lo.key), null);
    check(
        'reprise : pas de seconde ligne',
        await prisma.deletedAudioTrack.count({ where: { bookId, originalKey: lo.key, restoredAt: null } }),
        1,
    );
    await restoreTrack({ trashId: loRow.id, userId: 1 });
    check('reprise : restauré ensuite', (await headTrack(lo.key))?.sizeBytes, lo.sizeBytes);

    // --- restore refuses to overwrite --------------------------------------
    const again = await softDeleteTrack({
        bookId,
        key: back[0].key,
        filename: back[0].name,
        userId: 1,
    });
    await putScratch(back[0].name, 4096); // someone re-uploads in the meantime
    let refused = '';
    try {
        await restoreTrack({ trashId: again.trashId, userId: 1 });
    } catch (e) {
        refused = (e as Error).message;
    }
    check('restauration refusée si la place est occupée', refused.includes('occupe déjà'), true);
    check('le fichier réenvoyé est intact', (await headTrack(back[0].key))?.sizeBytes, 4096);

    const extraBooks = await runNovember2026Checks(bookId);

    // --- cleanup ------------------------------------------------------------
    console.log('\nnettoyage…');
    const testBooks = [bookId, ...extraBooks];
    const leftovers = await prisma.deletedAudioTrack.findMany({ where: { bookId: { in: testBooks } } });
    for (const r of leftovers) {
        await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: r.trashKey })).catch(() => {});
    }
    await prisma.deletedAudioTrack.deleteMany({ where: { bookId: { in: testBooks } } });
    await prisma.audioUploadLease.deleteMany({ where: { bookId: { in: testBooks } } });
    await prisma.orphanAudioFolder.deleteMany({ where: { prefix: ORPHAN } });
    // Everything under the scratch prefixes, whatever a failed check left behind.
    //
    // NOT everything under `corbeille/<id>/`: these are DEV ids, and the bucket
    // is production's — a production book can hold the same id (the dev copy
    // and production have numbered new books separately since), and its
    // corbeille folder is then this one. Only copies named after this script's
    // own files are swept there: the rows above name the rest.
    for (const p of SCRATCHES) {
        for (const o of await listRawObjects(p)) {
            await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: o.key })).catch(() => {});
        }
    }
    const ownTrash = async () =>
        (await Promise.all(testBooks.map((id) => listRawObjects(`${TRASH_PREFIX}${id}/`)))).flat().filter((o) => isOwnFile(o.key));
    for (const o of await ownTrash()) {
        await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: o.key })).catch(() => {});
    }
    const rest = [...(await Promise.all(SCRATCHES.map((p) => listRawObjects(p)))).flat(), ...(await ownTrash())];
    check('scratch entièrement vidé (placeholder et copies de corbeille du test compris)', rest.length, 0);

    console.log(failures ? `\n${failures} échec(s)` : '\nTous les contrôles passent.');
    process.exitCode = failures ? 1 : 0;
}

/** A test fiche by title, created once and reused by later runs. */
async function testBook(title: string, audioFilepath: string | null): Promise<number> {
    // Named `deletedAt` so the soft-delete filter (lib/prisma.ts) lets a
    // fiche deleted by an earlier run be found and reused.
    const found =
        (await prisma.book.findFirst({ where: { title } })) ??
        (await prisma.book.findFirst({ where: { title, deletedAt: { not: null } } }));
    const data = { audio_filepath: audioFilepath, available: false, deletedAt: null };
    const book = found
        ? await prisma.book.update({ where: { id: found.id }, data })
        : await prisma.book.create({ data: { title, author: 'Test', addedById: 1, ...data } });
    return book.id;
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

/** A real route handler, called as Next would, as the stubbed signed-in account. */
async function callRoute(handler: Handler, method: string, bookId: number, body: unknown) {
    const res = await handler(
        new NextRequest(`http://localhost/api/books/${bookId}/audio`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: String(bookId) }) },
    );
    return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, any> | null };
}

/** The browser's PUT: exactly the signed Content-Type and checksum headers. */
async function putSigned(url: string, contentType: string, checksum: string, body: Buffer) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-amz-checksum-sha256': checksum },
        body: new Uint8Array(body),
    });
    return res.status;
}

/**
 * The fixes of November 2026, against the real bucket: sliced corbeille moves
 * and restores, upload-url naming under the lease, the `landed` retry, the
 * commit's `publish`, rename, purge, orphan linking, the duration rule and the
 * shared-folder refusals. Returns the extra test books, for the cleanup.
 *
 * Rename's PARTIAL failures (copy made, delete refused) need a bucket that can
 * be made to refuse: they are covered by the fake-bucket harness, not here.
 */
async function runNovember2026Checks(bookId: number): Promise<number[]> {
    // --- sliced bulk corbeille move -------------------------------------------
    console.log('\n— suppression et restauration par tranches');
    for (let i = 1; i <= 23; i++) {
        await putScratch(`1000 ${String(i).padStart(2, '0')} Tranche.mp3`, 512 + i, SLICES, i);
    }
    const sliceBook = await testBook('ZZZ Test audio — tranches', SLICES);
    const asTracks = async () =>
        (await listBookTracks(SLICES)).map((t) => ({ key: t.key, name: t.name, sizeBytes: t.sizeBytes }));
    // Only this test's own copies: a production book may share the dev id (see the cleanup).
    const corbeilleCopies = async () =>
        (await listRawObjects(`${TRASH_PREFIX}${sliceBook}/`)).filter((o) => o.key.endsWith(' Tranche.mp3')).length;
    const activeRows = () => prisma.deletedAudioTrack.count({ where: { bookId: sliceBook, restoredAt: null } });
    let todo = await asTracks();
    check('tranches : 23 pistes à déplacer', todo.length, 23);

    const none = await softDeleteTracks({
        bookId: sliceBook, prefix: SLICES, tracks: todo, userId: 1, deadline: Date.now() - 1,
    });
    check('délai déjà passé : aucune tranche lancée', [none.moved, none.remaining], [0, 23]);
    check('délai déjà passé : ni copie ni ligne', [await corbeilleCopies(), await activeRows()], [0, 0]);

    let movedTotal = 0;
    let calls = 0;
    let recordedPerSlice = true;
    let sliceSized = true;
    while (todo.length && calls < 12) {
        calls++;
        const r = await softDeleteTracks({
            bookId: sliceBook, prefix: SLICES, tracks: todo, userId: 1, deadline: Date.now() + 1500,
        });
        movedTotal += r.moved;
        if (r.failed.length || r.moved + r.remaining !== todo.length) recordedPerSlice = false;
        if (r.remaining > 0 && r.moved % 10 !== 0) sliceSized = false;
        // The invariant the slicing exists for: whatever was copied is recorded.
        if ((await corbeilleCopies()) !== movedTotal || (await activeRows()) !== movedTotal) recordedPerSlice = false;
        todo = await asTracks();
    }
    console.log(`        (${calls} appel(s))`);
    check('tranches : chaque appel rend ce qu’il n’a pas commencé', recordedPerSlice, true);
    check('tranches : on ne s’arrête qu’entre deux tranches de dix', sliceSized, true);
    check('tranches : tout déplacé, dossier vide', [movedTotal, todo.length], [23, 0]);

    // --- sliced bulk restore ------------------------------------------------
    let ids = (
        await prisma.deletedAudioTrack.findMany({ where: { bookId: sliceBook, restoredAt: null }, select: { id: true } })
    ).map((r) => r.id);
    const idle = await restoreTracksByIds({ trashIds: ids, userId: 1, deadline: Date.now() - 1 });
    check('restauration, délai passé : rien ramené, tout rendu', [idle.restored, idle.remainingIds.length], [0, 23]);
    let restoredTotal = 0;
    let restoreCalls = 0;
    let restoreConsistent = true;
    while (ids.length && restoreCalls < 12) {
        restoreCalls++;
        const r = await restoreTracksByIds({ trashIds: ids, userId: 1, deadline: Date.now() + 1500 });
        restoredTotal += r.restored;
        if (r.failed.length) restoreConsistent = false;
        // Back in the folder ⇔ marked restored: never one without the other.
        const inFolder = (await listBookTracks(SLICES)).length;
        const marked = await prisma.deletedAudioTrack.count({ where: { bookId: sliceBook, restoredAt: { not: null } } });
        if (inFolder !== restoredTotal || marked !== restoredTotal) restoreConsistent = false;
        ids = r.remainingIds;
    }
    console.log(`        (${restoreCalls} appel(s))`);
    check('restauration par tranches : dossier et lignes toujours d’accord', restoreConsistent, true);
    check('restauration par tranches : 23 pistes revenues, dans l’ordre', (await asTracks()).map((t) => t.name),
        Array.from({ length: 23 }, (_, i) => `1000 ${String(i + 1).padStart(2, '0')} Tranche.mp3`));

    // --- upload-url under the lease, the real PUT, the landed retry, commit ---
    console.log('\n— envoi : nom, bail, somme de contrôle, reprise, publication');
    await prisma.book.update({ where: { id: bookId }, data: { available: false } });
    const lease = randomUUID();
    const takeA = Buffer.alloc(3000, 41);
    const signA = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: lease,
        files: [{ name: 'Nouvelle prise A.mp3', size: takeA.length, checksum: sha256(takeA) }],
    });
    check('upload-url : 200', signA.status, 200);
    const fileA = signA.data?.files?.[0];
    const before = (await listBookTracks(SCRATCH)).map((t) => t.name);
    check('upload-url : le nom se range après la dernière piste',
        [...before, fileA?.filename].sort(naturalCompare).pop(), fileA?.filename);

    const other = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: randomUUID(),
        files: [{ name: 'Intrus.mp3', size: 10, checksum: sha256(Buffer.alloc(10)) }],
    });
    check('bail : un second envoi sur le livre est refusé (409 uploadLease)', [other.status, !!other.data?.uploadLease], [409, true]);

    check('PUT avec une autre somme : refusé par B2',
        (await putSigned(fileA.url, fileA.contentType, fileA.checksum, Buffer.alloc(3000, 42))) >= 400, true);
    check('PUT conforme : accepté', await putSigned(fileA.url, fileA.contentType, fileA.checksum, takeA), 200);
    check('B2 rend la somme stockée au HEAD', await headTrackChecksum(fileA.key), sha256(takeA));

    const retry = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: lease,
        files: [{ name: 'Nouvelle prise A.mp3', size: takeA.length, checksum: sha256(takeA), existingKey: fileA.key }],
    });
    check('reprise après un commit perdu : landed, rien à signer',
        [retry.data?.files?.[0]?.landed, retry.data?.files?.[0]?.url, retry.data?.files?.[0]?.key], [true, '', fileA.key]);
    const crafted = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: lease,
        files: [{ name: 'Pirate.mp3', size: takeA.length, checksum: sha256(Buffer.alloc(3000, 43)), existingKey: fileA.key }],
    });
    check('existingKey d’une piste de même taille, autre contenu : jamais resignée',
        [crafted.data?.files?.[0]?.key === fileA.key, crafted.data?.files?.[0]?.reused], [false, false]);

    const commitA = await callRoute(commitRoute.POST as Handler, 'POST', bookId, {
        uploaded: [{ key: fileA.key, size: takeA.length, durationSeconds: 30 }],
    });
    check('commit sans publish : confirmé', commitA.data?.confirmed, 1);
    check('commit sans publish : le livre reste en attente',
        (await prisma.book.findUnique({ where: { id: bookId }, select: { available: true } }))?.available, false);

    const takeB = Buffer.alloc(2000, 44);
    const signB = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: lease,
        files: [{ name: 'Nouvelle prise B.mp3', size: takeB.length, checksum: sha256(takeB) }],
    });
    const fileB = signB.data?.files?.[0];
    check('second fichier : numéroté après le premier', [fileA.filename, fileB?.filename].sort(naturalCompare)[1], fileB?.filename);
    check('PUT du second : accepté', await putSigned(fileB.url, fileB.contentType, fileB.checksum, takeB), 200);
    const commitB = await callRoute(commitRoute.POST as Handler, 'POST', bookId, {
        uploaded: [{ key: fileB.key, size: takeB.length, durationSeconds: 20 }],
        publish: true,
    });
    check('commit avec publish : confirmé', commitB.status, 200);
    check('commit avec publish : le livre est publié',
        (await prisma.book.findUnique({ where: { id: bookId }, select: { available: true } }))?.available, true);
    const released = await callRoute(leaseRoute.POST as Handler, 'POST', bookId, { token: lease, action: 'release' });
    check('bail rendu à la fin', [released.status, await prisma.audioUploadLease.count({ where: { bookId } })], [200, 0]);

    // --- rename ---------------------------------------------------------------
    console.log('\n— renommage');
    const renameFrom = fileB.key as string;
    const renameTo = `${SCRATCH}${(fileB.filename as string).replace('.mp3', ' bis.mp3')}`;
    await prisma.audioTrackDuration.deleteMany({ where: { bookId, filename: fileB.filename } });
    await prisma.audioTrackDuration.create({
        data: { bookId, filename: fileB.filename, sizeBytes: BigInt(takeB.length), seconds: 20, method: 'TEST', exact: true },
    });
    let occupiedError = '';
    try {
        await renameTrack({ bookId, oldKey: renameFrom, newKey: fileA.key, userId: 1 });
    } catch (e) {
        occupiedError = e instanceof AudioRenameError ? e.message : `inattendu : ${(e as Error).message}`;
    }
    check('renommage vers un nom occupé : refusé, rien touché',
        [occupiedError.includes('porte déjà'), (await headTrack(fileA.key))?.sizeBytes, (await headTrack(renameFrom))?.sizeBytes],
        [true, takeA.length, takeB.length]);
    await renameTrack({ bookId, oldKey: renameFrom, newKey: renameTo, userId: 1 });
    check('renommage : ancien nom parti, nouveau à la même taille',
        [await headTrack(renameFrom), (await headTrack(renameTo))?.sizeBytes], [null, takeB.length]);
    check('renommage : la durée mesurée suit le nom',
        (await prisma.audioTrackDuration.findMany({ where: { bookId, filename: { in: [fileB.filename, renameTo.slice(SCRATCH.length)] } }, select: { filename: true } })).map((r) => r.filename),
        [renameTo.slice(SCRATCH.length)]);

    // --- purge ------------------------------------------------------------------
    console.log('\n— suppression définitive');
    const doomed = await softDeleteTrack({ bookId, key: renameTo, filename: renameTo.slice(SCRATCH.length), userId: 1 });
    const purge = await purgeTrashNow({ trashIds: [doomed.trashId, doomed.trashId], userId: 1 });
    check('purge : une copie supprimée, le doublon d’id ignoré', [purge.purged, purge.failed], [1, 0]);
    check('purge : copie partie de la corbeille', await headTrack(doomed.trashKey), null);
    const purgedRow = await prisma.deletedAudioTrack.findUnique({ where: { id: doomed.trashId }, select: { purgedAt: true, purgedById: true } });
    check('purge : ligne datée et signée', [!!purgedRow?.purgedAt, purgedRow?.purgedById], [true, 1]);
    check('purge : une ligne purgée ne se restaure plus',
        (await restoreTracksByIds({ trashIds: [doomed.trashId], userId: 1 })).restored, 0);
    check('purge : une seconde purge ne fait rien', (await purgeTrashNow({ trashIds: [doomed.trashId], userId: 1 })).skipped, 1);

    // --- orphan linking + duration rule ---------------------------------------------
    console.log('\n— rattachement d’un orphelin, règle de durée');
    await putScratch('1000 01 Orphelin.mp3', 700, ORPHAN, 51);
    await putScratch('1000 02 Orphelin.mp3', 800, ORPHAN, 52);
    const orphanBook = await testBook('ZZZ Test audio — orphelin', null);
    await prisma.orphanAudioFolder.deleteMany({ where: { prefix: ORPHAN } });
    const orphan = await prisma.orphanAudioFolder.create({
        data: { prefix: ORPHAN, title: 'ZZZ Test orphelin', trackCount: 2, bytes: BigInt(1500) },
    });
    const linked = await linkOrphanToBook(orphan.id, orphanBook);
    check('rattachement : accepté', linked.ok, true);
    const linkedBook = await prisma.book.findUnique({ where: { id: orphanBook }, select: { audio_filepath: true, audioTrackCount: true } });
    check('rattachement : la fiche pointe le dossier, pistes comptées', [linkedBook?.audio_filepath, linkedBook?.audioTrackCount], [ORPHAN, 2]);
    check('rattachement : un second rattachement est refusé', (await linkOrphanToBook(orphan.id, bookId)).ok, false);

    const setDuration = (filename: string, size: number, seconds: number) =>
        prisma.audioTrackDuration.upsert({
            where: { bookId_filename: { bookId: orphanBook, filename } },
            create: { bookId: orphanBook, filename, sizeBytes: BigInt(size), seconds, method: 'TEST', exact: true },
            update: { sizeBytes: BigInt(size), seconds },
        });
    await setDuration('1000 01 Orphelin.mp3', 700, 120);
    await setDuration('1000 02 Orphelin.mp3', 800, 120);
    await refreshBookAudioState(orphanBook);
    const minutes = async () =>
        (await prisma.book.findUnique({ where: { id: orphanBook }, select: { readingDurationMinutes: true } }))?.readingDurationMinutes;
    check('durée : toutes les pistes connues → somme', await minutes(), 4);
    await putScratch('1000 03 Orphelin.mp3', 900, ORPHAN, 53);
    await refreshBookAudioState(orphanBook);
    check('durée : une piste inconnue et le poids a changé → « Non calculée »', await minutes(), null);
    await setDuration('1000 03 Orphelin.mp3', 900, 60);
    await refreshBookAudioState(orphanBook);
    check('durée : la dernière mesurée → somme complète', await minutes(), 5);

    // --- shared-folder refusals -------------------------------------------------
    console.log('\n— dossier partagé avec une autre fiche');
    const twin = await testBook('ZZZ Test audio — jumeau', SCRATCH.slice(0, -1)); // the « sans / » spelling
    const shareLease = randomUUID();
    const sharedUpload = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: shareLease,
        files: [{ name: 'Partagé.mp3', size: 10, checksum: sha256(Buffer.alloc(10)) }],
    });
    check('partagé : envoi refusé en nommant le jumeau',
        [sharedUpload.status, (sharedUpload.data?.sharedWith ?? []).map((b: { id: number }) => b.id)], [409, [twin]]);
    const first = (await listBookTracks(SCRATCH))[0];
    const sharedDelete = await callRoute(trackRoute.DELETE as Handler, 'DELETE', bookId, { key: first.key, filename: first.name });
    check('partagé : suppression d’une piste refusée', [sharedDelete.status, !!sharedDelete.data?.sharedWith], [409, true]);
    const sharedRename = await callRoute(trackRoute.PATCH as Handler, 'PATCH', bookId, {
        key: first.key, filename: first.name, newName: `${first.name.replace('.mp3', '')} x.mp3`,
    });
    check('partagé : renommage refusé', [sharedRename.status, !!sharedRename.data?.sharedWith], [409, true]);
    const sharedEmpty = await callRoute(tracksRoute.DELETE as Handler, 'DELETE', bookId, {});
    check('partagé : « Tout supprimer » refusé', [sharedEmpty.status, !!sharedEmpty.data?.sharedWith], [409, true]);
    check('partagé : rien n’a bougé', (await listBookTracks(SCRATCH)).length > 0 && (await headTrack(first.key)) !== null, true);
    await prisma.book.update({ where: { id: twin }, data: { deletedAt: new Date() } });
    const afterTwin = await callRoute(uploadUrlRoute.POST as Handler, 'POST', bookId, {
        leaseToken: shareLease,
        files: [{ name: 'Partagé.mp3', size: 10, checksum: sha256(Buffer.alloc(10)) }],
    });
    check('jumeau supprimé (dossier laissé) : l’envoi redevient possible', afterTwin.status, 200);
    await callRoute(leaseRoute.POST as Handler, 'POST', bookId, { token: shareLease, action: 'release' });

    return [sliceBook, orphanBook, twin];
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
