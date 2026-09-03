/**
 * ECA Portal — audit the B2 audio bucket against the catalogue.
 *
 * Read-only. Never writes to the bucket or the database.
 *
 * THE UNIT IS A FOLDER, NOT A FILE. The bucket is laid out as
 *
 *   dirt/<année>/<n°> <titre>/<n° de tête> <piste>-<titre>.mp3
 *   dirt/2022/21525 Le secret de l!abbé Saunière/1000 22- Le secret de l’abbé Saunière.mp3
 *
 * so one book is one folder holding dozens of ordered sections. The run:
 *
 *  1. groups every object into its folder;
 *  2. derives how folders join to books — the leading folder number against
 *     each candidate id column, the folder title against Book.title, or the
 *     stored audio_filepath — and reports which one actually explains the data
 *     rather than assuming;
 *  3. orders each folder's tracks numerically (S3 lists 10 before 2) and checks
 *     the run for gaps, duplicate track numbers and unreadable filenames.
 *
 * Usage:
 *   pnpm tsx scripts/audit-audio-files.ts
 *   pnpm tsx scripts/audit-audio-files.ts --prefix=dirt/ --out=./audio-audit
 *   pnpm tsx scripts/audit-audio-files.ts --no-fuzzy      # exact joins only
 *
 * Storage is Backblaze B2 via its S3-compatible API — nothing here is AWS-specific.
 *
 * Env (see README):
 *   S3_AUDIO_BUCKET       required
 *   S3_ENDPOINT           required for B2, e.g. https://s3.eu-central-003.backblazeb2.com
 *   S3_REGION             must match the endpoint's region, e.g. eu-central-003
 *   S3_ACCESS_KEY_ID      B2 application keyID (falls back to AWS_ACCESS_KEY_ID)
 *   S3_SECRET_ACCESS_KEY  B2 applicationKey  (falls back to AWS_SECRET_ACCESS_KEY)
 *   S3_AUDIO_PREFIX       optional, restricts the listing
 *
 * Only object metadata is read (ListObjectsV2, 1000 keys per call) — no audio is
 * ever downloaded, so the bucket's size in bytes is irrelevant to the run.
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
    toKey as toKeyWithBucket,
    normalise,
    tokensOf,
    similarity,
    parseFolder,
    orderSections,
    inspectFolder,
    groupByFolder,
    canonicalFolderName,
    type ParsedFolder,
    type ParsedSection,
} from './audio-match-rules';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const BUCKET = process.env.S3_AUDIO_BUCKET;
// B2's console shows the endpoint as a bare host — the SDK needs a full URL.
const RAW_ENDPOINT = process.env.S3_ENDPOINT;
const ENDPOINT = RAW_ENDPOINT
    ? /^https?:\/\//i.test(RAW_ENDPOINT)
        ? RAW_ENDPOINT
        : `https://${RAW_ENDPOINT}`
    : undefined;
// B2 regions look like "eu-central-003" and must match the endpoint host.
const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
const PREFIX = arg('prefix') ?? process.env.S3_AUDIO_PREFIX ?? '';
const OUT_DIR = path.resolve(arg('out') ?? './audio-audit');

/** Bigram-dice similarity above which a title match is reported as PROBABLE. */
const FUZZY_THRESHOLD = Number(arg('threshold') ?? 0.82);
/** Folder titles scored per unmatched book by the fuzzy fallback. */
const MAX_CANDIDATES = Number(arg('candidates') ?? 300);
const NO_FUZZY = args.includes('--no-fuzzy');

const AUDIO_EXT = /\.(mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

if (!BUCKET) {
    console.error('S3_AUDIO_BUCKET is not set. Add it to .env (see README).');
    process.exit(1);
}

const s3 = new S3Client({
    region: REGION,
    endpoint: ENDPOINT, // undefined = real AWS S3
    // The SDK's default flexible-checksum headers are an AWS extension that
    // non-AWS S3 implementations reject. Listing is unaffected, but keeping this
    // off means the same client config also works for uploads.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials:
        process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
            ? {
                  accessKeyId: (process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)!,
                  secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY ??
                      process.env.AWS_SECRET_ACCESS_KEY)!,
              }
            : undefined, // fall back to the default provider chain (SSO, profile…)
});

const DB_URL = scriptDatabaseUrl();
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

const toKey = (raw: string): string => toKeyWithBucket(raw, BUCKET!);

// ---------------------------------------------------------------------- S3

