/**
 * One-off repair: the first track of folders named by the pre-a5040a6 upload rule.
 *
 * Until a5040a6, an empty folder named the lecteur's `01 Titre.mp3` as
 * `001 01 Titre.mp3`, and every later upload as `001 002 02 Titre.mp3`. The
 * portal (naturalCompare) still played track 1 first, but a CD burner or player
 * compares names byte by byte, and `001 01` lands between `001 009` and `001 010`.
 * About 165 books were affected on prod (November 2026). This renames that one
 * track to `001 001 01 Titre.mp3`, the shape the rest of its folder already has.
 *
 * Dry run by default — lists the bucket, writes nothing:
 *
 *   pnpm tsx scripts/repair-first-track-names.ts [--book <id>] [--out <rapport.md>]
 *
 * Apply (through renameTrack, the same copy → verify → delete the « Renommer »
 * button uses, logged as a RENAME in AudioTrackEvent):
 *
 *   node --conditions=react-server --import tsx scripts/repair-first-track-names.ts --apply [--book <id>] [--user-id <id>]
 *
 * (the react-server condition stubs out `server-only`, as in
 * scripts/audio-manage.e2e.ts, so the production rename runs unchanged.)
 *
 * Candidates are books that received at least one upload through the portal: the
 * migrated Arbre Vert corpus never went through nextTrackName and has its own,
 * mixed numbering, which this must not touch. Each folder is listed live and a
 * rename is proposed only when it fixes the order outright — anything else is
 * reported for a human to look at, never guessed.
 */
import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { listRawObjects, toOrderedTracks } from '../lib/audio/bucket-core';
import { naturalCompare } from '../lib/audio/naming';
import { pool } from '../lib/concurrency';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const args = process.argv.slice(2);
const argValue = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes('--apply');
const ONLY_BOOK = argValue('--book') ? Number(argValue('--book')) : null;
const USER_ID = argValue('--user-id') ? Number(argValue('--user-id')) : null;
const OUT = argValue('--out');

/** The bug's signature: the 001 the rule added, then the lecteur's own 1–2 digit number. */
const BUGGY_FIRST = /^001 \d{1,2}(?!\d)/;
/** What every later upload in such a folder got: lead 001, then a 3-digit track number. */
const LEAD_AND_TRACK = /^001 \d{3}(?!\d)/;

/** What a CD burner or player does: compare the UTF-8 bytes, nothing else. */
const byteCompare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

type Verdict =
    | { kind: 'rename'; preventive: boolean; from: string; to: string }
    | { kind: 'flag'; reason: string }
    | { kind: 'ok' };

/**
 * `names` in playback order (naturalCompare). Proposes a rename only if, once
 * applied, the byte order and the playback order are the same and track 1 is
 * still track 1.
 */
function judge(names: string[]): Verdict {
    if (!names.length) return { kind: 'ok' };
    const [first, ...rest] = names;
    const byteOrdered = [...names].sort(byteCompare);

    if (!BUGGY_FIRST.test(first)) {
        // A buggy-looking name elsewhere than first is a different story —
        // « 001 21 … » uploaded before chapters 1–20, say. Not ours to reorder.
        const stray = rest.find((n) => BUGGY_FIRST.test(n));
        if (stray && !sameOrder(byteOrdered, names)) {
            return { kind: 'flag', reason: `« ${stray} » n'est pas la première piste` };
        }
        return { kind: 'ok' };
    }

    // The lecteur's own number has to say « first file » (00, 01, 1). A folder
    // started from file 21 (« Un mariage dans la cage aux lions », p. 273) plays
    // that file first in the portal too: renaming it would only make the wrong
    // order consistent.
    const lecteurNumber = Number(/^001 (\d{1,2})/.exec(first)![1]);
    if (lecteurNumber > 1) {
        return { kind: 'flag', reason: `la piste 1 est le fichier n° ${lecteurNumber} du lecteur : « ${first} »` };
    }

    const odd = rest.find((n) => !LEAD_AND_TRACK.test(n));
    if (odd) {
        const now = sameOrder(byteOrdered, names) ? 'en ordre aujourd’hui, ' : '';
        return { kind: 'flag', reason: `${now}piste hors format « 001 NNN » : « ${odd} »` };
    }

    const to = `001 001 ${first.slice(4)}`;
    if (names.includes(to)) return { kind: 'flag', reason: `« ${to} » existe déjà` };

    const after = [to, ...rest];
    if (!sameOrder([...after].sort(byteCompare), after) || !sameOrder([...after].sort(naturalCompare), after)) {
        return { kind: 'flag', reason: 'le renommage de la piste 1 ne suffirait pas à remettre l’ordre' };
    }
    return { kind: 'rename', preventive: rest.length === 0, from: first, to };
}

