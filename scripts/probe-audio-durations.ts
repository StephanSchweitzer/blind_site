/**
 * Can we measure a recording's length from the bucket, without downloading it?
 *
 *   pnpm tsx scripts/probe-audio-durations.ts                    # census + sample of undated books
 *   pnpm tsx scripts/probe-audio-durations.ts --audit-estimate   # how wrong is the CBR estimate
 *   pnpm tsx scripts/probe-audio-durations.ts --validate         # vs browser-measured durations
 *   pnpm tsx scripts/probe-audio-durations.ts --book=1234
 *   pnpm tsx scripts/probe-audio-durations.ts --title=lumière
 *   pnpm tsx scripts/probe-audio-durations.ts --sample=25 --no-census
 *
 * STRICTLY READ-ONLY. No writes to the database, nothing created, renamed or
 * deleted in the bucket. It issues ListObjectsV2 and ranged GETs and prints a
 * report — nothing else. Safe to point at production, which is the point: the
 * question it answers is about the real corpus, and only production has one.
 *
 * ## What it is for
 *
 * Book.readingDurationMinutes is currently only ever filled from an UPLOAD event
 * carrying a duration the browser read at upload time (lib/audio/state.ts). Every
 * book whose audio predates that — i.e. the whole imported catalogue — can never
 * show a duration, no matter how often the state is refreshed. The fix is to
 * measure the files server-side from their headers. This script establishes
 * whether that actually works on THIS corpus before any of it is built:
 *
 *   1. census          — which formats are in the bucket at all
 *   2. sample          — how many tracks of undated books we can measure, and how
 *   3. --audit-estimate— how wrong the one inexact method gets, measured against
 *                        the encoder's own frame count on files that carry it
 *   4. --validate      — how far our answer is from the browser's on books where
 *                        both are known. Needs a database that has seen portal
 *                        uploads, i.e. production; the local copy has none.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    probeAudioDuration,
    summariseMpeg,
    mayNeedTail,
    type ProbeMethod,
    type ProbeFailureReason,
} from '../lib/audio/duration-probe';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const num = (n: string, d: number) => {
    const v = arg(n);
    const p = v === undefined ? NaN : Number(v);
    return Number.isFinite(p) ? p : d;
};

const CENSUS = !args.includes('--no-census');
const VALIDATE = args.includes('--validate');
const AUDIT = args.includes('--audit-estimate');
const SHORTCUT = args.includes('--audit-folder');
const SAMPLE = num('sample', 12);
const MAX_TRACKS = num('max-tracks', 40);
const HEAD_BYTES = num('head-kb', 64) * 1024;
const TAIL_BYTES = num('tail-kb', 256) * 1024;
const ROOT = arg('root') ?? 'dirt/';
const ONLY_BOOK = arg('book') ? Number(arg('book')) : undefined;
const TITLE = arg('title');
/** Parallel ranged GETs. Bounded so a big folder can't open 40 sockets at B2. */
const CONCURRENCY = num('concurrency', 6);

const BUCKET = process.env.S3_AUDIO_BUCKET!;

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
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

// --- formatting ------------------------------------------------------------

