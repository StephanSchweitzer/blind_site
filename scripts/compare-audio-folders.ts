/**
 * Do two books' audio folders hold the same recording?
 *
 *   pnpm tsx scripts/compare-audio-folders.ts 3211 11363
 *
 * STRICTLY READ-ONLY — two bucket listings and two SELECTs.
 *
 * The question every duplicate-with-audio poses before anyone deletes anything:
 * are these two copies of one reading, or two different readings that happen to
 * share a title? Aggregate track count and total weight can coincide; matching
 * every track's SIZE, in order, effectively cannot. So this pairs the two
 * listings up and reports where they diverge.
 *
 * Filenames are compared too but are NOT the test — the portal renames tracks on
 * upload, so the same audio legitimately sits under different names on the two
 * sides. Sizes are what survive that.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const ids = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number);
if (ids.length !== 2 || ids.some((n) => !Number.isInteger(n))) {
    console.error('Usage : pnpm tsx scripts/compare-audio-folders.ts <idA> <idB>');
    process.exit(1);
}

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

const rawEndpoint = process.env.S3_ENDPOINT;
const endpoint = rawEndpoint
    ? /^https?:\/\//i.test(rawEndpoint)
        ? rawEndpoint
        : `https://${rawEndpoint}`
    : undefined;
const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: (process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)!,
        secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY)!,
    },
});

async function listFolder(prefix: string) {
    const out: { name: string; size: number }[] = [];
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
            if (o.Key && AUDIO_EXT.test(o.Key)) {
                out.push({ name: o.Key.slice(prefix.length), size: o.Size ?? 0 });
            }
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    // Natural order, so track 2 does not sort after track 10.
    return out.sort((a, b) =>
        a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }),
    );
}

async function main() {
    console.log('COMPARAISON DE DOSSIERS — lecture seule');
    console.log(`  base ${describeDatabase(DB_URL)}\n`);

    const books = await Promise.all(
        ids.map((id) =>
            prisma.book.findUnique({
                where: { id },
                select: { id: true, title: true, audio_filepath: true },
            }),
        ),
    );
    if (books.some((b) => !b)) {
        console.error('Livre introuvable');
        return;
    }

    const folders = await Promise.all(
        books.map((b) => {
            const p = b!.audio_filepath?.trim() ?? '';
            if (!p) return Promise.resolve([]);
            return listFolder(p.endsWith('/') ? p : `${p}/`);
        }),
    );

    books.forEach((b, i) => {
        const total = folders[i].reduce((s, t) => s + t.size, 0);
        console.log(`#${b!.id} « ${b!.title} »`);
        console.log(`  ${b!.audio_filepath}`);
        console.log(`  ${folders[i].length} pistes, ${(total / 1024 / 1024).toFixed(1)} Mio\n`);
    });

    const [A, B] = folders;
    if (A.length !== B.length) {
        console.log(`⚠ Nombre de pistes différent : ${A.length} contre ${B.length}`);
    }

    // Multiset of sizes: the strong test. Identical audio survives renaming and
    // reordering, so compare the sizes as a bag rather than position by position.
    const bag = new Map<number, number>();
    for (const t of A) bag.set(t.size, (bag.get(t.size) ?? 0) + 1);
    const onlyInB: typeof B = [];
    for (const t of B) {
        const n = bag.get(t.size) ?? 0;
        if (n > 0) bag.set(t.size, n - 1);
        else onlyInB.push(t);
    }
    const onlyInA = [...bag.entries()].filter(([, n]) => n > 0);

    const sizesMatch = onlyInA.length === 0 && onlyInB.length === 0;
    console.log(
        sizesMatch
            ? '✓ Tailles identiques, piste pour piste — même enregistrement.'
            : '✗ Les tailles diffèrent — ce ne sont PAS les mêmes fichiers.',
    );

    if (!sizesMatch) {
        if (onlyInA.length) {
            console.log(`\n  Présent seulement côté #${ids[0]} :`);
            for (const [size, n] of onlyInA.slice(0, 10)) {
                console.log(`    ${n} piste(s) de ${(size / 1024 / 1024).toFixed(2)} Mio`);
            }
        }
        if (onlyInB.length) {
            console.log(`\n  Présent seulement côté #${ids[1]} :`);
            for (const t of onlyInB.slice(0, 10)) {
                console.log(`    ${t.name} — ${(t.size / 1024 / 1024).toFixed(2)} Mio`);
            }
        }
    }

    // Side-by-side, for a human to sanity-check the pairing.
    console.log('\n  Appariement (ordre naturel)');
    for (let i = 0; i < Math.max(A.length, B.length) && i < 12; i++) {
        const a = A[i];
        const b = B[i];
        const same = a && b && a.size === b.size;
        console.log(
            `    ${same ? ' ' : '≠'} ${(a?.name ?? '—').slice(0, 38).padEnd(40)}` +
                `${a ? (a.size / 1024 / 1024).toFixed(2) : '—'} Mio   ` +
                `${(b?.name ?? '—').slice(0, 38).padEnd(40)}${b ? (b.size / 1024 / 1024).toFixed(2) : '—'} Mio`,
        );
    }
    if (Math.max(A.length, B.length) > 12) {
        console.log(`    … ${Math.max(A.length, B.length) - 12} autres`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
