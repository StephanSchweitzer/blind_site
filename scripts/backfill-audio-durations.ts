/**
 * Measure the reading duration of every book that has audio but no duration.
 *
 *   pnpm tsx scripts/backfill-audio-durations.ts --dry-run     # measure, write nothing
 *   pnpm tsx scripts/backfill-audio-durations.ts --limit=50    # a first real slice
 *   pnpm tsx scripts/backfill-audio-durations.ts               # the whole catalogue
 *   pnpm tsx scripts/backfill-audio-durations.ts --all         # re-measure books that already have one
 *
 * Book.readingDurationMinutes could only ever be filled from an UPLOAD event
 * carrying a length the browser read at upload time, so ~10 200 books with audio
 * have never had one and never could. This reads it out of the files.
 *
 * WHAT IT WRITES
 *   AudioTrackDuration       one row per track measured (the cache)
 *   Book.readingDurationMinutes  only when EVERY track of that book resolved
 *
 * Nothing in the bucket is touched — every request is a ranged GET of at most
 * 64 Kio. No other Book column is written: notably not audioLinkStatus,
 * audioTrackCount or audioSizeKb, so this cannot disturb the tarif.
 *
 * SAFE TO INTERRUPT AND RE-RUN. Work is committed per book, and a track already
 * in the cache at the same weight is never re-read, so a second run resumes
 * rather than restarts.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { measureTrackBytes, pool, type TrackMeasure } from '../lib/audio/measure-core';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const num = (n: string, d: number) => {
    const v = arg(n);
    const p = v === undefined ? NaN : Number(v);
    return Number.isFinite(p) ? p : d;
};

const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const LIMIT = num('limit', Infinity);
const FROM_ID = num('from-id', 0);
/** Tracks measured in parallel within one book. */
const CONCURRENCY = num('concurrency', 8);
/**
 * Books measured in parallel.
 *
 * Not a micro-optimisation: with books strictly sequential, every folder pays
 * its bucket listing and its cache SELECT with nothing else in flight, and the
 * whole catalogue extrapolated to about twelve hours. Overlapping books hides
 * that latency behind other books' transfers. The product with CONCURRENCY is
 * what actually hits B2 at once, so keep it moderate.
 */
const BOOK_CONCURRENCY = num('book-concurrency', 4);
/** Folders bigger than this are skipped and listed — same ceiling as the button. */
const MAX_TRACKS = num('max-tracks', 200);

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

/** The range reader measure-core needs — the script's own, not the server-only one. */
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
            if (o.Key && AUDIO_EXT.test(o.Key)) {
                out.push({ key: o.Key, name: o.Key.slice(prefix.length), sizeBytes: o.Size ?? 0 });
            }
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
}

