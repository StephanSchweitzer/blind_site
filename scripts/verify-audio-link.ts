/**
 * Does Book.audio_filepath resolve to a real folder in the bucket?
 *
 *   pnpm tsx scripts/verify-audio-link.ts
 *   pnpm tsx scripts/verify-audio-link.ts --root=dirt/ --out=./audio-audit
 *
 * The link is a plain translation (see dbPathToPrefix): drop the `T:\` drive,
 * flip backslashes, prepend the bucket root. This script applies it to every
 * book and reports how many land on a folder that actually exists — plus, for
 * one book, the ordered track list, which is what playback needs.
 *
 * Read-only.
 */
import 'dotenv/config';
import { isAudioKey } from "../lib/audio/bucket-core";
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import {
    dbPathToPrefix,
    groupByFolder,
    orderSections,
    inspectFolder,
    parseFolder,
} from './audio-match-rules';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const BUCKET = process.env.S3_AUDIO_BUCKET!;
const ROOT = arg('root') ?? 'dirt/';
const OUT_DIR = path.resolve(arg('out') ?? './audio-audit');

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

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});

const csvCell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: (string | number)[][]) =>
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

async function main() {
    console.log(`Base ${describeDatabase(DB_URL)}`);
    console.log(`Bucket ${BUCKET} — racine "${ROOT}"\nListing…`);
    const objects: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({ Bucket: BUCKET, Prefix: ROOT, ContinuationToken: token }),
        );
        for (const o of res.Contents ?? []) {
            if (o.Key && !o.Key.endsWith('/')) objects.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
        process.stdout.write(`\r  ${objects.length} objets…`);
    } while (token);
    process.stdout.write('\n');

    // B2 writes a `.bzEmpty` placeholder into empty folders, and the NAS sync
    // carried over stray non-audio files. Neither is a track.
    const audio = objects.filter((o) => isAudioKey(o.key));
    const noise = objects.length - audio.length;
    const folders = groupByFolder(audio);
    // Folders including the non-audio ones, so we can tell "folder is not there"
    // apart from "folder is there but empty" — different problems, different fix.
    const allFolders = groupByFolder(objects);
    console.log(
        `${folders.size} dossiers, ${audio.length} fichiers audio` +
            (noise ? ` (+${noise} non-audio ignorés)` : '') +
            '\n',
    );

    const books = await prisma.book.findMany({
        where: { audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });

    let found = 0;
    const misses: (string | number)[][] = [];
    const hits: (string | number)[][] = [];

    for (const b of books) {
        const prefix = dbPathToPrefix(b.audio_filepath!, ROOT);
        const sections = folders.get(prefix);
        if (sections) {
            found++;
            const info = inspectFolder(sections);
            hits.push([
                b.id,
                b.title,
                prefix,
                info.count,
                (info.bytes / 1_048_576).toFixed(1),
                info.gaps.join(' '),
                info.duplicates.join(' '),
                info.unparsed.length,
            ]);
        } else {
            // FOLDER_EMPTY  → the upload created the folder but no audio landed.
            // FOLDER_MISSING → nothing at that prefix at all.
            const status = allFolders.has(prefix) ? 'FOLDER_EMPTY' : 'FOLDER_MISSING';
            misses.push([status, b.id, b.title, b.audio_filepath!, prefix]);
        }
    }

    const pct = ((found / (books.length || 1)) * 100).toFixed(2);
    console.log(`Livres avec audio_filepath : ${books.length}`);
    console.log(`  dossier trouvé           : ${found}  (${pct}%)`);
    const nEmpty = misses.filter((m) => m[0] === 'FOLDER_EMPTY').length;
    const nMissing = misses.filter((m) => m[0] === 'FOLDER_MISSING').length;
    console.log(`  dossier vide (0 audio)   : ${nEmpty}`);
    console.log(`  dossier absent           : ${nMissing}`);

    const claimed = new Set(
        books.map((b) => dbPathToPrefix(b.audio_filepath!, ROOT)).filter((p) => folders.has(p)),
    );
    console.log(`  dossiers sans livre      : ${folders.size - claimed.size}`);

    if (misses.length) {
        console.log('\nExemples introuvables :');
        for (const m of misses.slice(0, 5)) console.log(`  ${m[0]}  id=${m[1]}  ${JSON.stringify(m[4])}`);
    }

    // Track counts, not track numbering: filenames follow several conventions
    // across the corpus, so ordering relies on natural comparison of the whole
    // filename rather than on an extracted track number.
    const counts = [...folders.values()].map((s) => s.length).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)] ?? 0;
    console.log('\nPistes par dossier');
    console.log(`  médiane ${median} · min ${counts[0] ?? 0} · max ${counts[counts.length - 1] ?? 0}`);
    console.log(`  dossiers à une seule piste : ${counts.filter((c) => c === 1).length}`);

    await mkdir(OUT_DIR, { recursive: true });
    const okCsv = path.join(OUT_DIR, 'resolved.csv');
    const koCsv = path.join(OUT_DIR, 'unresolved.csv');
    await writeFile(
        okCsv,
        csv(['bookId', 'title', 'prefix', 'trackCount', 'sizeMB', 'gaps', 'duplicates', 'unparsed'], hits),
        'utf8',
    );
    await writeFile(
        koCsv,
        csv(['status', 'bookId', 'title', 'storedPath', 'computedPrefix'], misses),
        'utf8',
    );

    // Bucket-side orphans: audio nobody points at. This is the list an admin
    // "relink" screen would work through, so write it with enough to identify
    // each folder on sight.
    const orphanCsv = path.join(OUT_DIR, 'orphan-folders.csv');
    const orphanRows: (string | number)[][] = [];
    for (const [prefix, sections] of folders) {
        if (claimed.has(prefix)) continue;
        const info = inspectFolder(sections);
        const f = parseFolder(prefix);
        orphanRows.push([prefix, f.year ?? '', f.num ?? '', f.title, info.count, (info.bytes / 1_048_576).toFixed(1)]);
    }
    await writeFile(
        orphanCsv,
        csv(['prefix', 'year', 'folderNum', 'title', 'trackCount', 'sizeMB'], orphanRows),
        'utf8',
    );
    console.log(`  ${orphanCsv}`);
    console.log(`\n  ${okCsv}\n  ${koCsv}`);

    // What playback actually needs: the ordered keys for one book.
    const sample = books.find((b) => folders.has(dbPathToPrefix(b.audio_filepath!, ROOT)));
    if (sample) {
        const prefix = dbPathToPrefix(sample.audio_filepath!, ROOT);
        const ordered = orderSections(folders.get(prefix)!);
        console.log(`\nExemple — « ${sample.title} » (id ${sample.id})`);
        console.log(`  ${prefix}  → ${ordered.length} pistes`);
        for (const s of ordered.slice(0, 4)) {
            console.log(`   ${String(s.section ?? '?').padStart(3)}  ${s.key.split('/').pop()}`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
