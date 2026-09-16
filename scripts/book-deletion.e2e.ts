/**
 * End-to-end check of book deletion and the three audio dispositions, against
 * the real bucket and a local database.
 *
 *   node --conditions=react-server --import tsx scripts/book-deletion.e2e.ts
 *
 * (the react-server condition stubs out `server-only`, so lib/books/* and
 * lib/audio/* — the actual production modules — run under plain Node.)
 *
 * Covers what lib/books/deleteBookWithAudio.ts decides: the two refusals
 * (demandes / attributions, folder shared with another fiche), the refusal to
 * act with no disposition at all, then `leave` / `transfer` / `trash`. The route
 * on top of it is a body parser; the rules live here.
 *
 * Works in its own scratch prefixes under the root `2022/` tree — the
 * cancelled-upload copy, NOT the live `dirt/` catalogue — creates its own books
 * (« ZZZ Test … ») and files, and removes everything at the end, corbeille
 * copies included.
 *
 * Fixtures are written inside withoutAudit so a test run doesn't fill the
 * journal; the code under test is NOT, because its audit trail (the deletion
 * snapshot that makes a mistake replayable) is part of what it owes.
 */
import 'dotenv/config';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../lib/prisma';
import { withoutAudit } from '../lib/audit/context';
import {
    AUDIO_BUCKET,
    copyTrack,
    getS3,
    headTrack,
    listRawObjects,
    listBookTracks,
} from '../lib/audio/bucket';
import { readBookDeletionCheck } from '../lib/books/deletionPreflight';
import { deleteBookWithAudio } from '../lib/books/deleteBookWithAudio';

/**
 * Un préfixe neuf à chaque exécution. Réutiliser les mêmes clés d'un run à
 * l'autre rendait le test instable : B2 répondait au LIST suivant avec la vue
 * d'avant (2 pistes sur 3 fraîchement redéposées), et le contrôle du nombre de
 * pistes — celui qui protège la corbeille — tombait alors juste pour de
 * mauvaises raisons. Une clé jamais vue n'a pas de vue périmée.
 */
const RUN = Date.now().toString(36);
const SCRATCH = `2022/_eca-test-suppression-${RUN}/`;
const SCRATCH_BUSY = `2022/_eca-test-suppression-${RUN}-occupee/`;
const SCRATCH_LEAVE = `2022/_eca-test-suppression-${RUN}-laissee/`;
const TITLE_PREFIX = 'ZZZ Test suppression';

const FILES = ['9000 01- Premier.mp3', '9000 02- Deuxième.mp3', '9000 03- Troisième.mp3'];

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok
                ? ''
                : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`),
    );
}

function checkIncludes(label: string, haystack: string | null | undefined, needle: string) {
    const ok = (haystack ?? '').includes(needle);
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        « ${needle} » absent de : ${haystack ?? '(rien)'}`),
    );
}

/**
 * Le bucket a l'Object Lock activé : un PutObject sans somme de contrôle est
 * refusé (« Content-MD5 OR x-amz-checksum- header is required »). Le client
 * partagé est réglé sur `WHEN_REQUIRED`, donc il faut la demander explicitement.
 * Rien de tout cela ne concerne l'application, qui n'envoie jamais d'octets
 * elle-même : les téléversements sont des PUT présignés depuis le navigateur.
 */
const put = (key: string, bytes: number) =>
    getS3().send(
        new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: key,
            Body: Buffer.alloc(bytes, 7),
            ContentType: 'audio/mpeg',
            ChecksumAlgorithm: 'CRC32',
        }),
    );

const drop = (key: string) =>
    getS3()
        .send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }))
        .catch(() => {});

/** Un contrôle qu'on ne peut pas faire ici, dit à voix haute plutôt que passé sous silence. */
function skip(label: string) {
    console.log(`skip  ${label}`);
}