async function listBucket(): Promise<{ key: string; size: number }[]> {
    const objects: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: PREFIX || undefined,
                ContinuationToken: token,
            }),
        );
        for (const o of res.Contents ?? []) {
            if (!o.Key || o.Key.endsWith('/')) continue; // skip folder placeholders
            objects.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
        process.stdout.write(`\r  ${objects.length} objets listés…`);
    } while (token);
    process.stdout.write('\n');
    return objects;
}

// ------------------------------------------------------------------- report

const csvCell = (v: string | number): string => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: (string | number)[][]): string =>
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

const mb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);

type BookRow = {
    id: number;
    title: string;
    author: string;
    audio_filepath: string | null;
    source_access_id: number | null;
    id_arbre: number | null;
};

/**
 * Candidate ways a folder might join to a book. Rather than assuming the leading
 * folder number is `id_arbre`, score every column and let the coverage decide.
 */
interface Join {
    name: string;
    /** Key for a book, or null if this book can't participate. */
    ofBook: (b: BookRow) => string | null;
    /** Key for a folder, or null. */
    ofFolder: (f: ParsedFolder) => string | null;
    hits: number;
    ambiguous: number;
}

function buildJoins(): Join[] {
    const num = (n: number | null) => (n === null ? null : `#${n}`);
    const folderNum = (f: ParsedFolder) => num(f.num);
    return [
        { name: 'n° dossier = id_arbre', ofBook: (b) => num(b.id_arbre), ofFolder: folderNum, hits: 0, ambiguous: 0 },
        { name: 'n° dossier = source_access_id', ofBook: (b) => num(b.source_access_id), ofFolder: folderNum, hits: 0, ambiguous: 0 },
        { name: 'n° dossier = Book.id', ofBook: (b) => num(b.id), ofFolder: folderNum, hits: 0, ambiguous: 0 },
        {
            name: 'titre dossier = Book.title',
            ofBook: (b) => normalise(b.title) || null,
            ofFolder: (f) => normalise(f.title) || null,
            hits: 0,
            ambiguous: 0,
        },
        {
            name: 'audio_filepath = préfixe dossier',
            ofBook: (b) => (b.audio_filepath ? normalise(toKey(b.audio_filepath).replace(/\/+$/, '')) || null : null),
            ofFolder: (f) => normalise(f.prefix.replace(/\/+$/, '')) || null,
            hits: 0,
            ambiguous: 0,
        },
    ];
}

/** Score each join: how many books it resolves, and how many collide. */
function scoreJoins(joins: Join[], books: BookRow[], folders: ParsedFolder[]): Join[] {
    for (const j of joins) {
        const index = new Map<string, number>();
        for (const f of folders) {
            const k = j.ofFolder(f);
            if (k) index.set(k, (index.get(k) ?? 0) + 1);
        }
        for (const b of books) {
            const k = j.ofBook(b);
            if (!k) continue;
            const n = index.get(k) ?? 0;
            if (n === 1) j.hits++;
            else if (n > 1) j.ambiguous++;
        }
    }
    return [...joins].sort((a, b) => b.hits - a.hits);
}

