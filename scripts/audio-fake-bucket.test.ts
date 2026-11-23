/**
 * The audio write paths against an IN-MEMORY bucket (scripts/fake-bucket.cjs).
 *
 *   node --env-file=.env --conditions=react-server --require ./scripts/e2e-fake-bucket.cjs --import tsx scripts/audio-fake-bucket.test.ts
 *
 * Part A needs nothing. Part B drives the real routes and lib/audio on the LOCAL
 * dev database — it refuses any other host — and leaves its « ZZZ Test » fiches
 * soft-deleted, like the other test fixtures. No byte ever reaches B2: the
 * bucket module is replaced before anything imports it, and the run stops if not.
 *
 * Unlike scripts/audio-manage.e2e.ts (which works in scratch prefixes of the
 * REAL bucket, to prove B2 itself behaves), this one can stage what B2 does
 * only on a bad day: a delete carried out whose answer is lost, a copy refused.
 */
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const bucket = require('../lib/audio/bucket.ts');
if (!bucket.__isFake) {
    console.error('Refusé : le faux stockage n’est pas branché (--require ./scripts/e2e-fake-bucket.cjs).');
    process.exit(1);
}

type FakeObject = { size: number; checksum: string | null; lastModified?: Date };
const F = (globalThis as unknown as {
    __fake: {
        objects: Map<string, FakeObject>;
        signed: string[];
        failDelete: Set<string>;
        deleteThenFail: Set<string>;
        copyError: Error | null;
    };
}).__fake;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'ÉCHEC'}  ${label}` +
            (ok ? '' : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`),
    );
}
const sha = (c: string) => Buffer.alloc(32, c).toString('base64');
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
    const err = console.error;
    console.error = () => {};
    try {
        return await fn();
    } finally {
        console.error = err;
    }
};

async function partA() {
    console.log('— A. sans base');
    const { sniffAudioContainer } = require('../lib/audio-file-extension.ts');
    const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...Buffer.from(`ftyp${brand}`)]);
    check(
        'présentation : M4A, M4B, isom, mp42 acceptés',
        ['M4A ', 'M4B ', 'isom', 'mp42'].map((b) => sniffAudioContainer(ftyp(b))),
        ['mp4', 'mp4', 'mp4', 'mp4'],
    );
    check(
        'présentation : photo HEIC, image AVIF, film QuickTime refusés',
        ['heic', 'avif', 'qt  '].map((b) => sniffAudioContainer(ftyp(b))),
        [null, null, null],
    );

    const { unexpectedErrorResponse } = require('../lib/api-errors.ts');
    const { DevBucketWriteRefused } = bucket;
    const res = await quiet(async () => unexpectedErrorResponse({ where: 'test', error: new DevBucketWriteRefused('envoi') }));
    const body = await res.json();
    check('refus du serveur de dev : 409, pas 500, et dit pourquoi', [res.status, body.devBucketRefused, /AUDIO_DEV_BUCKET_WRITES/.test(body.message)], [409, true, true]);
}

