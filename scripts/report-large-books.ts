/**
 * Books whose recording is split across an unusual number of files.
 *
 *   pnpm tsx scripts/report-large-books.ts
 *   pnpm tsx scripts/report-large-books.ts --min=200 --out=C:\chemin\gros-livres
 *
 * STRICTLY READ-ONLY — one bucket listing and one SELECT.
 *
 * Counts come from the bucket rather than Book.audioTrackCount, which is a cache
 * refreshed by scripts/sync-audio-links.ts and can lag. For a list someone will
 * act on, the folder itself is the authority.
 *
 * AppleDouble stubs are excluded (isAudioKey), which matters here more than
 * anywhere: they sat one per real track, so before they were filtered out every
 * affected book appeared to hold exactly twice as many files as it does.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isAudioKey } from '../lib/audio/bucket-core';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const MIN = Number(arg('min') ?? 100);
const OUT = arg('out') ?? 'livres-volumineux';
const ROOT = arg('root') ?? 'dirt/';

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

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const hm = (min: number | null) =>
    min == null ? '' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;

async function main() {
    console.log('LIVRES À FORT NOMBRE DE FICHIERS — lecture seule');
    console.log(`  base ${describeDatabase(DB_URL)}`);
    console.log(`  seuil : ${MIN} fichiers\n`);

    // One pass over the tree, grouped by folder. 11 500 individual listings
    // would be the same answer for a hundred times the requests.
    const counts = new Map<string, { tracks: number; bytes: number }>();
    let token: string | undefined;
    let seen = 0;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({ Bucket: process.env.S3_AUDIO_BUCKET!, Prefix: ROOT, ContinuationToken: token }),
        );
        for (const o of res.Contents ?? []) {
            seen++;
            if (!o.Key || !isAudioKey(o.Key)) continue;
            const folder = o.Key.slice(0, o.Key.lastIndexOf('/') + 1);
            const cur = counts.get(folder) ?? { tracks: 0, bytes: 0 };
            cur.tracks++;
            cur.bytes += o.Size ?? 0;
            counts.set(folder, cur);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
        process.stdout.write(`\r  ${seen} objets…`);
    } while (token);
    process.stdout.write('\n');

    const books = await prisma.book.findMany({
        where: { audio_filepath: { not: null } },
        select: {
            id: true,
            title: true,
            author: true,
            audio_filepath: true,
            readingDurationMinutes: true,
            audioTrackCount: true,
        },
    });

    const rows = books
        .map((b) => {
            const raw = b.audio_filepath!.trim();
            const prefix = raw.endsWith('/') ? raw : `${raw}/`;
            const hit = counts.get(prefix);
            return { ...b, prefix, tracks: hit?.tracks ?? 0, bytes: hit?.bytes ?? 0 };
        })
        .filter((r) => r.tracks >= MIN)
        .sort((a, b) => b.tracks - a.tracks);

    console.log(`  ${rows.length} livres à ${MIN} fichiers ou plus\n`);
    for (const r of rows.slice(0, 15)) {
        console.log(`  ${String(r.tracks).padStart(4)} fichiers  #${r.id} ${r.title.slice(0, 52)}`);
    }
    if (rows.length > 15) console.log(`  … et ${rows.length - 15} autres`);

    const csv = [
        [
            'Nombre de fichiers',
            'Livre',
            'Titre',
            'Auteur',
            'Durée',
            'Durée (minutes)',
            'Taille (Mio)',
            'Taille moyenne par fichier (Mio)',
            'Dossier',
        ]
            .map(csvCell)
            .join(';'),
        ...rows.map((r) =>
            [
                r.tracks,
                r.id,
                r.title,
                r.author,
                hm(r.readingDurationMinutes),
                r.readingDurationMinutes ?? '',
                (r.bytes / 1024 / 1024).toFixed(1),
                (r.bytes / r.tracks / 1024 / 1024).toFixed(2),
                r.prefix,
            ]
                .map(csvCell)
                .join(';'),
        ),
    ].join('\r\n');

    // BOM + semicolons: French Excel opens this directly, accents intact, and
    // the file-count column sorts numerically.
    writeFileSync(`${OUT}.csv`, `\uFEFF${csv}`, 'utf8');
    console.log(`\n  Écrit : ${OUT}.csv`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
