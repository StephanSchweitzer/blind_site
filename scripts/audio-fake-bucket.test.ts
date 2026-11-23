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
        copyDelayMs?: number;
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

    // --- the dialogue's decisions (lib/audio/upload-plan.ts) ------------------
    const { needsResign, shouldPublishBook } = require('../lib/audio/upload-plan.ts');
    const now = Date.now();
    check(
        'URL signée il y a 1 min (10 min de vie) : gardée ; il y a 8 min 30 : re-signée',
        [needsResign({ signedAt: now - 60_000, ttlMs: 600_000 }, now), needsResign({ signedAt: now - 510_000, ttlMs: 600_000 }, now)],
        [false, true],
    );
    const pub = (replacing: boolean, isLastChunk: boolean, statuses: string[]) => shouldPublishBook({ replacing, isLastChunk, statuses });
    check(
        'publication : envoi complet (fichiers déjà présents compris) oui ; échec, tranche non finale, « Remplacer » non',
        [
            pub(false, true, ['terminé', 'terminé']),
            pub(false, true, ['terminé', 'échec']),
            pub(false, false, ['terminé', 'terminé']),
            pub(true, true, ['terminé']),
        ],
        [true, false, false, false],
    );
    const { isCloudFinalising } = require('../lib/audio/upload-plan.ts');
    check(
        'panneau « cloud » : seulement quand tout est parti — pas pour un fichier en attente du stockage parmi d’autres à envoyer',
        [
            isCloudFinalising('uploading', ['finalisation', 'en cours', 'en attente']),
            isCloudFinalising('finalising', ['terminé', 'en attente']), // commit d'une tranche, d'autres suivent
            isCloudFinalising('uploading', ['terminé', 'finalisation', 'échec']),
            isCloudFinalising('uploading', ['terminé', 'terminé']), // entre la dernière réponse et le commit
            isCloudFinalising('finalising', ['terminé', 'terminé']),
            isCloudFinalising('preparing', ['échec', 'échec']), // pause avant une nouvelle passe
            isCloudFinalising('uploading', ['terminé', 'nouvelle tentative']),
        ],
        [false, false, true, true, true, false, false],
    );

    // --- key tickets (lib/audio/keyTicket.ts) ----------------------------------
    if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
        console.log('   tickets ignorés : NEXTAUTH_SECRET absent de l’environnement.');
        return;
    }
    const { issueKeyTicket, verifyKeyTicket } = require('../lib/audio/keyTicket.ts');
    const t = issueKeyTicket(12, 'dirt/x/1000 01 A.mp3');
    const tampered = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
    check(
        'ticket : valide pour sa clé, refusé pour un autre livre, une autre clé, une signature altérée',
        [
            verifyKeyTicket(12, 'dirt/x/1000 01 A.mp3', t),
            verifyKeyTicket(13, 'dirt/x/1000 01 A.mp3', t),
            verifyKeyTicket(12, 'dirt/x/1000 02 B.mp3', t),
            verifyKeyTicket(12, 'dirt/x/1000 01 A.mp3', tampered),
            verifyKeyTicket(12, 'dirt/x/1000 01 A.mp3', undefined),
        ],
        [true, false, false, false, false],
    );
    const realNow = Date.now;
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    const expired = verifyKeyTicket(12, 'dirt/x/1000 01 A.mp3', t);
    Date.now = realNow;
    check('ticket : périmé après 24 h', expired, false);
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
        const slotTicket = r.data.files?.[0]?.ticket;
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise sans ticket, place libre : 409, rien signé', [r.status, r.signed], [409, []]);
        r = await sign({ ...take, replaceKey: C5, existingKey: C5, keyTicket: slotTicket });
        check('reprise avec ticket, place encore libre : même clé re-signée', [r.status, r.signed], [200, [C5]]);

        // The old take comes back from the corbeille before the new one lands.
        F.objects.set(C5, { size: 500, checksum: sha('5') });
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise, place reprise entre-temps : 409, rien signé, jamais en fin de livre', [r.status, r.data.replaceConflict, r.signed], [409, true, []]);

        F.objects.set(C5, { size: 480, checksum: take.checksum });
        r = await sign({ ...take, replaceKey: C5, existingKey: C5 });
        check('reprise, la nouvelle prise est arrivée : « landed », rien signé', [r.status, r.data.files?.[0]?.landed, r.signed], [200, true, []]);

        r = await sign({ ...take, replaceKey: `${pp}0000 00 Nulle part.mp3` });
        check('remplacer une piste qui n’a jamais existé : 409, rien signé', [r.status, r.signed], [409, []]);

        // --- an absent existingKey needs the ticket that came with it -----------
        console.log('\n  reprise d’une clé absente');
        const fresh = { name: 'nouveau.mp3', size: 300, checksum: sha('f') };
        r = await sign(fresh);
        const K = r.data.files?.[0]?.key as string;
        const kTicket = r.data.files?.[0]?.ticket as string;
        check('envoi neuf : nommé après la dernière piste, avec un ticket', [r.status, K > C9, typeof kTicket], [200, true, 'string']);
        r = await sign({ ...fresh, existingKey: K, keyTicket: kTicket });
        check('reprise avec son ticket (PUT jamais arrivé) : même clé re-signée', [r.signed, r.data.files?.[0]?.reused], [[K], true]);
        const CRAFTED = `${pp}1000 00 Avant tout.mp3`;
        r = await sign({ ...fresh, existingKey: CRAFTED });
        check('clé absente inventée, sans ticket : jamais signée, nom neuf', [r.signed.includes(CRAFTED), r.data.files?.[0]?.reused], [false, false]);
        r = await sign({ ...fresh, existingKey: CRAFTED, keyTicket: kTicket });
        check('clé absente inventée, ticket d’une autre clé : jamais signée', r.signed.includes(CRAFTED), false);
        await releaseUploadLease(pbook, lease);

        // --- commit believes a browser duration only with a ticket ---------------
        console.log('\n  durée transmise au commit');
        const commit = require('../app/api/books/[id]/audio/commit/route.ts');
        F.objects.set(K, { size: 300, checksum: fresh.checksum });
        const res: Response = await quiet(() =>
            commit.POST(
                new NextRequest(`http://localhost/api/books/${pbook}/audio/commit`, {
                    method: 'POST',
                    body: JSON.stringify({
                        uploaded: [
                            { key: K, size: 300, durationSeconds: 999, ticket: kTicket },
                            { key: C1, size: 500, durationSeconds: 777 },
                        ],
                    }),
                }),
                { params: Promise.resolve({ id: String(pbook) }) },
            ),
        );
        const events = await prisma.audioTrackEvent.findMany({
            where: { bookId: pbook, action: 'UPLOAD' },
            select: { filename: true, durationSeconds: true },
            orderBy: { filename: 'asc' },
        });
        check(
            'piste envoyée (ticket) : durée gardée ; piste ancienne sans ticket : durée ignorée',
            [res.status, events.map((e: { filename: string; durationSeconds: number | null }) => [e.filename, e.durationSeconds])],
            [200, [[C1.slice(pp.length), null], [K.slice(pp.length), 999]]],
        );

        // A retried commit is not journaled twice; the same file sent again
        // after its deletion, under the same name and size, is.
        const commitK = () =>
            quiet(() =>
                commit.POST(
                    new NextRequest(`http://localhost/api/books/${pbook}/audio/commit`, {
                        method: 'POST',
                        body: JSON.stringify({ uploaded: [{ key: K, size: 300, durationSeconds: 999, ticket: kTicket }] }),
                    }),
                    { params: Promise.resolve({ id: String(pbook) }) },
                ),
            );
        const uploadsOfK = () =>
            prisma.audioTrackEvent.count({ where: { bookId: pbook, action: 'UPLOAD', filename: K.slice(pp.length) } });
        await commitK();
        const afterRetry = await uploadsOfK();
        await softDeleteTracks({ bookId: pbook, prefix: pp, tracks: [{ key: K, name: K.slice(pp.length), sizeBytes: 300 }], userId: me.id });
        F.objects.set(K, { size: 300, checksum: fresh.checksum });
        await commitK();
        check('commit relancé : pas de second UPLOAD ; renvoyé après suppression : journalisé', [afterRetry, await uploadsOfK()], [1, 2]);

        // --- slices under a deadline: recorded as they go, resumed cleanly --------
        console.log('\n  tranches sous délai');
        const lp = `zzz-test/${ts}-slices/`;
        const lbook = await newBook('tranches', lp);
        const names = Array.from({ length: 23 }, (_, i) => `1000 ${String(i + 1).padStart(2, '0')} Piste.mp3`);
        for (const n of names) F.objects.set(`${lp}${n}`, { size: 1000, checksum: null, lastModified: new Date(Date.now() - 86_400_000) });
        const listed = async () => (await bucket.listBookTracks(lp)).map((t: { key: string; name: string; sizeBytes: number }) => ({ key: t.key, name: t.name, sizeBytes: t.sizeBytes }));
        const corbeille = () => [...F.objects.keys()].filter((k) => k.startsWith(`corbeille/${lbook}/`)).length;
        const rows = () => prisma.deletedAudioTrack.count({ where: { bookId: lbook } });
        F.copyDelayMs = 300; // one slice (ten copies side by side) outlasts the 150 ms deadline below

        let step = await softDeleteTracks({ bookId: lbook, prefix: lp, tracks: await listed(), userId: me.id, deadline: Date.now() - 1 });
        check('délai déjà passé : rien commencé, tout « remaining »', [step.moved, step.remaining, corbeille(), await rows()], [0, 23, 0, 0]);
        step = await softDeleteTracks({ bookId: lbook, prefix: lp, tracks: await listed(), userId: me.id, deadline: Date.now() + 150 });
        check('délai court : une tranche de 10, enregistrée, le reste intact', [step.moved, step.remaining, corbeille(), await rows(), (await listed()).length], [10, 13, 10, 10, 13]);
        step = await softDeleteTracks({ bookId: lbook, prefix: lp, tracks: await listed(), userId: me.id });
        check('appel suivant : finit, sans recopier', [step.moved, step.remaining, corbeille(), await rows(), (await listed()).length], [13, 0, 23, 23, 0]);
        check(
            'journal : une entrée DELETE par piste',
            await prisma.audioTrackEvent.count({ where: { bookId: lbook, action: 'DELETE' } }),
            23,
        );

        const ids = (await prisma.deletedAudioTrack.findMany({ where: { bookId: lbook }, select: { id: true } })).map((x: { id: number }) => x.id);
        let back = await restoreTracksByIds({ trashIds: ids, userId: me.id, deadline: Date.now() + 150 });
        check('restauration sous délai : une tranche, le reste rendu', [back.restored, back.remainingIds.length, (await listed()).length], [10, 13, 10]);
        back = await restoreTracksByIds({ trashIds: back.remainingIds, userId: me.id });
        check('restauration, appel suivant : tout est revenu, corbeille vide', [back.restored, (await listed()).length, corbeille()], [13, 23, 0]);
        F.copyDelayMs = 0;

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