async function main() {
    console.log(`Base ${describeDatabase(DB_URL)}`);
    console.log(`Bucket   : ${BUCKET} (${REGION})${PREFIX ? ` prefix=${PREFIX}` : ''}`);
    console.log('Listing…');
    const objects = await listBucket();
    const audio = objects.filter((o) => isAudioKey(o.key));

    // --- 1. Bucket shape -----------------------------------------------------
    const grouped = groupByFolder(audio);
    const folders = [...grouped.keys()].map(parseFolder);

    const withNum = folders.filter((f) => f.num !== null).length;
    const withYear = folders.filter((f) => f.year !== null).length;
    console.log(`\nStructure`);
    console.log(`  objets audio     ${audio.length}`);
    console.log(`  dossiers (livres) ${folders.length}`);
    console.log(`  … avec n° en tête ${withNum} (${((withNum / (folders.length || 1)) * 100).toFixed(0)}%)`);
    console.log(`  … sous une année  ${withYear} (${((withYear / (folders.length || 1)) * 100).toFixed(0)}%)`);

    // What is the "1000" token? Answer it from the data instead of guessing.
    const leadStats = new Map<number, number>();
    let multiLead = 0;
    for (const sections of grouped.values()) {
        const info = inspectFolder(sections);
        if (info.leads.length > 1) multiLead++;
        for (const l of info.leads) leadStats.set(l, (leadStats.get(l) ?? 0) + 1);
    }
    const topLeads = [...leadStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  jetons de tête distincts ${leadStats.size}${leadStats.size ? ` — plus fréquents : ${topLeads.map(([l, n]) => `${l} (${n})`).join(', ')}` : ''}`);
    if (multiLead) console.log(`  ⚠ ${multiLead} dossier(s) mélangent plusieurs jetons de tête`);

    // --- 2. Which join actually works? --------------------------------------
    const books: BookRow[] = await prisma.book.findMany({
        select: {
            id: true,
            title: true,
            author: true,
            audio_filepath: true,
            source_access_id: true,
            id_arbre: true,
        },
        orderBy: { id: 'asc' },
    });
    console.log(`\nLivres au catalogue : ${books.length}`);

    const ranked = scoreJoins(buildJoins(), books, folders);
    console.log('\nJointures candidates (livres résolus sans ambiguïté)');
    for (const j of ranked) {
        const pct = ((j.hits / (folders.length || 1)) * 100).toFixed(1);
        console.log(
            `  ${String(j.hits).padStart(6)}  ${pct.padStart(5)}%  ${j.name}` +
                (j.ambiguous ? `   (+${j.ambiguous} ambigus)` : ''),
        );
    }
    const best = ranked[0];
    if (best.hits === 0) {
        console.log('\n  ⚠ Aucune jointure ne fonctionne — vérifiez --prefix et le contenu du bucket.');
    }

    // --- 3. Resolve each book, best join first, then title, then fuzzy -------
    const folderIndexes = ranked.map((j) => {
        const idx = new Map<string, ParsedFolder[]>();
        for (const f of folders) {
            const k = j.ofFolder(f);
            if (!k) continue;
            const l = idx.get(k);
            if (l) l.push(f);
            else idx.set(k, [f]);
        }
        return { join: j, idx };
    });

    // Token index over folder titles, for the fuzzy last resort.
    const titleIndex = new Map<string, string[]>();
    const normTitleToFolder = new Map<string, ParsedFolder[]>();
    for (const f of folders) {
        const nt = normalise(f.title);
        if (!nt) continue;
        const l = normTitleToFolder.get(nt);
        if (l) l.push(f);
        else normTitleToFolder.set(nt, [f]);
    }
    for (const nt of normTitleToFolder.keys()) {
        for (const t of tokensOf(nt)) {
            const p = titleIndex.get(t);
            if (p) p.push(nt);
            else titleIndex.set(t, [nt]);
        }
    }
    const COMMON_TOKEN_LIMIT = Math.max(50, Math.floor(normTitleToFolder.size * 0.02));

    function fuzzyFolder(nt: string): { folder: ParsedFolder; score: number } | null {
        const shared = new Map<string, number>();
        for (const t of tokensOf(nt)) {
            const posting = titleIndex.get(t);
            if (!posting || posting.length > COMMON_TOKEN_LIMIT) continue;
            for (const cand of posting) shared.set(cand, (shared.get(cand) ?? 0) + 1);
        }
        if (!shared.size) return null;
        const ranked2 = [...shared.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CANDIDATES);
        let bestKey = '';
        let bestScore = 0;
        for (const [cand] of ranked2) {
            const s = similarity(nt, cand);
            if (s > bestScore) {
                bestScore = s;
                bestKey = cand;
            }
        }
        const list = bestKey ? normTitleToFolder.get(bestKey) : undefined;
        return list?.length === 1 ? { folder: list[0], score: bestScore } : null;
    }

    type Status = 'MATCHED' | 'PROBABLE' | 'AMBIGUOUS' | 'NO_FOLDER';
    interface Resolved {
        status: Status;
        book: BookRow;
        folder: ParsedFolder | null;
        via: string;
        score: string;
    }

    const resolved: Resolved[] = [];
    const claimed = new Set<string>();

    for (const b of books) {
        let hit: Resolved | null = null;

        for (const { join, idx } of folderIndexes) {
            const k = join.ofBook(b);
            if (!k) continue;
            const list = idx.get(k);
            if (list?.length === 1) {
                hit = { status: 'MATCHED', book: b, folder: list[0], via: join.name, score: '1.00' };
                break;
            }
            if (list && list.length > 1) {
                hit = { status: 'AMBIGUOUS', book: b, folder: null, via: join.name, score: `${list.length} dossiers` };
                break;
            }
        }

        if (!hit && !NO_FUZZY) {
            const f = fuzzyFolder(normalise(b.title));
            if (f && f.score >= FUZZY_THRESHOLD) {
                hit = { status: 'PROBABLE', book: b, folder: f.folder, via: 'titre approximatif', score: f.score.toFixed(2) };
            }
        }

        const row = hit ?? { status: 'NO_FOLDER' as Status, book: b, folder: null, via: '', score: '' };
        if (row.folder) claimed.add(row.folder.prefix);
        resolved.push(row);
    }

    const orphanFolders = folders.filter((f) => !claimed.has(f.prefix));

    // --- 4. Per-folder integrity --------------------------------------------
    const count = (s: Status) => resolved.filter((r) => r.status === s).length;
    console.log('\nRésultat');
    console.log(`  MATCHED    ${count('MATCHED')}   livre ↔ dossier certain`);
    console.log(`  PROBABLE   ${count('PROBABLE')}   titre approchant, à vérifier`);
    console.log(`  AMBIGUOUS  ${count('AMBIGUOUS')}   plusieurs dossiers pour la même clé`);
    console.log(`  NO_FOLDER  ${count('NO_FOLDER')}   aucun dossier trouvé`);
    console.log(`  ORPHELINS  ${orphanFolders.length}   dossiers sans livre`);

    let withGaps = 0;
    let withDupes = 0;
    let withUnparsed = 0;
    const bookRows: (string | number)[][] = [];
    const sectionRows: (string | number)[][] = [];

    for (const r of resolved) {
        const sections: ParsedSection[] = r.folder ? (grouped.get(r.folder.prefix) ?? []) : [];
        const info = inspectFolder(sections);
        if (info.gaps.length) withGaps++;
        if (info.duplicates.length) withDupes++;
        if (info.unparsed.length) withUnparsed++;

        bookRows.push([
            r.status,
            r.book.id,
            r.book.title,
            r.book.author,
            r.via,
            r.score,
            r.folder?.prefix ?? '',
            r.folder?.year ?? '',
            r.folder?.num ?? '',
            info.count,
            mb(info.bytes),
            info.gaps.join(' '),
            info.duplicates.join(' '),
            info.unparsed.length,
            info.leads.join(' '),
            // The clean name for this book — store it, or use it as a rename target.
            r.folder ? canonicalFolderName(r.book.id, r.book.title) : '',
            r.book.audio_filepath ?? '',
        ]);

        orderSections(sections).forEach((s, i) => {
            sectionRows.push([
                r.book.id,
                r.folder?.prefix ?? '',
                i + 1,
                s.section ?? '',
                s.key,
                s.size,
            ]);
        });
    }

    console.log('\nIntégrité des dossiers rattachés');
    console.log(`  avec trous dans la numérotation  ${withGaps}`);
    console.log(`  avec numéros de piste en double  ${withDupes}`);
    console.log(`  avec fichiers illisibles         ${withUnparsed}`);

    // --- 5. Write it out -----------------------------------------------------
    await mkdir(OUT_DIR, { recursive: true });
    const booksCsv = path.join(OUT_DIR, 'books.csv');
    const sectionsCsv = path.join(OUT_DIR, 'sections.csv');
    const orphansCsv = path.join(OUT_DIR, 'orphan-folders.csv');

    await writeFile(
        booksCsv,
        csv(
            ['status', 'bookId', 'title', 'author', 'via', 'score', 'folder', 'year', 'folderNum', 'trackCount', 'sizeMB', 'gaps', 'duplicates', 'unparsed', 'leads', 'canonicalName', 'storedPath'],
            bookRows,
        ),
        'utf8',
    );
    await writeFile(
        sectionsCsv,
        csv(['bookId', 'folder', 'order', 'section', 'key', 'sizeBytes'], sectionRows),
        'utf8',
    );
    await writeFile(
        orphansCsv,
        csv(
            ['folder', 'year', 'folderNum', 'title', 'trackCount', 'sizeMB'],
            orphanFolders.map((f) => {
                const info = inspectFolder(grouped.get(f.prefix) ?? []);
                return [f.prefix, f.year ?? '', f.num ?? '', f.title, info.count, mb(info.bytes)];
            }),
        ),
        'utf8',
    );

    console.log(`\n  ${booksCsv}`);
    console.log(`  ${sectionsCsv}`);
    console.log(`  ${orphansCsv}`);

    // --- 6. Show one resolved book in full, as a sanity check ---------------
    const sample = resolved.find((r) => r.status === 'MATCHED' && r.folder);
    if (sample?.folder) {
        const ordered = orderSections(grouped.get(sample.folder.prefix) ?? []);
        console.log(`\nExemple — « ${sample.book.title} » (id ${sample.book.id}, via ${sample.via})`);
        console.log(`  ${sample.folder.prefix}`);
        for (const s of ordered.slice(0, 3)) console.log(`    ${String(s.section).padStart(3)}  ${s.key.split('/').pop()}`);
        if (ordered.length > 4) console.log(`    …`);
        const last = ordered[ordered.length - 1];
        if (ordered.length > 3) console.log(`    ${String(last.section).padStart(3)}  ${last.key.split('/').pop()}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