const hm = (seconds: number) => {
    const m = Math.round(seconds / 60);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

interface Tally {
    books: number;
    written: number;
    partial: number;
    empty: number;
    tooBig: number;
    tracksMeasured: number;
    tracksCached: number;
    tracksFailed: number;
    problems: Record<string, number>;
}

async function backfillBook(
    book: { id: number; title: string; audio_filepath: string | null },
    tally: Tally,
): Promise<string | null> {
    const raw = book.audio_filepath?.trim() ?? '';
    if (!raw) return null;
    const prefix = raw.endsWith('/') ? raw : `${raw}/`;

    const tracks = await listTracks(prefix);
    if (!tracks.length) {
        tally.empty++;
        return null;
    }
    if (tracks.length > MAX_TRACKS) {
        tally.tooBig++;
        return `#${book.id} ${book.title.slice(0, 40)} — ${tracks.length} pistes, ignoré`;
    }

    const cachedRows = await prisma.audioTrackDuration.findMany({
        where: { bookId: book.id, filename: { in: tracks.map((t) => t.name) } },
        select: { filename: true, sizeBytes: true, seconds: true, method: true, exact: true },
    });
    const cache = new Map(cachedRows.map((r) => [r.filename, r]));

    const results = await pool(tracks, CONCURRENCY, async (t) => {
        const hit = cache.get(t.name);
        if (hit && Number(hit.sizeBytes) === t.sizeBytes) {
            return {
                filename: t.name,
                sizeBytes: t.sizeBytes,
                seconds: hit.seconds,
                method: hit.method,
                exact: hit.exact,
                problem: null,
                cached: true,
            } satisfies TrackMeasure;
        }
        return measureTrackBytes(readRange, t);
    });

    const measured = results.filter((r) => r.seconds !== null);
    tally.tracksMeasured += measured.length;
    tally.tracksCached += results.filter((r) => r.cached).length;
    tally.tracksFailed += results.length - measured.length;
    for (const r of results) {
        if (r.problem) tally.problems[r.problem] = (tally.problems[r.problem] ?? 0) + 1;
    }

    const complete = measured.length === results.length;
    if (!complete) tally.partial++;

    if (DRY_RUN) {
        return complete
            ? null
            : `#${book.id} ${book.title.slice(0, 40)} — ${results.length - measured.length}/${results.length} illisibles`;
    }

    const fresh = results.filter((r) => !r.cached && r.seconds !== null);
    if (fresh.length) {
        await prisma.$transaction([
            prisma.audioTrackDuration.deleteMany({
                where: { bookId: book.id, filename: { in: fresh.map((r) => r.filename) } },
            }),
            prisma.audioTrackDuration.createMany({
                data: fresh.map((r) => ({
                    bookId: book.id,
                    filename: r.filename,
                    sizeBytes: BigInt(r.sizeBytes),
                    seconds: r.seconds!,
                    method: r.method ?? 'INCONNU',
                    exact: r.exact,
                })),
            }),
        ]);
    }

    // All-or-nothing, exactly as refreshBookAudioState applies it: a partial sum
    // understates the recording, and this figure reaches the public catalogue
    // and the Coup de cœur PDF. An incomplete book keeps « Non calculée » and
    // its measured tracks stay cached for a later retry.
    if (complete) {
        const total = measured.reduce((s, r) => s + r.seconds!, 0);
        await prisma.book.update({
            where: { id: book.id },
            data: { readingDurationMinutes: Math.round(total / 60) },
        });
        tally.written++;
        return null;
    }

    return `#${book.id} ${book.title.slice(0, 40)} — ${results.length - measured.length}/${results.length} illisibles`;
}

async function main() {
    console.log('BACKFILL DES DURÉES');
    console.log(`  base   ${describeDatabase(DB_URL)}`);
    console.log(`  bucket ${process.env.S3_AUDIO_BUCKET}`);
    if (DRY_RUN) console.log('  DRY RUN — rien ne sera écrit');
    if (ALL) console.log('  --all : les livres ayant déjà une durée sont re-mesurés');

    const books = await prisma.book.findMany({
        where: {
            audioLinkStatus: 'OK',
            audio_filepath: { not: null },
            id: { gte: FROM_ID },
            ...(ALL ? {} : { OR: [{ readingDurationMinutes: null }, { readingDurationMinutes: 0 }] }),
        },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
        ...(Number.isFinite(LIMIT) ? { take: LIMIT } : {}),
    });

    console.log(`\n  ${books.length} livres à traiter\n`);

    const tally: Tally = {
        books: 0,
        written: 0,
        partial: 0,
        empty: 0,
        tooBig: 0,
        tracksMeasured: 0,
        tracksCached: 0,
        tracksFailed: 0,
        problems: {},
    };
    const notes: string[] = [];
    const started = Date.now();

    await pool(books, BOOK_CONCURRENCY, async (book) => {
        tally.books++;
        try {
            const note = await backfillBook(book, tally);
            if (note) notes.push(note);
        } catch (e) {
            notes.push(`#${book.id} ${book.title.slice(0, 40)} — ERREUR : ${e instanceof Error ? e.message : e}`);
        }

        if (tally.books % 25 === 0 || tally.books === books.length) {
            const elapsed = (Date.now() - started) / 1000;
            const rate = tally.books / Math.max(elapsed, 0.001);
            const left = (books.length - tally.books) / Math.max(rate, 0.001);
            // Newline rather than \r: this run is long enough to be worth a log
            // someone can scroll back through, and a carriage return leaves
            // nothing behind in a redirected file.
            console.log(
                `  ${tally.books}/${books.length} livres — ${tally.written} durées — ` +
                    `${tally.tracksMeasured} pistes — reste ~${Math.round(left / 60)} min`,
            );
        }
    });

    const elapsed = (Date.now() - started) / 1000;
    console.log(`\nTerminé en ${Math.round(elapsed / 60)} min`);
    console.log(`  Livres traités              ${tally.books}`);
    console.log(`  Durées écrites              ${tally.written}`);
    console.log(`  Incomplets (durée refusée)  ${tally.partial}`);
    console.log(`  Dossiers vides              ${tally.empty}`);
    console.log(`  Dossiers trop volumineux    ${tally.tooBig}`);
    console.log(`  Pistes mesurées             ${tally.tracksMeasured} (dont ${tally.tracksCached} déjà en cache)`);
    console.log(`  Pistes illisibles           ${tally.tracksFailed}`);

    if (Object.keys(tally.problems).length) {
        console.log('\n  Causes d’échec');
        for (const [k, v] of Object.entries(tally.problems).sort((a, b) => b[1] - a[1])) {
            console.log(`    ${k.padEnd(50)} ${v}`);
        }
    }
    if (notes.length) {
        console.log(`\n  Livres à regarder (${notes.length})`);
        notes.slice(0, 40).forEach((n) => console.log(`    ${n}`));
        if (notes.length > 40) console.log(`    … et ${notes.length - 40} autres`);
    }

    if (!DRY_RUN) {
        const covered = await prisma.book.count({
            where: { readingDurationMinutes: { not: null, gt: 0 } },
        });
        console.log(`\n  Livres avec une durée, au total : ${covered}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
