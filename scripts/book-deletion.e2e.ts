/**
 * End-to-end check of book deletion and the three audio dispositions, against
 * the real bucket and a local database.
 *
 *   node --conditions=react-server --import tsx scripts/book-deletion.e2e.ts
 *
 * (the react-server condition stubs out `server-only`, so lib/books/* and
 * lib/audio/* — the actual production modules — run under plain Node.)
 *
 * Covers what lib/books/deleteBookWithAudio.ts decides: the refusal on
 * demandes / attributions, the folder shared with another fiche (only `leave`
 * allowed), the refusal to act with no disposition at all, then `leave` / `transfer` / `trash`. The route
 * on top of it is a body parser; the rules live here. Deleting a book is a soft
 * delete (`Book.deletedAt`) now, never a real row delete, so `DeletedAudioTrack
 * .bookId` is never nulled by it either — the corbeille stays attached to the
 * (hidden, restorable) fiche. Then the two ways back: the plain undo (POST
 * /api/books/[id]/restore, lifting `deletedAt` and calling `restoreTracksByIds` on the tracks the permanent ticked —
 * no reattachment needed, `bookId` was never detached), and
 * reattachAudioAfterBookRestore, for the one case where a book row really is
 * gone — a hard delete (scripts/delete-duplicate-book.ts, a fusion) — and the
 * journal's restore route recreates it at its original id.
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
import { reattachAudioAfterBookRestore } from '../lib/books/restoreBookAudio';
import { markTrashOrigin, restoreTracksByIds } from '../lib/audio/trash';
import { readBookRestorePreview } from '../lib/books/restorePreview';

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

    // --- 1. dossier partagé : seule « laisser le dossier » passe -----------
    //
    // Le partage bloquait toute suppression, héritage du temps où supprimer une
    // fiche vidait son dossier : les deux fiches se bloquaient mutuellement, et
    // le permanent n'avait aucun moyen d'en finir (Doublons ne trouve que les
    // paires signalées, et rien ne permet de « détacher » un dossier).
    const shared = await readBookDeletionCheck(source.id);
    check('partage détecté', shared.preflight?.audio.sharedWith.map((b) => b.id), [twin.id]);
    check('partage : PAS bloqué', shared.preflight?.blocked, false);
    checkIncludes(
        'partage : l’avertissement nomme le jumeau',
        shared.preflight?.audio.sharedNotice,
        `(#${twin.id})`,
    );
    check('partage : 3 pistes comptées', shared.preflight?.audio.trackCount, 3);

    for (const mode of ['transfer', 'trash'] as const) {
        const refused = await deleteBookWithAudio({
            bookId: source.id,
            performedById: actorId,
            disposition:
                mode === 'transfer'
                    ? { mode, targetBookId: target.id }
                    : { mode, confirmTrackCount: 3 },
        });
        check(`partage : ${mode} refusé`, refused.ok, false);
        check(`partage : ${mode} en 409`, refused.ok === false ? refused.status : null, 409);
        checkIncludes(
            `partage : le refus ${mode} nomme le jumeau`,
            refused.ok === false ? refused.error : null,
            `(#${twin.id})`,
        );
    }
    check(
        'partage : après les refus, la source est toujours active',
        (await prisma.book.count({ where: { id: source.id } })) === 1,
        true,
    );
    check('partage : après les refus, rien déplacé', (await listBookTracks(SCRATCH)).length, 3);

    // « Laisser » passe : c'est le jumeau qui s'en va, la source garde le dossier.
    const leftShared = await deleteBookWithAudio({
        bookId: twin.id,
        performedById: actorId,
        disposition: { mode: 'leave' },
    });
    check('partage : laisser le dossier accepté', leftShared.ok, true);
    check(
        'partage : le toast saura qui garde le dossier',
        leftShared.ok ? leftShared.audio.keptBy?.map((b) => b.id) : null,
        [source.id],
    );
    check(
        'partage : le jumeau est masqué (suppression douce)',
        (await prisma.book.count({ where: { id: twin.id } })) === 0,
        true,
    );
    check('partage : aucune piste n’a bougé', (await listBookTracks(SCRATCH)).length, 3);
    check(
        'partage : la source garde son chemin',
        (await prisma.book.findUnique({ where: { id: source.id }, select: { audio_filepath: true } }))
            ?.audio_filepath,
        SCRATCH,
    );
    const afterTwin = await readBookDeletionCheck(source.id);
    check('partage : la source ne partage plus', afterTwin.preflight?.audio.sharedWith, []);

    // Le jumeau masqué disparaît pour de bon : il réclame encore SCRATCH, et
    // la suite transfère ce dossier (préparation, pas le code sous test).
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
        // Suppression = soft delete désormais : la fiche ne quitte jamais
        // Postgres, donc le SetNull de la contrainte ne se déclenche jamais.
        // `bookId` reste sur le livre — c'est justement ce qui permet à la
        // restauration douce ci-dessous de retrouver ses pistes sans rien
        // réattacher.
        // `every` sur un tableau vide vaut true : on exige donc les trois lignes,
        // sinon un échec de copie ferait passer les deux contrôles suivants.
        check(
            'corbeille : la ligne reste rattachée à la fiche (masquée, pas effacée)',
            stamped.length === 3 && stamped.every((r) => r.bookId === target.id),
            true,
        );
        check(
            'corbeille : le titre du livre survit',
            stamped.length === 3 && stamped.every((r) => r.originBookTitle === target.title),
            true,
        );
        const firstCopy = stamped.length ? await headTrack(stamped[0].trashKey) : null;
        check('corbeille : la copie de sauvegarde existe', firstCopy !== null, true);

        const softDeletedTarget = await prisma.book.findUnique({
            where: { id: target.id },
            select: { deletedAt: true },
        });
        check('corbeille : la fiche existe toujours, masquée', softDeletedTarget !== null, true);
        check('corbeille : et marquée supprimée', softDeletedTarget?.deletedAt !== null, true);

        // --- 5 bis. restauration douce : la fiche ET sa corbeille reviennent --
        //
        // POST /api/books/[id]/restore (app/api/books/[id]/restore/route.ts)
        // fait exactement ceci : lire l'aperçu, lever `deletedAt`, puis
        // restoreTracksByIds sur les pistes cochées — ici celles parties avec la
        // suppression, cochées par défaut. Rien à réattacher, `bookId` n'a
        // jamais bougé.
        const restorePreview = await readBookRestorePreview(target.id);
        check(
            'restauration douce : les 3 pistes sont proposées comme parties avec la suppression',
            restorePreview?.audio.withDeletion.length,
            3,
        );
        check('restauration douce : aucune piste plus ancienne proposée', restorePreview?.audio.earlier.length, 0);
        await prisma.book.update({ where: { id: target.id }, data: { deletedAt: null } });
        check(
            'restauration douce : la fiche redevient visible',
            await prisma.book.count({ where: { id: target.id } }),
            1,
        );
        const { restored: softRestored, failed: softFailed } = await restoreTracksByIds({
            trashIds: (restorePreview?.audio.withDeletion ?? []).map((t) => t.id),
            userId: actorId,
        });
        check('restauration douce : les 3 pistes reviennent', softRestored, 3);
        check('restauration douce : rien en échec', softFailed.length, 0);
        check(
            'restauration douce : plus rien « en corbeille » pour ce livre',
            await prisma.deletedAudioTrack.count({ where: { bookId: target.id, restoredAt: null } }),
            0,
        );
        await waitForCount(SCRATCH, 3);
        check(
            'restauration douce : les 3 pistes sont revenues dans le dossier',
            (await listBookTracks(SCRATCH)).length,
            3,
        );
    }

    // --- 5 ter. l'empreinte laissée à la corbeille, sans dépendre d'une copie
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
    // Soft delete : la fiche ne quitte jamais Postgres, donc il n'y a plus de
    // dossier orphelin à mettre en file — `audio_filepath` reste sur une fiche
    // qui existe toujours et le revendique encore.
    const softDeletedLeft = await prisma.book.findUnique({
        where: { id: left.id },
        select: { deletedAt: true, audio_filepath: true },
    });
    check('laisser : la fiche existe toujours, masquée', softDeletedLeft !== null, true);
    check('laisser : et marquée supprimée', softDeletedLeft?.deletedAt !== null, true);
    check('laisser : le dossier lui reste attaché', softDeletedLeft?.audio_filepath, SCRATCH_LEAVE);
    check(
        'laisser : aucun orphelin mis en file (la fiche le revendique encore)',
        await prisma.orphanAudioFolder.count({ where: { prefix: SCRATCH_LEAVE } }),
        0,
    );

    // L'empreinte posée par markTrashOrigin sur les lignes du 5 ter — elle
    // s'écrit toujours, même quand la fiche ne disparaît plus vraiment : elle
    // sert le jour où le livre finit par être réellement effacé (fusion,
    // scripts/delete-duplicate-book.ts), le seul cas où `bookId` devient NULL
    // pour de vrai (voir section 7).
    const orphanedTrash = await prisma.deletedAudioTrack.findMany({
        where: { originBookId: left.id },
        select: { bookId: true, originBookTitle: true },
    });
    check('empreinte : les deux lignes sont marquées', orphanedTrash.length, 2);
    check(
        'empreinte : la ligne reste rattachée à la fiche (masquée, pas effacée)',
        orphanedTrash.length === 2 && orphanedTrash.every((r) => r.bookId === left.id),
        true,
    );
    check(
        'empreinte : le titre du livre survit aussi',
        orphanedTrash.length === 2 && orphanedTrash.every((r) => r.originBookTitle === left.title),
        true,
    );
    // La corbeille « sans fiche » de /admin/audio-corbeille ne doit RIEN
    // montrer ici : la fiche existe encore, ces lignes ne sont pas orphelines.
    check(
        'empreinte : absente de la corbeille « sans fiche »',
        await prisma.deletedAudioTrack.count({
            where: { bookId: null, restoredAt: null, purgedAt: null, originBookId: left.id },
        }),
        0,
    );

    // --- 7. reattachAudioAfterBookRestore : le chemin qui reste ------------
    //
    // deleteBookWithAudio ne fait plus jamais disparaître une ligne Book — ce
    // module ne sert donc plus une suppression normale. Il reste vivant pour
    // l'AUTRE façon dont un livre s'efface, encore bien réelle : un vrai
    // DELETE (scripts/delete-duplicate-book.ts, une fusion depuis Doublons),
    // suivi d'une restauration qui recrée la ligne à SON identifiant d'origine
    // — /admin/stats rejoue ainsi une suppression de moins de 14 jours. C'est
    // le seul cas où `DeletedAudioTrack.bookId` devient NULL pour de vrai (la
    // contrainte SetNull ne se déclenche que sur un DELETE, jamais sur le
    // simple `deletedAt` posé par deleteBookWithAudio). Aucun appel au bucket
    // ici : reattachAudioAfterBookRestore ne touche que Postgres.
    const HARD_PREFIX = `2022/_eca-test-suppression-${RUN}-dure/`;
    const hard = await makeBook('effacée pour de bon', HARD_PREFIX, actorId);
    await withoutAudit(() =>
        prisma.deletedAudioTrack.create({
            data: {
                bookId: hard.id,
                originalKey: `${HARD_PREFIX}9300 01- Dure.mp3`,
                trashKey: `corbeille/${hard.id}/${RUN}-dure.mp3`,
                filename: '9300 01- Dure.mp3',
                sizeBytes: BigInt(1024),
                deletedById: actorId,
            },
        }),
    );
    // La même empreinte que markTrashOrigin pose d'ordinaire (ou que
    // scripts/delete-duplicate-book.ts écrit à la main, sans elle).
    await markTrashOrigin(hard.id, hard.title);
    // Le dossier, mis en attente comme le ferait scripts/sync-audio-links.ts
    // après le passage d'un vrai DELETE.
    await withoutAudit(() =>
        prisma.orphanAudioFolder.create({
            data: {
                prefix: HARD_PREFIX,
                title: hard.title,
                trackCount: 1,
                bytes: BigInt(1024),
                note: `dossier laissé en place par la suppression de la fiche #${hard.id} « ${hard.title} »`,
            },
        }),
    );

    // L'effacement réel : ici, et seulement ici, Postgres déclenche le SetNull.
    await withoutAudit(() => prisma.book.delete({ where: { id: hard.id } }));
    const anonymized = await prisma.deletedAudioTrack.findFirst({
        where: { trashKey: `corbeille/${hard.id}/${RUN}-dure.mp3` },
        select: { bookId: true, originBookId: true },
    });
    check('effacement réel : bookId anonymisé par la contrainte (SetNull)', anonymized?.bookId, null);
    check('effacement réel : l’empreinte a suivi', anonymized?.originBookId, hard.id);

    // La reconstruction que /admin/stats fait, à l'identique : recréer la
    // ligne à SON identifiant d'origine.
    const revived = await withoutAudit(() =>
        prisma.book.create({
            data: {
                id: hard.id,
                title: hard.title,
                author: 'Test',
                audio_filepath: HARD_PREFIX,
                available: true,
                addedById: actorId,
            },
            select: { id: true },
        }),
    );
    // Une ligne appartenant à un AUTRE livre, marquée du même identifiant
    // d'origine : le garde-fou `bookId: null` doit la laisser tranquille.
    const keeper = await makeBook('déjà rattachée', null, actorId);
    await withoutAudit(() =>
        prisma.deletedAudioTrack.create({
            data: {
                bookId: keeper.id,
                originBookId: hard.id,
                originBookTitle: hard.title,
                originalKey: `${HARD_PREFIX}9300 99- Déjà rattachée.mp3`,
                trashKey: `corbeille/${keeper.id}/${RUN}-99-Deja.mp3`,
                filename: '9300 99- Déjà rattachée.mp3',
                sizeBytes: BigInt(1024),
                deletedById: actorId,
            },
        }),
    );

    const restored = await reattachAudioAfterBookRestore(revived.id, HARD_PREFIX);
    check('restauration : la ligne revient', restored.reattachedTracks, 1);
    check('restauration : le dossier n’est plus orphelin', restored.clearedOrphan, true);
    check(
        'restauration : la corbeille du livre est de nouveau lisible',
        await prisma.deletedAudioTrack.count({ where: { bookId: revived.id } }),
        1,
    );
    check(
        'restauration : plus rien « sans fiche » pour ce livre',
        await prisma.deletedAudioTrack.count({
            where: { bookId: null, originBookId: hard.id },
        }),
        0,
    );
    check(
        'restauration : la ligne d’un autre livre n’a pas été reprise',
        (
            await prisma.deletedAudioTrack.findFirst({
                where: { filename: '9300 99- Déjà rattachée.mp3' },
                select: { bookId: true },
            })
        )?.bookId,
        keeper.id,
    );
    check(
        'restauration : la file des orphelins est vidée de ce dossier',
        await prisma.orphanAudioFolder.count({ where: { prefix: HARD_PREFIX } }),
        0,
    );
    // Rejouée, elle ne défait rien et ne reprend rien.
    const again = await reattachAudioAfterBookRestore(revived.id, HARD_PREFIX);
    check('restauration : rejouée, sans effet', [again.reattachedTracks, again.clearedOrphan], [
        0,
        false,
    ]);

    // --- 8. fiche sans dossier du tout ------------------------------------

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
        where: { prefix: { in: [SCRATCH, SCRATCH_BUSY, SCRATCH_LEAVE, HARD_PREFIX] } },
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