async function partB() {
    const { scriptDatabaseUrl, describeDatabase } = require('./db-url.ts');
    const host = describeDatabase(scriptDatabaseUrl());
    console.log(`\n— B. base ${host}`);
    if (!/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
        console.log('   ignorée : ce n’est pas la base locale de développement.');
        return false;
    }

    const { prisma } = require('../lib/prisma.ts');
    const { withoutAudit } = require('../lib/audit/context.ts');
    const { renameTrack } = require('../lib/audio/rename.ts');
    const { softDeleteTracks, restoreTrack, restoreTracksByIds, softDeleteTrack, AudioTrashError } = require('../lib/audio/trash.ts');
    const { claimUploadLease, releaseUploadLease } = require('../lib/audio/uploadLease.ts');
    const uploadUrl = require('../app/api/books/[id]/audio/upload-url/route.ts');
    const me = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || 'claude@eca.test' }, select: { id: true } });

    const ts = Date.now();
    const created: number[] = [];
    const newBook = async (title: string, prefix: string) => {
        const b = await withoutAudit(() =>
            prisma.book.create({ data: { title: `ZZZ Test ${title}`, author: 'ZZZ', addedBy: { connect: { id: me.id } }, audio_filepath: prefix } }),
        );
        created.push(b.id);
        return b.id as number;
    };

    try {
        // --- rename: the delete happened, its answer did not --------------------
        console.log('\n  renommage');
        const rp = `zzz-test/${ts}-rename/`;
        const rbook = await newBook('renommage', rp);
        const OLD = `${rp}1000 01 A.mp3`;
        const NEW = `${rp}1000 01 A bis.mp3`;
        F.objects.set(OLD, { size: 300, checksum: sha('r') });
        const tryRename = (oldKey: string, newKey: string) =>
            quiet(async () => {
                try {
                    await renameTrack({ bookId: rbook, oldKey, newKey, userId: me.id });
                    return 'ok';
                } catch (e) {
                    return (e as Error).message;
                }
            });

        F.deleteThenFail.add(OLD);
        check(
            'original supprimé mais réponse perdue : le renommage tient, la copie reste',
            [await tryRename(OLD, NEW), F.objects.has(OLD), F.objects.has(NEW)],
            ['ok', false, true],
        );
        F.deleteThenFail.clear();

        F.failDelete.add(NEW);
        const BACK = `${rp}1000 01 A ter.mp3`;
        const msg = await tryRename(NEW, BACK);
        check(
            'original vraiment indélébile : copie défaite, nom d’origine',
            [msg.includes('resté sous son nom d’origine'), F.objects.has(NEW), F.objects.has(BACK)],
            [true, true, false],
        );
        F.failDelete.clear();

        const leaseToken = randomUUID();
        await claimUploadLease(rbook, me.id, leaseToken);
        const busy = await tryRename(NEW, BACK);
        check('renommage pendant un envoi : refusé, rien touché', [busy.startsWith('Renommage impossible pour l’instant'), F.objects.has(NEW), F.objects.has(BACK)], [true, true, false]);
        await releaseUploadLease(rbook, leaseToken);

        // --- restore while an upload holds the book ----------------------------
        console.log('\n  restauration pendant un envoi');
        const sp = `zzz-test/${ts}-restore/`;
        const sbook = await newBook('restauration', sp);
        const T1 = `${sp}1000 01 Un.mp3`;
        const T2 = `${sp}1000 02 Deux.mp3`;
        F.objects.set(T1, { size: 100, checksum: sha('1') });
        F.objects.set(T2, { size: 100, checksum: sha('2') });
        const r1 = await softDeleteTrack({ bookId: sbook, key: T1, filename: '1000 01 Un.mp3', userId: me.id });
        const r2 = await softDeleteTrack({ bookId: sbook, key: T2, filename: '1000 02 Deux.mp3', userId: me.id });

        const other = randomUUID();
        await claimUploadLease(sbook, me.id, other);
        const single = await quiet(async () => {
            try {
                await restoreTrack({ trashId: r1.trashId, userId: me.id });
                return 'ok';
            } catch (e) {
                return e instanceof AudioTrashError ? (e as Error).message : `inattendu : ${(e as Error).message}`;
            }
        });
        check('une piste : refusée, copie de corbeille intacte', [single.startsWith('Restauration impossible pour l’instant'), F.objects.has(T1), F.objects.has(r1.trashKey)], [true, false, true]);
        const bulk = await restoreTracksByIds({ trashIds: [r1.trashId, r2.trashId], userId: me.id });
        check('par lot : deux refus motivés, rien restauré', [bulk.restored, bulk.failed.length, /envoi de fichiers est en cours/.test(bulk.failed[0]?.reason ?? '')], [0, 2, true]);
        await releaseUploadLease(sbook, other);
        const after = await restoreTracksByIds({ trashIds: [r1.trashId, r2.trashId], userId: me.id });
        check('envoi terminé : les deux reviennent', [after.restored, F.objects.has(T1), F.objects.has(T2)], [2, true, true]);

        // --- « Remplacer » ---------------------------------------------------------
        console.log('\n  remplacer');
        const pp = `zzz-test/${ts}-replace/`;
        const pbook = await newBook('remplacer', pp);
        const C1 = `${pp}1000 01 Chap.mp3`;
        const C5 = `${pp}1000 05 Chap.mp3`;
        const C9 = `${pp}1000 09 Chap.mp3`;
        for (const k of [C1, C5, C9]) F.objects.set(k, { size: 500, checksum: sha(k.slice(-8, -7)) });
        const lease = randomUUID();
        const sign = async (file: Record<string, unknown>) => {
            F.signed.length = 0;
            const res: Response = await quiet(() =>
                uploadUrl.POST(
                    new NextRequest(`http://localhost/api/books/${pbook}/audio/upload-url`, {
                        method: 'POST',
                        body: JSON.stringify({ leaseToken: lease, files: [file] }),
                    }),
                    { params: Promise.resolve({ id: String(pbook) }) },
                ),
            );
            return { status: res.status, data: await res.json(), signed: [...F.signed] };
        };
        const take = { name: 'chapitre 5 refait.mp3', size: 480, checksum: sha('n') };

        let r = await sign({ ...take, replaceKey: C5 });
        check(
            'premier appel : ancienne prise en corbeille, PUT signé à sa place',
            [r.status, r.signed, F.objects.has(C5), r.data.expiresIn, 'strategy' in (r.data.files?.[0] ?? {}), 'checksum' in (r.data.files?.[0] ?? {})],
            [200, [C5], false, 600, false, false],
        );
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise, place encore libre : même clé re-signée', [r.status, r.signed], [200, [C5]]);

        // The old take comes back from the corbeille before the new one lands.
        F.objects.set(C5, { size: 500, checksum: sha('5') });
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise, place reprise entre-temps : 409, rien signé, jamais en fin de livre', [r.status, r.data.replaceConflict, r.signed], [409, true, []]);

        F.objects.set(C5, { size: 480, checksum: take.checksum });
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise, la nouvelle prise est arrivée : « landed », rien signé', [r.status, r.data.files?.[0]?.landed, r.signed], [200, true, []]);

        r = await sign({ ...take, replaceKey: `${pp}0000 00 Nulle part.mp3` });
        check('remplacer une piste qui n’a jamais existé : 409, rien signé', [r.status, r.signed], [409, []]);
        await releaseUploadLease(pbook, lease);

        // --- the dev guard reaches the caller whole ------------------------------
        console.log('\n  refus du serveur de dev');
        const dp = `zzz-test/${ts}-dev/`;
        const dbook = await newBook('refus dev', dp);
        F.objects.set(`${dp}1000 01 A.mp3`, { size: 10, checksum: null });
        F.copyError = new bucket.DevBucketWriteRefused('copie');
        const thrown = await quiet(async () => {
            try {
                await softDeleteTracks({ bookId: dbook, prefix: dp, tracks: [{ key: `${dp}1000 01 A.mp3`, name: '1000 01 A.mp3', sizeBytes: 10 }], userId: me.id });
                return 'aucune exception';
            } catch (e) {
                return (e as Error).name;
            }
        });
        F.copyError = null;
        check('« Tout supprimer » sur le serveur de dev : le refus remonte tel quel', thrown, 'DevBucketWriteRefused');
    } finally {
        if (created.length) {
            await withoutAudit(() => prisma.book.updateMany({ where: { id: { in: created } }, data: { deletedAt: new Date() } }));
        }
        await prisma.$disconnect();
    }
    return true;
}

(async () => {
    await partA();
    const ranB = await partB();
    console.log(`\n${failures ? `${failures} ÉCHEC(S)` : ranB ? 'Tout est passé.' : 'Partie A passée ; partie B non lancée.'}`);
    process.exitCode = failures ? 1 : 0;
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