const hm = (seconds: number) => {
    const m = Math.round(seconds / 60);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)} %` : '—');
const bar = (label: string) => `\n${label}\n${'─'.repeat(label.length)}`;

function tally<T extends string>(counts: Record<string, number>, key: T) {
    counts[key] = (counts[key] ?? 0) + 1;
}

function printTally(counts: Record<string, number>, indent = '  ') {
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
        console.log(`${indent}(aucun)`);
        return;
    }
    const w = Math.max(...rows.map(([k]) => k.length));
    for (const [k, v] of rows) console.log(`${indent}${k.padEnd(w)}  ${v}`);
}

/** Run `worker` over `items` with a bounded number in flight. */
async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await worker(items[i]);
            }
        }),
    );
    return out;
}

// --- bucket ----------------------------------------------------------------

async function listPrefix(prefix: string): Promise<{ key: string; size: number }[]> {
    const out: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
        );
        for (const o of res.Contents ?? []) {
            if (o.Key && !o.Key.endsWith('/')) out.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
}

async function getRange(key: string, start: number, end: number): Promise<Uint8Array> {
    const res = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: `bytes=${start}-${end}` }),
    );
    return res.Body!.transformToByteArray();
}

// --- one track -------------------------------------------------------------

interface TrackProbe {
    name: string;
    sizeBytes: number;
    seconds: number | null;
    method: ProbeMethod | null;
    exact: boolean;
    /** Failure reason, or the transport error that stopped us reaching the bytes. */
    problem: ProbeFailureReason | 'FETCH_ERROR' | null;
    detail?: string;
    /** Ranged GETs this track cost — what the future route will pay per track. */
    requests: number;
}

async function probeTrack(track: { key: string; size: number }): Promise<TrackProbe> {
    const name = track.key.split('/').pop()!;
    const base: TrackProbe = {
        name,
        sizeBytes: track.size,
        seconds: null,
        method: null,
        exact: false,
        problem: null,
        requests: 0,
    };

    try {
        const head = await getRange(track.key, 0, Math.min(HEAD_BYTES, track.size) - 1);
        base.requests = 1;
        let result = probeAudioDuration(name, head, track.size);

        // Only MP4-family files ever need this: a non-faststart file keeps `moov`
        // at the end, so the head alone genuinely cannot answer.
        if (!result.ok && result.reason === 'NEED_MORE_BYTES' && mayNeedTail(name)) {
            const start = Math.max(0, track.size - TAIL_BYTES);
            const tail = await getRange(track.key, start, track.size - 1);
            base.requests = 2;
            result = probeAudioDuration(name, head, track.size, tail);
        }

        if (result.ok) {
            return { ...base, seconds: result.seconds, method: result.method, exact: result.exact };
        }
        return { ...base, problem: result.reason, detail: result.detail };
    } catch (e) {
        return {
            ...base,
            problem: 'FETCH_ERROR',
            detail: e instanceof Error ? e.message : String(e),
        };
    }
}

// --- one book --------------------------------------------------------------

interface BookProbe {
    id: number;
    title: string;
    prefix: string;
    tracks: TrackProbe[];
    /** Tracks in the folder beyond --max-tracks, not probed. */
    skipped: number;
    /** Wall clock for the whole folder, listing included — what a click would cost. */
    elapsedMs: number;
    /** Bytes pulled out of the bucket to answer. */
    bytesRead: number;
}

async function probeBook(book: { id: number; title: string; audio_filepath: string | null }) {
    const started = Date.now();
    const raw = book.audio_filepath?.trim() ?? '';
    const prefix = raw.endsWith('/') ? raw : `${raw}/`;
    const objects = await listPrefix(prefix);
    const audio = objects
        .filter((o) => AUDIO_EXT.test(o.key))
        .sort((a, b) => a.key.localeCompare(b.key, 'fr'));

    const take = audio.slice(0, MAX_TRACKS);
    const tracks = await pool(take, probeTrack);

    return {
        id: book.id,
        title: book.title,
        prefix,
        tracks,
        skipped: audio.length - take.length,
        elapsedMs: Date.now() - started,
        bytesRead: take.reduce((s, t) => s + Math.min(HEAD_BYTES, t.size), 0),
    } satisfies BookProbe;
}

function reportBook(b: BookProbe) {
    const measured = b.tracks.filter((t) => t.seconds !== null);
    const total = measured.reduce((s, t) => s + t.seconds!, 0);
    const methods: Record<string, number> = {};
    for (const t of measured) tally(methods, t.method!);

    const head = `#${b.id} ${b.title}`.slice(0, 64);
    console.log(`\n${head}`);
    console.log(`  dossier   ${b.prefix}`);
    console.log(
        `  pistes    ${measured.length}/${b.tracks.length} mesurées` +
            (b.skipped ? ` (+${b.skipped} non sondées, --max-tracks)` : ''),
    );
    if (measured.length) {
        const detail = Object.entries(methods)
            .map(([m, n]) => `${m}×${n}`)
            .join(', ');
        const estimated = measured.filter((t) => !t.exact).length;
        console.log(
            `  durée     ${hm(total)}` +
                (measured.length === b.tracks.length ? '' : ' (partielle)') +
                `   [${detail}]` +
                (estimated ? `  dont ${estimated} estimée(s)` : ''),
        );
    }
    console.log(
        `  coût      ${(b.elapsedMs / 1000).toFixed(2)} s, ` +
            `${b.tracks.length + 1} requêtes, ` +
            `${(b.bytesRead / 1024 / 1024).toFixed(2)} Mio lus`,
    );
    for (const t of b.tracks.filter((t) => t.seconds === null)) {
        console.log(`  ✗ ${t.name} — ${t.problem}${t.detail ? ` : ${t.detail}` : ''}`);
    }
}

// --- census ----------------------------------------------------------------