/**
 * CopyObject fonctionne-t-il depuis cette machine ?
 *
 * Le mode « corbeille » repose entièrement dessus (copier, vérifier, puis retirer
 * l'original). PUT, LIST, HEAD et DELETE passent ici, mais la copie côté serveur
 * expire au bout de 10 s, avec ou sans somme de contrôle — un problème de réseau
 * vers B2, pas de code. On sonde donc une fois, et on saute ces contrôles en le
 * disant, au lieu de rendre un échec qui n'apprend rien.
 */
async function probeCopy(source: string): Promise<boolean> {
    const probe = `${source}.sonde-copie`;
    try {
        await copyTrack(source, probe);
        const ok = (await headTrack(probe)) !== null;
        await drop(probe);
        return ok;
    } catch {
        return false;
    }
}

/** Attend que le stockage annonce `expected` pistes sous `prefix`. */
async function waitForCount(prefix: string, expected: number): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
        if ((await listBookTracks(prefix)).length === expected) return;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Le stockage n'annonce pas ${expected} piste(s) sous ${prefix}`);
}

async function makeBook(suffix: string, audioFilepath: string | null, addedById: number) {
    return withoutAudit(() =>
        prisma.book.create({
            data: {
                title: `${TITLE_PREFIX} — ${suffix}`,
                author: 'Test',
                audio_filepath: audioFilepath,
                available: true,
                addedById,
            },
            select: { id: true, title: true },
        }),
    );
}