async function main() {
    if (APPLY && !process.execArgv.join(' ').includes('react-server')) {
        throw new Error(
            'Mode --apply : lancer avec « node --conditions=react-server --import tsx », voir l’en-tête du script.',
        );
    }

    const url = scriptDatabaseUrl();
    console.log(`Base : ${describeDatabase(url)}`);
    console.log(APPLY ? 'Mode : APPLICATION (renommages réels)\n' : 'Mode : essai à blanc — rien n’est modifié\n');
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

    const uploaded = await prisma.audioTrackEvent.findMany({
        where: { action: 'UPLOAD', bookId: ONLY_BOOK ?? { not: null } },
        distinct: ['bookId'],
        select: { bookId: true },
    });
    const books = await prisma.book.findMany({
        where: { id: { in: uploaded.map((u) => u.bookId!) }, deletedAt: null, audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });

    // A folder shared by two live fiches is refused by the rename route; same here.
    const prefixOf = (p: string) => (p.trim().endsWith('/') ? p.trim() : `${p.trim()}/`);
    const holders = await prisma.book.groupBy({
        by: ['audio_filepath'],
        where: { deletedAt: null, audio_filepath: { not: null } },
        _count: { _all: true },
    });
    const holdersByPrefix = new Map<string, number>();
    for (const h of holders) {
        const p = prefixOf(h.audio_filepath!);
        holdersByPrefix.set(p, (holdersByPrefix.get(p) ?? 0) + h._count._all);
    }

    console.log(`Livres avec au moins un envoi par le portail : ${books.length}. Lecture du bucket…\n`);

    const results = await pool(books, 8, async (b) => {
        const prefix = prefixOf(b.audio_filepath!);
        const tracks = toOrderedTracks(await listRawObjects(prefix), prefix);
        let verdict = judge(tracks.map((t) => t.name));
        if (verdict.kind === 'rename' && (holdersByPrefix.get(prefix) ?? 0) > 1) {
            verdict = { kind: 'flag', reason: 'dossier partagé avec une autre fiche' };
        }
        return { book: b, prefix, trackCount: tracks.length, verdict };
    });

    const renames = results.filter((r) => r.verdict.kind === 'rename');
    const flagged = results.filter((r) => r.verdict.kind === 'flag');
    const fixes = renames.filter((r) => r.verdict.kind === 'rename' && !r.verdict.preventive);
    const preventive = renames.filter((r) => r.verdict.kind === 'rename' && r.verdict.preventive);

    const lines: string[] = [];
    lines.push(`# Renommage de la piste 1 — ${APPLY ? 'application' : 'essai à blanc'}`, '');
    lines.push(`Base : ${describeDatabase(url)} — ${new Date().toISOString()}`, '');
    lines.push(`- Livres examinés : ${results.length}`);
    lines.push(`- À renommer (mal classés sur CD) : ${fixes.length}`);
    lines.push(`- À renommer par précaution (une seule piste, cassera au prochain envoi) : ${preventive.length}`);
    lines.push(`- Signalés, non touchés : ${flagged.length}`);
    lines.push(`- Déjà en ordre : ${results.length - renames.length - flagged.length}`, '');
    for (const [title, group] of [
        ['À renommer', fixes],
        ['Par précaution', preventive],
    ] as const) {
        lines.push(`## ${title}`, '');
        for (const r of group) {
            if (r.verdict.kind !== 'rename') continue;
            lines.push(`- #${r.book.id} ${r.book.title.trim()} (${r.trackCount} pistes)`);
            lines.push(`  - \`${r.verdict.from}\``);
            lines.push(`  - → \`${r.verdict.to}\``);
        }
        lines.push('');
    }
    lines.push('## Signalés', '');
    for (const r of flagged) {
        if (r.verdict.kind !== 'flag') continue;
        lines.push(`- #${r.book.id} ${r.book.title.trim()} — ${r.verdict.reason}`);
    }
    const report = lines.join('\n') + '\n';
    if (OUT) {
        const { writeFile } = await import('fs/promises');
        await writeFile(OUT, report, 'utf8');
        console.log(`Rapport écrit dans ${OUT}\n`);
    }
    console.log(lines.slice(0, 9).join('\n'));

    if (APPLY) {
        const { renameTrack } = await import('../lib/audio/rename');
        let done = 0;
        const failed: string[] = [];
        // One at a time: each rename re-reads the folder state and re-prices, and
        // the whole run is a few hundred bucket calls — speed is not the point.
        for (const r of renames) {
            if (r.verdict.kind !== 'rename') continue;
            try {
                await renameTrack({
                    bookId: r.book.id,
                    oldKey: `${r.prefix}${r.verdict.from}`,
                    newKey: `${r.prefix}${r.verdict.to}`,
                    userId: USER_ID,
                });
                done++;
                console.log(`ok    #${r.book.id}  ${r.verdict.to}`);
            } catch (e) {
                failed.push(`#${r.book.id} ${r.verdict.from} : ${(e as Error).message}`);
                console.log(`ÉCHEC #${r.book.id}  ${(e as Error).message}`);
            }
        }
        console.log(`\n${done} renommé(s), ${failed.length} échec(s).`);
        if (failed.length) process.exitCode = 1;
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