async function census() {
    console.log(bar('1. Recensement du bucket'));
    process.stdout.write('  listing…');
    const objects = await listPrefix(ROOT);
    process.stdout.write(`\r  ${objects.length} objets sous "${ROOT}"\n`);

    const byExt: Record<string, number> = {};
    const bytesByExt: Record<string, number> = {};
    let audioCount = 0;
    for (const o of objects) {
        const ext = o.key.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '(sans extension)';
        tally(byExt, ext);
        bytesByExt[ext] = (bytesByExt[ext] ?? 0) + o.size;
        if (AUDIO_EXT.test(o.key)) audioCount++;
    }
    console.log(`  ${audioCount} pistes audio\n`);
    console.log('  Extensions');
    printTally(byExt, '    ');

    // Formats the parser implements. Anything outside this is a format we would
    // have to add before the button could claim to cover the catalogue.
    const supported = new Set(['mp3', 'm4a', 'm4b', 'mp4', 'wav', 'flac']);
    const covered = Object.entries(byExt)
        .filter(([e]) => supported.has(e))
        .reduce((s, [, n]) => s + n, 0);
    console.log(
        `\n  Couverts par le parseur : ${covered}/${audioCount} pistes (${pct(covered, audioCount)})`,
    );
}

// --- sample ----------------------------------------------------------------

