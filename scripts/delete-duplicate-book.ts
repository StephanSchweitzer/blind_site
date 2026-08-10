/**
 * Delete a book record that duplicates another, once the bucket proves it.
 *
 *   pnpm tsx scripts/delete-duplicate-book.ts --duplicate=3211 --twin=11363
 *   pnpm tsx scripts/delete-duplicate-book.ts --duplicate=3211 --twin=11363 --confirm
 *
 * Without --confirm nothing is written: it checks and reports only.
 *
 * ## Why a script rather than the back office
 *
 * The DELETE route soft-deletes every track to the corbeille one at a time
 * (app/api/books/[id]/route.ts). For a 77-track, 748 Mio folder that is 77
 * server-side copies inside a single serverless request — it does not finish,
 * and if it did it would duplicate the recording a THIRD time to protect a copy
 * that is already redundant.
 *
 * So this clears audio_filepath first: the route's track loop has nothing to
 * walk, the row goes, and the folder is simply left in the bucket. It then shows
 * up in /admin/audio-orphelins, the screen that already exists for deciding what
 * to do with a folder no book claims. Nothing here touches the bucket.
 *
 * ## What it refuses to do
 *
 * - delete a record carrying demandes or attributions (it is the one with the
 *   history, so it is never the copy to throw away)
 * - delete anything whose twin does not hold a byte-for-byte identical folder,
 *   compared track size by track size. Two readings of one title are not
 *   duplicates, and aggregate counts can coincide where a size multiset cannot.
 *
 * The full row is written to disk before the delete, so the record can be
 * recreated if the call was wrong. AudioTrackEvent rows survive on their own —
 * bookId is nullable with SetNull precisely so the upload log outlives the book.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const DUPLICATE = Number(arg('duplicate'));
const TWIN = Number(arg('twin'));
const CONFIRM = args.includes('--confirm');

if (!Number.isInteger(DUPLICATE) || !Number.isInteger(TWIN)) {
    console.error('Usage : --duplicate=<id> --twin=<id> [--confirm]');
    process.exit(1);
}

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

const rawEndpoint = process.env.S3_ENDPOINT;
const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: rawEndpoint
        ? /^https?:\/\//i.test(rawEndpoint)
            ? rawEndpoint
            : `https://${rawEndpoint}`
        : undefined,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: (process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)!,
        secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY)!,
    },
});

async function listSizes(path: string | null): Promise<number[]> {
    const raw = path?.trim();
    if (!raw) return [];
    const prefix = raw.endsWith('/') ? raw : `${raw}/`;
    const out: number[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: process.env.S3_AUDIO_BUCKET!,
                Prefix: prefix,
                ContinuationToken: token,
            }),
        );
        for (const o of res.Contents ?? []) {
            if (o.Key && AUDIO_EXT.test(o.Key)) out.push(o.Size ?? 0);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out.sort((a, b) => a - b);
}

const refuse = (why: string): never => {
    console.error(`\n✗ REFUS : ${why}`);
    console.error('  Rien n’a été modifié.');
    process.exit(1);
};

async function main() {
    console.log('SUPPRESSION D’UN DOUBLON');
    console.log(`  base ${describeDatabase(DB_URL)}`);
    console.log(`  doublon #${DUPLICATE}, jumeau conservé #${TWIN}\n`);

    const [dup, twin] = await Promise.all([
        prisma.book.findUnique({ where: { id: DUPLICATE } }),
        prisma.book.findUnique({ where: { id: TWIN } }),
    ]);
    if (!dup) refuse(`le livre #${DUPLICATE} n’existe pas`);
    if (!twin) refuse(`le jumeau #${TWIN} n’existe pas`);

    console.log(`  #${dup!.id} « ${dup!.title} »  ${dup!.audio_filepath ?? '(sans dossier)'}`);
    console.log(`  #${twin!.id} « ${twin!.title} »  ${twin!.audio_filepath ?? '(sans dossier)'}\n`);

    const [orders, assignments, coups] = await Promise.all([
        prisma.orders.count({ where: { catalogueId: DUPLICATE } }),
        prisma.assignment.count({ where: { catalogueId: DUPLICATE } }),
        prisma.coupsDeCoeurBooks.count({ where: { bookId: DUPLICATE } }),
    ]);
    console.log(`  Références du doublon : ${orders} demande(s), ${assignments} attribution(s), ${coups} coup(s) de cœur`);
    if (orders || assignments) {
        refuse('le doublon porte des demandes ou des attributions — c’est la fiche à garder');
    }
    if (coups) refuse('le doublon figure dans une liste de coups de cœur');

    const [dupSizes, twinSizes] = await Promise.all([
        listSizes(dup!.audio_filepath),
        listSizes(twin!.audio_filepath),
    ]);
    const mib = (n: number[]) => (n.reduce((s, v) => s + v, 0) / 1024 / 1024).toFixed(1);
    console.log(`  Dossier du doublon    : ${dupSizes.length} pistes, ${mib(dupSizes)} Mio`);
    console.log(`  Dossier du jumeau     : ${twinSizes.length} pistes, ${mib(twinSizes)} Mio`);

    if (!twinSizes.length) refuse('le jumeau ne contient aucun fichier audio');
    const identical =
        dupSizes.length === twinSizes.length && dupSizes.every((s, i) => s === twinSizes[i]);
    if (!identical) {
        refuse(
            'les deux dossiers ne contiennent PAS les mêmes fichiers — ce sont deux ' +
                'enregistrements distincts, pas un doublon',
        );
    }
    console.log('\n  ✓ Dossiers identiques piste pour piste — même enregistrement.');

    if (!CONFIRM) {
        console.log('\n  Simulation (--confirm absent). Serait exécuté :');
        console.log(`    1. sauvegarde de la fiche #${DUPLICATE} sur disque`);
        console.log(`    2. audio_filepath vidé (pour qu’aucune copie en corbeille ne soit faite)`);
        console.log(`    3. suppression de la fiche #${DUPLICATE}`);
        console.log(`    → le dossier ${dup!.audio_filepath} restera dans le bucket`);
        console.log('      et apparaîtra dans /admin/audio-orphelins.');
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `deleted-book-${DUPLICATE}-${stamp}.json`;
    writeFileSync(
        file,
        JSON.stringify(dup, (_k, v) => (typeof v === 'bigint' ? String(v) : v), 2),
    );
    console.log(`\n  Sauvegarde écrite : ${file}`);

    // Cleared first and in its own statement: the value is in the snapshot, and
    // this is what stops any later delete path from walking the folder.
    await prisma.book.update({ where: { id: DUPLICATE }, data: { audio_filepath: null } });
    await prisma.book.delete({ where: { id: DUPLICATE } });

    console.log(`  ✓ Fiche #${DUPLICATE} supprimée.`);
    console.log(`  Le dossier reste dans le bucket et sera listé comme orphelin`);
    console.log(`  au prochain passage de scripts/sync-audio-links.ts.`);

    const events = await prisma.audioTrackEvent.count({ where: { bookId: null } });
    console.log(`  (journal d’upload conservé : ${events} évènement(s) désormais sans livre)`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