async function main() {
    const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';
    if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
        throw new Error('Refus : base non locale.');
    }
    for (const p of [SCRATCH, SCRATCH_BUSY, SCRATCH_LEAVE]) {
        if (p.startsWith('dirt/')) throw new Error('Refus : le scratch ne doit jamais viser dirt/.');
    }

    const me = await prisma.user.findFirst({
        where: { email: 'claude@eca.test' },
        select: { id: true },
    });
    const actorId = me?.id ?? (await prisma.user.findFirst({ select: { id: true } }))!.id;
    console.log(`Bucket ${AUDIO_BUCKET}, scratch ${SCRATCH} — acteur #${actorId}\n`);

    // --- fixtures ----------------------------------------------------------
    for (let i = 0; i < FILES.length; i++) await put(`${SCRATCH}${FILES[i]}`, 1024 * (i + 1));
    await put(`${SCRATCH_BUSY}9100 01- Occupée.mp3`, 2048);
    await put(`${SCRATCH_LEAVE}9200 01- Laissée.mp3`, 3072);

    // Le dépôt est fait, le LIST peut encore ne pas le voir : on attend la vue
    // que le code sous test va lire, sinon c'est lui qu'on accuse.
    await waitForCount(SCRATCH, FILES.length);
    await waitForCount(SCRATCH_BUSY, 1);
    await waitForCount(SCRATCH_LEAVE, 1);

    const copyWorks = await probeCopy(`${SCRATCH_BUSY}9100 01- Occupée.mp3`);
    console.log(`CopyObject ${copyWorks ? 'disponible' : 'INJOIGNABLE — mode corbeille non vérifié'}\n`);

    const source = await makeBook('source', SCRATCH, actorId);
    const twin = await makeBook('jumeau', SCRATCH, actorId);
    const target = await makeBook('cible', null, actorId);
    const busy = await makeBook('cible occupée', SCRATCH_BUSY, actorId);
    const left = await makeBook('laissée', SCRATCH_LEAVE, actorId);

    // Une mesure de durée sur la source : elle doit suivre le dossier.
    await withoutAudit(() =>
        prisma.audioTrackDuration.create({
            data: {
                bookId: source.id,
                filename: FILES[0],
                sizeBytes: BigInt(1024),
                seconds: 120,
                method: 'TEST',
                exact: true,
            },
        }),
    );

    // --- 1. dossier partagé : refus avant toute option ---------------------
    const shared = await readBookDeletionCheck(source.id);
    check('partage détecté', shared.preflight?.audio.sharedWith.map((b) => b.id), [twin.id]);
    check('partage : bloqué', shared.preflight?.blocked, true);
    checkIncludes(
        'partage : le refus nomme le jumeau',
        shared.preflight?.audio.sharedRefusal,
        `(#${twin.id})`,
    );
    check('partage : 3 pistes comptées', shared.preflight?.audio.trackCount, 3);

    const refusedShared = await deleteBookWithAudio({
        bookId: source.id,
        performedById: actorId,
        disposition: { mode: 'leave' },
    });
    check('partage : suppression refusée', refusedShared.ok, false);
    check(
        'partage : refus en 409',
        refusedShared.ok === false ? refusedShared.status : null,
        409,
    );
    check(
        'partage : la fiche est toujours là',
        (await prisma.book.count({ where: { id: source.id } })) === 1,
        true,
    );

    // Le jumeau s'en va (chemin vidé à la main : c'est une préparation, pas le
    // code sous test — les deux fiches se bloquant mutuellement).
    await withoutAudit(() =>
        prisma.book.update({ where: { id: twin.id }, data: { audio_filepath: null } }),
    );
    await withoutAudit(() => prisma.book.delete({ where: { id: twin.id } }));

    // --- 2. aucune décision alors que le dossier est plein -----------------
    const noDecision = await deleteBookWithAudio({
        bookId: source.id,
        performedById: actorId,
    });
    check('sans décision : refusé', noDecision.ok, false);
    check(
        'sans décision : 400',
        noDecision.ok === false ? noDecision.status : null,
        400,
    );
    check(
        'sans décision : le drapeau est porté',
        noDecision.ok === false ? noDecision.extra?.requiresAudioDecision : null,
        true,
    );
    check('sans décision : rien déplacé', (await listBookTracks(SCRATCH)).length, 3);

    // --- 3. transfert vers un livre qui tient déjà des pistes -------------
    const busyTarget = await deleteBookWithAudio({
        bookId: source.id,
        performedById: actorId,
        disposition: { mode: 'transfer', targetBookId: busy.id },
    });
    check('cible occupée : refusé', busyTarget.ok, false);
    checkIncludes(
        'cible occupée : la phrase du rattachement orphelin',
        busyTarget.ok === false ? busyTarget.error : '',
        'possède déjà un dossier audio contenant 1 piste',
    );

    // --- 4. transfert vers un livre libre ----------------------------------
    const moved = await deleteBookWithAudio({
        bookId: source.id,
        performedById: actorId,
        disposition: { mode: 'transfer', targetBookId: target.id },
    });
    check('transfert : accepté', moved.ok, true);
    check('transfert : mode rendu', moved.ok ? moved.audio.mode : null, 'transfer');

    const targetAfter = await prisma.book.findUnique({
        where: { id: target.id },
        select: {
            audio_filepath: true,
            audioLinkStatus: true,
            audioTrackCount: true,
            audioSizeKb: true,
            readingDurationMinutes: true,
        },
    });
    check('transfert : la cible porte le dossier', targetAfter?.audio_filepath, SCRATCH);
    check('transfert : état audio relu', targetAfter?.audioLinkStatus, 'OK');
    check('transfert : pistes comptées sur la cible', targetAfter?.audioTrackCount, 3);
    check('transfert : poids connu', typeof targetAfter?.audioSizeKb, 'number');
    check(
        'transfert : la source a disparu',
        await prisma.book.count({ where: { id: source.id } }),
        0,
    );
    check('transfert : rien n’a bougé dans le bucket', (await listBookTracks(SCRATCH)).length, 3);
    check(
        'transfert : la mesure de durée a suivi',
        await prisma.audioTrackDuration.count({
            where: { bookId: target.id, filename: FILES[0] },
        }),
        1,
    );
    check(
        'transfert : aucune copie en corbeille',
        await prisma.deletedAudioTrack.count({ where: { originBookId: source.id } }),
        0,
    );

    // --- 5. corbeille ------------------------------------------------------
    // La confirmation par le nombre de pistes ne touche pas au stockage : elle
    // se vérifie toujours.
    const wrongCount = await deleteBookWithAudio({
        bookId: target.id,
        performedById: actorId,
        disposition: { mode: 'trash', confirmTrackCount: 2 },
    });
    check('corbeille : confirmation fausse refusée', wrongCount.ok, false);

    if (!copyWorks) {
        skip(
            'corbeille : déplacement non vérifié — CopyObject est injoignable depuis cette machine',
        );
    } else {
        const trashed = await deleteBookWithAudio({
            bookId: target.id,
            performedById: actorId,
            disposition: { mode: 'trash', confirmTrackCount: 3 },
        });
        check('corbeille : accepté', trashed.ok, true);
        check('corbeille : dossier vidé', (await listBookTracks(SCRATCH)).length, 0);
        check(
            'corbeille : la fiche a disparu',
            await prisma.book.count({ where: { id: target.id } }),
            0,
        );

        const stamped = await prisma.deletedAudioTrack.findMany({
            where: { originBookId: target.id },
            select: { id: true, bookId: true, originBookTitle: true, trashKey: true },
        });
        check('corbeille : 3 lignes marquées', stamped.length, 3);
        // `every` sur un tableau vide vaut true : on exige donc les trois lignes,
        // sinon un échec de copie ferait passer les deux contrôles suivants.
        check(
            'corbeille : le livre n’est plus nommé (SetNull)',
            stamped.length === 3 && stamped.every((r) => r.bookId === null),
            true,
        );
        check(
            'corbeille : le titre du livre survit',
            stamped.length === 3 && stamped.every((r) => r.originBookTitle === target.title),
            true,
        );
        const firstCopy = stamped.length ? await headTrack(stamped[0].trashKey) : null;
        check('corbeille : la copie de sauvegarde existe', firstCopy !== null, true);
    }

    // --- 5 bis. l'empreinte laissée à la corbeille, sans dépendre d'une copie
    //
    // C'est LE correctif de la perte de données : une piste envoyée à la
    // corbeille depuis l'éditeur audio, dont la fiche est supprimée ensuite,
    // devenait anonyme (bookId en SetNull) et invisible de tous les écrans,
    // pendant que la purge nocturne effaçait l'objet au bout de 14 jours. Les
    // lignes sont posées à la main ici : ce qu'on vérifie est markTrashOrigin et
    // la requête de l'onglet « Sans fiche », pas le déplacement lui-même.
    await withoutAudit(() =>
        prisma.deletedAudioTrack.createMany({
            data: [1, 2].map((n) => ({
                bookId: left.id,
                originalKey: `${SCRATCH_LEAVE}9200 0${n}- Ancienne.mp3`,
                trashKey: `corbeille/${left.id}/${RUN}-${n}-Ancienne.mp3`,
                filename: `9200 0${n}- Ancienne.mp3`,
                sizeBytes: BigInt(1024),
                deletedById: actorId,
            })),
        }),
    );


    // --- 6. laisser le dossier --------------------------------------------
    const leftBehind = await deleteBookWithAudio({
        bookId: left.id,
        performedById: actorId,
        disposition: { mode: 'leave' },
    });
    check('laisser : accepté', leftBehind.ok, true);
    check(
        'laisser : le préfixe est rendu',
        leftBehind.ok ? leftBehind.audio.orphanedPrefix : null,
        SCRATCH_LEAVE,
    );
    check(
        'laisser : le fichier est toujours dans le stockage',
        (await headTrack(`${SCRATCH_LEAVE}9200 01- Laissée.mp3`))?.sizeBytes,
        3072,
    );
    // Les deux seules lignes attendues sont celles posées au 5 bis : « laisser »
    // ne copie rien, c'est tout son intérêt.
    check(
        'laisser : rien de neuf en corbeille',
        await prisma.deletedAudioTrack.count({ where: { originBookId: left.id } }),
        2,
    );
    const orphan = await prisma.orphanAudioFolder.findUnique({
        where: { prefix: SCRATCH_LEAVE },
        select: { trackCount: true, bytes: true, note: true, resolvedAt: true, linkedBookId: true },
    });
    check('laisser : mis dans la file des orphelins', orphan !== null, true);
    check('laisser : pistes comptées', orphan?.trackCount, 1);
    check('laisser : poids enregistré', Number(orphan?.bytes ?? -1), 3072);
    check('laisser : à traiter (ni résolu ni rattaché)', [orphan?.resolvedAt, orphan?.linkedBookId], [
        null,
        null,
    ]);
    checkIncludes('laisser : la note dit d’où vient le dossier', orphan?.note, `#${left.id}`);

    // L'empreinte posée par markTrashOrigin sur les lignes du 5 bis.
    const orphanedTrash = await prisma.deletedAudioTrack.findMany({
        where: { originBookId: left.id },
        select: { bookId: true, originBookTitle: true },
    });
    check('empreinte : les deux lignes sont marquées', orphanedTrash.length, 2);
    check(
        'empreinte : le livre n’est plus nommé (SetNull)',
        orphanedTrash.length === 2 && orphanedTrash.every((r) => r.bookId === null),
        true,
    );
    check(
        'empreinte : le titre du livre survit à sa fiche',
        orphanedTrash.length === 2 && orphanedTrash.every((r) => r.originBookTitle === left.title),
        true,
    );
    // Exactement la requête de l'onglet « Sans fiche » de /admin/audio-corbeille :
    // avant ces colonnes, ces lignes n'étaient lisibles depuis aucun écran.
    check(
        'empreinte : visibles dans la corbeille générale',
        await prisma.deletedAudioTrack.count({
            where: { bookId: null, restoredAt: null, purgedAt: null, originBookId: left.id },
        }),
        2,
    );

    // --- 7. fiche sans dossier du tout ------------------------------------
    const bare = await makeBook('sans dossier', null, actorId);
    const bareGone = await deleteBookWithAudio({ bookId: bare.id, performedById: actorId });
    check('sans dossier : supprimée sans rien demander', bareGone.ok, true);
    check('sans dossier : 0 piste', bareGone.ok ? bareGone.audio.trackCount : null, 0);

    // --- nettoyage ---------------------------------------------------------
    console.log('\nnettoyage…');
    const trashRows = await prisma.deletedAudioTrack.findMany({
        where: {
            OR: [
                { originBookTitle: { startsWith: TITLE_PREFIX } },
                { trashKey: { contains: `/${RUN}-` } },
            ],
        },
        select: { id: true, trashKey: true },
    });
    for (const r of trashRows) await drop(r.trashKey);
    await prisma.deletedAudioTrack.deleteMany({
        where: { id: { in: trashRows.map((r) => r.id) } },
    });
    await prisma.orphanAudioFolder.deleteMany({
        where: { prefix: { in: [SCRATCH, SCRATCH_BUSY, SCRATCH_LEAVE] } },
    });
    await prisma.audioTrackEvent.deleteMany({
        where: { bookId: null, filename: { in: [...FILES, '9100 01- Occupée.mp3', '9200 01- Laissée.mp3'] } },
    });
    await prisma.audioTrackDuration.deleteMany({ where: { method: 'TEST' } });
    await withoutAudit(() =>
        prisma.book.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } }),
    );
    for (const prefix of [SCRATCH, SCRATCH_BUSY, SCRATCH_LEAVE]) {
        for (const o of await listRawObjects(prefix)) await drop(o.key);
        check(`scratch vidé : ${prefix}`, (await listRawObjects(prefix)).length, 0);
    }
    check(
        'aucune fiche de test restante',
        await prisma.book.count({ where: { title: { startsWith: TITLE_PREFIX } } }),
        0,
    );

    console.log(failures ? `\n${failures} échec(s)` : '\nTous les contrôles passent.');
    process.exitCode = failures ? 1 : 0;
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