/** Evenly spread across the corpus rather than the first N — ids track import order. */
function spread<T>(items: T[], n: number): T[] {
    if (items.length <= n) return items;
    const step = items.length / n;
    return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function sampleUndated() {
    console.log(bar('2. Livres sans durée, avec audio'));

    const where = ONLY_BOOK
        ? { id: ONLY_BOOK }
        : TITLE
          ? { title: { contains: TITLE, mode: 'insensitive' as const }, audio_filepath: { not: null } }
          : {
                readingDurationMinutes: null,
                audioLinkStatus: 'OK' as const,
                audio_filepath: { not: null },
            };

    const candidates = await prisma.book.findMany({
        where,
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });

    if (!candidates.length) {
        console.log('  Aucun livre ne correspond.');
        return;
    }
    console.log(`  ${candidates.length} livres correspondent — échantillon de ${Math.min(SAMPLE, candidates.length)}`);

    const chosen = ONLY_BOOK || TITLE ? candidates.slice(0, SAMPLE) : spread(candidates, SAMPLE);

    const methods: Record<string, number> = {};
    const problems: Record<string, number> = {};
    const examples: Record<string, string> = {};
    let tracksTotal = 0;
    let tracksMeasured = 0;
    let requests = 0;
    let booksComplete = 0;
    let booksPartial = 0;
    let booksNone = 0;

    for (const book of chosen) {
        const b = await probeBook(book);
        reportBook(b);

        const measured = b.tracks.filter((t) => t.seconds !== null);
        tracksTotal += b.tracks.length;
        tracksMeasured += measured.length;
        for (const t of b.tracks) {
            requests += t.requests;
            if (t.method) tally(methods, t.method);
            if (t.problem) {
                tally(problems, t.problem);
                examples[t.problem] ??= `${t.name} (#${b.id})`;
            }
        }
        if (!b.tracks.length) booksNone++;
        else if (measured.length === b.tracks.length) booksComplete++;
        else if (measured.length) booksPartial++;
        else booksNone++;
    }

    console.log(bar('Bilan de l’échantillon'));
    console.log(`  Livres entièrement mesurables   ${booksComplete}/${chosen.length}`);
    console.log(`  Livres partiellement mesurables ${booksPartial}/${chosen.length}`);
    console.log(`  Livres non mesurables           ${booksNone}/${chosen.length}`);
    console.log(`  Pistes mesurées                 ${tracksMeasured}/${tracksTotal} (${pct(tracksMeasured, tracksTotal)})`);
    console.log(`  Requêtes HTTP par piste         ${(requests / Math.max(1, tracksTotal)).toFixed(2)}`);
    console.log('\n  Méthodes');
    printTally(methods, '    ');
    console.log('\n  Échecs');
    printTally(problems, '    ');
    for (const [k, v] of Object.entries(examples)) console.log(`    ex. ${k}: ${v}`);
}

// --- validation ------------------------------------------------------------

/**
 * The browser-measured duration currently on record for each filename.
 *
 * Re-implemented rather than imported: the equivalent in lib/audio/state.ts is
 * private, and that module carries `server-only`, which throws outside a bundler.
 * The rules mirror it exactly — UPLOAD sets, RENAME carries forward.
 */
async function knownDurations(bookId: number): Promise<Map<string, number | null>> {
    const events = await prisma.audioTrackEvent.findMany({
        where: { bookId, action: { in: ['UPLOAD', 'RENAME'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { action: true, filename: true, newFilename: true, durationSeconds: true },
    });
    const out = new Map<string, number | null>();
    for (const e of events) {
        if (e.action === 'UPLOAD') out.set(e.filename, e.durationSeconds);
        else if (e.newFilename) {
            const carried = out.get(e.filename) ?? null;
            out.delete(e.filename);
            out.set(e.newFilename, carried);
        }
    }
    return out;
}

async function validate() {
    console.log(bar('3. Contrôle : sonde serveur vs mesure navigateur'));

    const withDurations = await prisma.audioTrackEvent.findMany({
        where: { action: 'UPLOAD', durationSeconds: { not: null }, bookId: { not: null } },
        select: { bookId: true },
        distinct: ['bookId'],
    });
    const ids = withDurations.map((e) => e.bookId!).filter(Boolean);
    if (!ids.length) {
        console.log('  Aucun livre ne porte de durée mesurée au navigateur — rien à comparer.');
        console.log('  (Attendu si la colonne AudioTrackEvent.durationSeconds vient d’être ajoutée.)');
        return;
    }

    const books = await prisma.book.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });
    const chosen = spread(books, SAMPLE);
    console.log(`  ${books.length} livres comparables — échantillon de ${chosen.length}`);

    const diffs: number[] = [];
    let compared = 0;
    let unmeasured = 0;

    for (const book of chosen) {
        const known = await knownDurations(book.id);
        if (!known.size) continue;
        const b = await probeBook(book);

        const rows: string[] = [];
        for (const t of b.tracks) {
            const browser = known.get(t.name);
            if (browser == null) continue;
            if (t.seconds === null) {
                unmeasured++;
                rows.push(`    ✗ ${t.name} — non mesurée (${t.problem})`);
                continue;
            }
            const diff = t.seconds - browser;
            diffs.push(Math.abs(diff));
            compared++;
            if (Math.abs(diff) > 2) {
                rows.push(
                    `    ! ${t.name} — sonde ${t.seconds.toFixed(1)}s, navigateur ${browser}s ` +
                        `(écart ${diff > 0 ? '+' : ''}${diff.toFixed(1)}s, ${t.method})`,
                );
            }
        }
        console.log(`\n  #${book.id} ${book.title} — ${b.tracks.length} pistes`);
        if (rows.length) rows.forEach((r) => console.log(r));
        else console.log('    toutes concordantes (écart ≤ 2 s)');
    }

    console.log(bar('Bilan du contrôle'));
    if (!compared) {
        console.log('  Aucune piste comparable.');
        return;
    }
    diffs.sort((a, b) => a - b);
    const within = (s: number) => diffs.filter((d) => d <= s).length;
    console.log(`  Pistes comparées      ${compared}`);
    console.log(`  Non mesurées          ${unmeasured}`);
    console.log(`  Écart médian          ${diffs[Math.floor(diffs.length / 2)].toFixed(2)} s`);
    console.log(`  Écart maximal         ${diffs[diffs.length - 1].toFixed(2)} s`);
    console.log(`  À moins d’1 s         ${within(1)} (${pct(within(1), compared)})`);
    console.log(`  À moins de 5 s        ${within(5)} (${pct(within(5), compared)})`);
    console.log(`  Au-delà de 30 s       ${compared - within(30)}`);
}

// --- CBR audit -------------------------------------------------------------

/**
 * How wrong is the estimate when there is no frame count to read?
 *
 * MPEG_CBR is the one method that can lie, and the corpus offers two ways to
 * catch it out without any external reference:
 *
 *  - a track WITH a Xing tag can be measured both ways. The gap between the
 *    encoder's own frame count and our bytes ÷ bitrate is the error of the
 *    estimate, on a real file, in seconds.
 *  - a track WITHOUT one is only estimable if it is genuinely constant-bitrate,
 *    so we read three more slices from the middle of the file and check the
 *    bitrate every frame there announces. A single disagreement means variable
 *    bitrate, and means the estimate for that file is not to be trusted.
 *
 * This is the check that decides whether the button can state a duration plainly
 * or has to qualify it.
 */
async function auditEstimate() {
    console.log(bar('3. Contrôle de l’estimation CBR'));

    const books = await prisma.book.findMany({
        where: ONLY_BOOK
            ? { id: ONLY_BOOK }
            : TITLE
              ? { title: { contains: TITLE, mode: 'insensitive' }, audio_filepath: { not: null } }
              : { audioLinkStatus: 'OK', audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });
    const chosen = ONLY_BOOK || TITLE ? books.slice(0, SAMPLE) : spread(books, SAMPLE);
    console.log(`  ${books.length} livres avec audio — échantillon de ${chosen.length}`);

    const deltas: number[] = [];
    let withTag = 0;
    let cbrConfirmed = 0;
    let vbrDetected = 0;
    let inconclusive = 0;
    const offenders: string[] = [];

    for (const book of chosen) {
        const raw = book.audio_filepath!.trim();
        const prefix = raw.endsWith('/') ? raw : `${raw}/`;
        const audio = (await listPrefix(prefix))
            .filter((o) => AUDIO_EXT.test(o.key) && o.key.toLowerCase().endsWith('.mp3'))
            .sort((a, b) => a.key.localeCompare(b.key, 'fr'))
            .slice(0, MAX_TRACKS);

        await pool(audio, async (track) => {
            const head = await getRange(track.key, 0, Math.min(HEAD_BYTES, track.size) - 1);
            const s = summariseMpeg(head);
            if (!s) return;

            const estimate = ((track.size - s.frameOffset) * 8) / (s.bitrateKbps * 1000);

            if (s.vbrFrames !== null) {
                withTag++;
                const exact = (s.vbrFrames * s.samplesPerFrame) / s.sampleRate;
                const delta = estimate - exact;
                deltas.push(Math.abs(delta));
                if (Math.abs(delta) > 5) {
                    offenders.push(
                        `#${book.id} ${track.key.split('/').pop()} — exact ${exact.toFixed(1)}s, ` +
                            `estimé ${estimate.toFixed(1)}s (${delta > 0 ? '+' : ''}${delta.toFixed(1)}s)`,
                    );
                }
                return;
            }

            // No tag: sample the bitrate through the file instead.
            const spots = [0.25, 0.5, 0.75]
                .map((f) => Math.floor(track.size * f))
                .filter((o) => o + 16 * 1024 < track.size);
            if (!spots.length) {
                inconclusive++;
                return;
            }

            const rates = new Set<number>([s.bitrateKbps]);
            for (const start of spots) {
                const chunk = await getRange(track.key, start, start + 16 * 1024 - 1);
                const mid = summariseMpeg(chunk);
                if (mid) rates.add(mid.bitrateKbps);
            }

            if (rates.size === 1) cbrConfirmed++;
            else {
                vbrDetected++;
                offenders.push(
                    `#${book.id} ${track.key.split('/').pop()} — débit variable sans tag VBR ` +
                        `(${[...rates].sort((a, b) => a - b).join('/')} kbps)`,
                );
            }
        });

        process.stdout.write(`\r  sondé jusqu’à #${book.id}…                    `);
    }
    process.stdout.write('\r');

    console.log(bar('Bilan du contrôle'));
    console.log(`  Pistes avec compteur exact (Xing/VBRI)  ${withTag}`);
    if (deltas.length) {
        deltas.sort((a, b) => a - b);
        const within = (s: number) => deltas.filter((d) => d <= s).length;
        console.log(`    écart médian de l’estimation        ${deltas[Math.floor(deltas.length / 2)].toFixed(2)} s`);
        console.log(`    écart maximal                      ${deltas[deltas.length - 1].toFixed(2)} s`);
        console.log(`    à moins d’1 s                      ${within(1)} (${pct(within(1), deltas.length)})`);
        console.log(`    à moins de 5 s                     ${within(5)} (${pct(within(5), deltas.length)})`);
    }
    console.log(`  Pistes sans tag, débit constant vérifié  ${cbrConfirmed}`);
    console.log(`  Pistes sans tag, débit VARIABLE          ${vbrDetected}`);
    console.log(`  Non concluant (fichier trop court)       ${inconclusive}`);
    if (offenders.length) {
        console.log('\n  Cas à regarder');
        offenders.slice(0, 20).forEach((o) => console.log(`    ${o}`));
        if (offenders.length > 20) console.log(`    … et ${offenders.length - 20} autres`);
    }
}

// --- folder shortcut -------------------------------------------------------

/**
 * Could one header answer for a whole folder?
 *
 * Reading every track costs one ranged GET each. If a folder's tracks all share
 * a bitrate — plausible, since a folder is one recording session through one
 * encoder — then the folder's total duration is its total BYTE count divided by
 * that single bitrate, and the listing already reports every size. That would be
 * two requests per book instead of one per track, independent of folder size.
 *
 * The claim is testable, so test it: measure each track properly, then compare
 * against what the shortcut would have said. Reported separately for folders
 * that carry VBR tags, where the shortcut cannot apply at all — a variable-rate
 * track's bytes say nothing about its length.
 */
async function auditFolderShortcut() {
    console.log(bar('4. Raccourci « un seul en-tête par dossier »'));

    const books = await prisma.book.findMany({
        where: ONLY_BOOK
            ? { id: ONLY_BOOK }
            : { audioLinkStatus: 'OK', audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });
    const chosen = ONLY_BOOK ? books : spread(books, SAMPLE);
    console.log(`  ${books.length} livres avec audio — échantillon de ${chosen.length}`);

    let cbrFolders = 0;
    let taggedFolders = 0;
    let mixedRate = 0;
    const errors: { pctErr: number; label: string; secs: number }[] = [];

    for (const book of chosen) {
        const b = await probeBook(book);
        if (!b.tracks.length || b.tracks.some((t) => t.seconds === null)) continue;

        const raw = book.audio_filepath!.trim();
        const prefix = raw.endsWith('/') ? raw : `${raw}/`;
        const audio = (await listPrefix(prefix))
            .filter((o) => AUDIO_EXT.test(o.key))
            .sort((a, b) => a.key.localeCompare(b.key, 'fr'))
            .slice(0, MAX_TRACKS);
        if (audio.length !== b.tracks.length) continue;

        if (b.tracks.some((t) => t.method === 'XING' || t.method === 'VBRI')) {
            taggedFolders++;
            continue;
        }

        // The shortcut as it would actually be implemented: one header read.
        const first = await getRange(audio[0].key, 0, Math.min(16 * 1024, audio[0].size) - 1);
        const s = summariseMpeg(first);
        if (!s) continue;

        const totalBytes = audio.reduce((sum, o) => sum + o.size, 0);
        const shortcut = (totalBytes * 8) / (s.bitrateKbps * 1000);
        const truth = b.tracks.reduce((sum, t) => sum + t.seconds!, 0);

        cbrFolders++;
        const pctErr = ((shortcut - truth) / truth) * 100;
        if (Math.abs(pctErr) > 1) mixedRate++;
        errors.push({
            pctErr,
            secs: shortcut - truth,
            label: `#${book.id} ${book.title}`.slice(0, 52),
        });

        process.stdout.write(`\r  sondé jusqu’à #${book.id}…                    `);
    }
    process.stdout.write('\r');

    console.log(bar('Bilan du raccourci'));
    console.log(`  Dossiers testables (tout CBR)      ${cbrFolders}`);
    console.log(`  Dossiers à tag VBR (non testables) ${taggedFolders}`);
    if (!errors.length) {
        console.log('  Rien à comparer.');
        return;
    }
    const abs = errors.map((e) => Math.abs(e.pctErr)).sort((a, b) => a - b);
    console.log(`  Erreur médiane                     ${abs[Math.floor(abs.length / 2)].toFixed(3)} %`);
    console.log(`  Erreur maximale                    ${abs[abs.length - 1].toFixed(3)} %`);
    console.log(`  Dossiers à plus d’1 % d’erreur     ${mixedRate}`);
    console.log('\n  Pires cas');
    errors
        .sort((a, b) => Math.abs(b.pctErr) - Math.abs(a.pctErr))
        .slice(0, 8)
        .forEach((e) =>
            console.log(
                `    ${e.label.padEnd(54)} ${e.pctErr > 0 ? '+' : ''}${e.pctErr.toFixed(3)} % ` +
                    `(${e.secs > 0 ? '+' : ''}${e.secs.toFixed(0)} s)`,
            ),
        );
}

// --- main ------------------------------------------------------------------

async function main() {
    console.log('SONDE DE DURÉE — lecture seule, aucune écriture');
    console.log(`  bucket ${BUCKET}${endpoint ? ` @ ${endpoint}` : ''}`);
    console.log(`  base   ${describeDatabase(DB_URL)}`);
    console.log(`  entête ${HEAD_BYTES / 1024} Kio par piste`);

    if (CENSUS) await census();
    if (SHORTCUT) await auditFolderShortcut();
    else if (AUDIT) await auditEstimate();
    else if (VALIDATE) await validate();
    else await sampleUndated();
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
