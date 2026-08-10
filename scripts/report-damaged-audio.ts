/**
 * List the books whose recording contains files that cannot be read.
 *
 *   pnpm tsx scripts/report-damaged-audio.ts
 *   pnpm tsx scripts/report-damaged-audio.ts --out=C:\chemin\rapport
 *
 * STRICTLY READ-ONLY. Lists folders and re-reads a few kilobytes of the tracks
 * that failed; writes nothing to the database or the bucket.
 *
 * ## What it actually reports
 *
 * The duration backfill measures every track from its own header bytes. A track
 * it cannot read is not a measurement problem — it is a file whose first frames
 * are missing or corrupt, which is to say a recording an auditeur would find
 * broken. That makes this list worth more than the durations it came from.
 *
 * It is rebuilt from the current state rather than scraped from a backfill log,
 * so transient storage failures that have since been recovered do not appear:
 * a track is only listed if it is STILL unreadable when asked again here. The
 * reason given is the one observed on this run.
 *
 * Books are ranked by the share of the recording affected, because one bad track
 * in seventy-six is a file to replace and half the folder unreadable is a
 * recording to re-make.
 */
import 'dotenv/config';
import { isAudioKey } from "../lib/audio/bucket-core";
import { writeFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { measureTrackBytes, pool } from '../lib/audio/measure-core';
import { scriptDatabaseUrl, describeDatabase } from './db-url';


const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const OUT = arg('out') ?? 'rapport-audio-endommage';
const CONCURRENCY = 8;

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

const readRange = async (key: string, start: number, end: number): Promise<Uint8Array> => {
    const res = await s3.send(
        new GetObjectCommand({
            Bucket: process.env.S3_AUDIO_BUCKET!,
            Key: key,
            Range: `bytes=${start}-${end}`,
        }),
    );
    return res.Body!.transformToByteArray();
};

async function listTracks(prefix: string) {
    const out: { key: string; name: string; sizeBytes: number }[] = [];
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
            if (o.Key && isAudioKey(o.Key)) {
                out.push({ key: o.Key, name: o.Key.slice(prefix.length), sizeBytes: o.Size ?? 0 });
            }
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
}

interface Row {
    id: number;
    title: string;
    author: string;
    prefix: string;
    total: number;
    broken: { name: string; reason: string; mib: number }[];
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/**
 * Not every unmeasurable file is a broken one, and the difference decides
 * whether anybody needs to act.
 *
 * A variable-bitrate MP3 with no Xing counter plays perfectly — it simply does
 * not state its own length, and we refuse to guess it (measured across the
 * corpus, guessing is out by up to ten minutes). Reporting those to the
 * permanents as damaged recordings would send them looking for a fault that
 * does not exist.
 */
const isDamaged = (reason: string) => !reason.includes('débit variable');

async function main() {
    console.log('RAPPORT — fichiers audio illisibles (lecture seule)');
    console.log(`  base ${describeDatabase(DB_URL)}\n`);

    const books = await prisma.book.findMany({
        where: {
            audioLinkStatus: 'OK',
            audio_filepath: { not: null },
            OR: [{ readingDurationMinutes: null }, { readingDurationMinutes: 0 }],
        },
        select: { id: true, title: true, author: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });
    console.log(`  ${books.length} livres avec audio mais sans durée — vérification…\n`);

    const rows: Row[] = [];
    let done = 0;

    for (const book of books) {
        const raw = book.audio_filepath!.trim();
        const prefix = raw.endsWith('/') ? raw : `${raw}/`;
        const tracks = await listTracks(prefix);

        // Anything already measured is fine by definition; only the rest is
        // asked again. That is what keeps this cheap on a 300-track folder.
        const cached = await prisma.audioTrackDuration.findMany({
            where: { bookId: book.id, filename: { in: tracks.map((t) => t.name) } },
            select: { filename: true, sizeBytes: true },
        });
        const ok = new Map(cached.map((c) => [c.filename, Number(c.sizeBytes)]));
        const suspect = tracks.filter((t) => ok.get(t.name) !== t.sizeBytes);

        const results = await pool(suspect, CONCURRENCY, (t) => measureTrackBytes(readRange, t));
        const broken = results
            .map((r, i) => ({
                name: r.filename,
                reason: r.problem ?? '',
                mib: suspect[i].sizeBytes / 1024 / 1024,
                ok: r.seconds !== null,
            }))
            .filter((r) => !r.ok)
            .map(({ name, reason, mib }) => ({ name, reason, mib }));

        if (broken.length) {
            rows.push({
                id: book.id,
                title: book.title,
                author: book.author,
                prefix,
                total: tracks.length,
                broken,
            });
        }

        if (++done % 25 === 0) console.log(`  ${done}/${books.length}…`);
    }

    // Worst proportion first: half a folder unreadable is a different problem
    // from one file in seventy-six.
    rows.sort((a, b) => b.broken.length / b.total - a.broken.length / a.total);

    const totalBroken = rows.reduce((s, r) => s + r.broken.length, 0);
    console.log(`\n  ${rows.length} livres concernés, ${totalBroken} fichiers illisibles`);

    // --- CSV, semicolon-separated and BOM-prefixed so Excel FR opens it right.
    const csv = [
        ['Catégorie', 'Livre', 'Titre', 'Auteur', 'Pistes totales', 'Fichiers concernés', 'Part', 'Noms de fichiers', 'Motif', 'Dossier']
            .map(csvCell)
            .join(';'),
        ...rows.flatMap((r) =>
            // One row per category, so a filter on the first column separates
            // "à vérifier" from "rien à faire" without reading the motif column.
            (['endommagé', 'non mesurable'] as const)
                .map((cat) => ({
                    cat,
                    items: r.broken.filter((b) =>
                        cat === 'endommagé' ? isDamaged(b.reason) : !isDamaged(b.reason),
                    ),
                }))
                .filter((g) => g.items.length)
                .map((g) =>
                    [
                        g.cat,
                        r.id,
                        r.title,
                        r.author,
                        r.total,
                        g.items.length,
                        `${Math.round((g.items.length / r.total) * 100)} %`,
                        g.items.map((b) => b.name).join(' | '),
                        [...new Set(g.items.map((b) => b.reason))].join(' | '),
                        r.prefix,
                    ]
                        .map(csvCell)
                        .join(';'),
                ),
        ),
    ].join('\r\n');
    writeFileSync(`${OUT}.csv`, `\uFEFF${csv}`, 'utf8');

    // --- Readable companion, for whoever reads rather than filters.
    const damagedRows = rows
        .map((r) => ({ ...r, broken: r.broken.filter((b) => isDamaged(b.reason)) }))
        .filter((r) => r.broken.length);
    const unmeasurableRows = rows
        .map((r) => ({ ...r, broken: r.broken.filter((b) => !isDamaged(b.reason)) }))
        .filter((r) => r.broken.length);
    const damagedCount = damagedRows.reduce((s, r) => s + r.broken.length, 0);
    const unmeasurableCount = unmeasurableRows.reduce((s, r) => s + r.broken.length, 0);

    const md: string[] = [
        '# Fichiers audio à vérifier',
        '',
        `Relevé du ${new Date().toLocaleDateString('fr-FR')} sur l’ensemble du catalogue`,
        `(${rows.length} livres concernés sur plus de 11 500 livres avec audio).`,
        '',
        '## 1. Fichiers vraisemblablement endommagés — à vérifier',
        '',
        `**${damagedRows.length} livres**, **${damagedCount} fichiers**.`,
        '',
        'Le serveur ne parvient pas à lire le début de ces fichiers : les premières',
        'trames sont absentes ou corrompues. Ce sont des enregistrements qu’un auditeur',
        'risque de trouver défectueux — le problème existe indépendamment du calcul',
        'des durées, qui n’a fait que le révéler.',
        '',
        'Les livres sont classés du plus atteint au moins atteint : la moitié d’un',
        'dossier illisible ne se traite pas comme un fichier isolé.',
        '',
        '| Livre | Titre | Auteur | Fichiers | Part |',
        '|---|---|---|---|---|',
        ...damagedRows.map(
            (r) =>
                `| #${r.id} | ${r.title} | ${r.author} | ${r.broken.length}/${r.total} | ${Math.round((r.broken.length / r.total) * 100)} % |`,
        ),
        '',
        '### Détail',
        '',
    ];
    for (const r of damagedRows) {
        md.push(`**#${r.id} — ${r.title}** (*${r.author}*) — \`${r.prefix}\``);
        md.push('');
        for (const b of r.broken) md.push(`- \`${b.name}\` — ${b.mib.toFixed(1)} Mio`);
        md.push('');
    }

    md.push(
        '## 2. Fichiers lisibles, mais dont la durée ne peut pas être calculée',
        '',
        `**${unmeasurableRows.length} livres**, **${unmeasurableCount} fichiers**.`,
        '',
        '**Aucune action n’est nécessaire.** Ces enregistrements se lisent normalement.',
        'Ils sont simplement encodés à débit variable sans indication de durée : le',
        'fichier ne dit pas combien de temps il dure, et le portail refuse de l’estimer',
        'plutôt que d’afficher une durée fausse (l’estimation peut se tromper de dix',
        'minutes). Ces livres afficheront « Non calculée ».',
        '',
        '| Livre | Titre | Fichiers |',
        '|---|---|---|',
        ...unmeasurableRows.map((r) => `| #${r.id} | ${r.title} | ${r.broken.length}/${r.total} |`),
        '',
    );
    writeFileSync(`${OUT}.md`, md.join('\n'), 'utf8');

    console.log(`\n  Écrit : ${OUT}.csv`);
    console.log(`         ${OUT}.md`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
