/**
 * End-to-end check of the audio management logic against the real bucket.
 *
 *   node --conditions=react-server --import tsx scripts/_verify-audio.ts
 *
 * (the react-server condition stubs out `server-only` so lib/audio/state.ts and
 * trash.ts — the actual production modules — can run under Node.)
 *
 * Works in its own scratch prefix under the root `2022/` tree, which is the
 * cancelled-upload copy, NOT the live `dirt/` catalogue. Creates its own files,
 * exercises delete/restore/FOLDER_EMPTY, and removes everything at the end.
 */
import 'dotenv/config';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3, AUDIO_BUCKET, listBookTracks, listRawObjects, headTrack } from '../lib/audio/bucket';
import { refreshBookAudioState, isKeyInsidePrefix, resolvePrefix } from '../lib/audio/state';
import { softDeleteTrack, softDeleteTracks, restoreTrack } from '../lib/audio/trash';
import { prisma } from '../lib/prisma';

const SCRATCH = '2022/_eca-test-audio/';
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

async function putScratch(name: string, bytes: number) {
    await getS3().send(
        new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: `${SCRATCH}${name}`,
            Body: Buffer.alloc(bytes, 7),
            ContentType: 'audio/mpeg',
        }),
    );
}

async function main() {
    if (!process.env.DATABASE_URL?.includes('localhost')) {
        throw new Error('Refus : base non locale.');
    }
    if (SCRATCH.startsWith('dirt/')) throw new Error('Refus : le scratch ne doit jamais viser dirt/.');

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

    // --- cleanup ------------------------------------------------------------
    console.log('\nnettoyage…');
    const leftovers = await prisma.deletedAudioTrack.findMany({ where: { bookId } });
    for (const r of leftovers) {
        await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: r.trashKey })).catch(() => {});
    }
    await prisma.deletedAudioTrack.deleteMany({ where: { bookId } });
    for (const f of [...FILES, '.bzEmpty']) {
        await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: `${SCRATCH}${f}` })).catch(() => {});
    }
    const rest = await listRawObjects(SCRATCH);
    check('scratch entièrement vidé (placeholder compris)', rest.length, 0);

    console.log(failures ? `\n${failures} échec(s)` : '\nTous les contrôles passent.');
    process.exitCode = failures ? 1 : 0;
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
