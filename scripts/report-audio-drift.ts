/**
 * Where the database and the audio bucket disagree.
 *
 *   pnpm tsx scripts/report-audio-drift.ts
 *   pnpm tsx scripts/report-audio-drift.ts --out=C:\chemin\derive-audio.json
 *
 * STRICTLY READ-ONLY — one listing of the whole bucket (ListObjectsV2) and
 * SELECTs. Nothing is written to the bucket or the database: each finding is
 * something a person decides about.
 *
 * A script, not a cron route: the bucket holds ~350 000 objects and listing it
 * takes over two minutes, past what a Vercel function may run. Run it against
 * the database you want to compare — PRODUCTION for anything someone will act
 * on. The dev database is a stale copy, so its corbeille rows in particular
 * are a month behind the bucket, and every « no row » it reports is noise.
 *
 * What it reports, and why nothing else did:
 *
 *  1. Corbeille objects that no DeletedAudioTrack row names. Restore, the
 *     corbeille page and the nightly purge all start from the rows, so such a
 *     copy is invisible to all three: never restorable from the portal, never
 *     purged, paid for until someone notices (« Abysses », 3.8 GB, November
 *     2026). And the reverse — a row still « in the corbeille » whose copy is
 *     gone, or a purged row whose copy is still there.
 *  2. Books whose cached audioTrackCount / audioSizeKb disagree with their
 *     folder. Those columns are only rewritten by refreshBookAudioState, which
 *     runs when a book's audio dialogue opens — so a folder changed from
 *     anywhere else keeps its old badge, track count and CD price until then.
 *     The count follows toOrderedTracks, the same rule the refresh uses.
 *  3. Folders outside `dirt/` and `corbeille/` — the cancelled-upload copy
 *     under `2022/`, the `T:\…` paths of the Access import — and whether a
 *     book claims them.
 *  4. AudioTrackDuration rows that describe no current file (see
 *     scripts/prune-audio-durations.ts, which deletes them).
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getS3, AUDIO_BUCKET, listRawObjects, toOrderedTracks } from '../lib/audio/bucket-core';
import { TRASH_PREFIX } from '../lib/audio/trash-prefix';
import { resolvePrefix } from '../lib/audio/prefix';
import { bytesToKb } from '../lib/pricing';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const OUT = arg('out');

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

type Obj = { key: string; size: number };
const folderOf = (key: string) => key.slice(0, key.lastIndexOf('/') + 1);
const gb = (bytes: number) => (bytes / 1e9).toFixed(2);

async function listWholeBucket(): Promise<Obj[]> {
    const roots = await getS3().send(new ListObjectsV2Command({ Bucket: AUDIO_BUCKET, Delimiter: '/' }));
    const all: Obj[] = [];
    for (const o of roots.Contents ?? []) if (o.Key) all.push({ key: o.Key, size: o.Size ?? 0 });
    for (const p of roots.CommonPrefixes ?? []) {
        if (!p.Prefix) continue;
        // Pushed one by one: a spread of 350 000 items overflows the call stack.
        for (const o of await listRawObjects(p.Prefix)) all.push(o);
    }
    return all;
}

async function main() {
    console.log(`Base : ${describeDatabase(DB_URL)} · stockage : ${AUDIO_BUCKET}`);
    const started = Date.now();
    const all = await listWholeBucket();
    console.log(`${all.length} objets listés en ${Math.round((Date.now() - started) / 1000)} s\n`);
    const sizeByKey = new Map(all.map((o) => [o.key, o.size]));

    // --- 1. Corbeille ---------------------------------------------------------
    const trash = all.filter((o) => o.key.startsWith(TRASH_PREFIX));
    const rows = await prisma.deletedAudioTrack.findMany({
        select: { id: true, trashKey: true, purgedAt: true, restoredAt: true },
    });
    const rowByTrashKey = new Map(rows.map((r) => [r.trashKey, r]));
    const unrecorded = trash.filter((o) => !rowByTrashKey.has(o.key));
    const unrecordedByFolder = new Map<string, { objects: number; bytes: number }>();
    for (const o of unrecorded) {
        const group = o.key.split('/').slice(0, 2).join('/') + '/';
        const g = unrecordedByFolder.get(group) ?? { objects: 0, bytes: 0 };
        g.objects++;
        g.bytes += o.size;
        unrecordedByFolder.set(group, g);
    }
    const activeRows = rows.filter((r) => !r.purgedAt && !r.restoredAt);
    const activeWithoutCopy = activeRows.filter((r) => !sizeByKey.has(r.trashKey));
    const purgedStillThere = rows.filter((r) => r.purgedAt && sizeByKey.has(r.trashKey));

    console.log('1. Corbeille');
    console.log(`   ${trash.length} objets (${gb(trash.reduce((s, o) => s + o.size, 0))} Go), ${activeRows.length} lignes actives`);
    console.log(`   objets sans ligne : ${unrecorded.length} (${gb(unrecorded.reduce((s, o) => s + o.size, 0))} Go)`);
    for (const [group, g] of [...unrecordedByFolder].sort((a, b) => b[1].objects - a[1].objects)) {
        console.log(`     ${group.padEnd(24)} ${String(g.objects).padStart(5)} objets  ${gb(g.bytes)} Go`);
    }
    console.log(`   lignes actives sans copie : ${activeWithoutCopy.length}` +
        (activeWithoutCopy.length ? ` (ex. #${activeWithoutCopy.slice(0, 5).map((r) => r.id).join(', #')})` : ''));
    console.log(`   lignes purgées dont la copie existe encore : ${purgedStillThere.length}\n`);

    // --- 2. Cached badge / weight -------------------------------------------
    const byFolder = new Map<string, Obj[]>();
    for (const o of all) {
        if (o.key.startsWith(TRASH_PREFIX)) continue;
        const f = folderOf(o.key);
        const list = byFolder.get(f);
        if (list) list.push(o);
        else byFolder.set(f, [o]);
    }
    const books = await prisma.book.findMany({
        where: { audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true, audioTrackCount: true, audioSizeKb: true, audioLinkStatus: true, deletedAt: true },
        orderBy: { id: 'asc' },
    });
    const stale: {
        id: number; title: string; status: string;
        cached: { tracks: number | null; kb: number | null };
        bucket: { tracks: number | null; kb: number | null };
    }[] = [];
    const claimed = new Set<string>();
    for (const b of books) {
        const prefix = resolvePrefix(b.audio_filepath);
        if (!prefix) continue;
        claimed.add(prefix);
        // A deleted fiche still claims its folder (left in place), but has no
        // badge anyone sees: this plain client has no soft-delete filter.
        if (b.deletedAt) continue;
        const tracks = toOrderedTracks(byFolder.get(prefix) ?? [], prefix);
        const count = tracks.length || null;
        const kb = tracks.length ? bytesToKb(tracks.reduce((s, t) => s + t.sizeBytes, 0)) : null;
        if (count !== b.audioTrackCount || kb !== b.audioSizeKb) {
            stale.push({
                id: b.id, title: b.title, status: b.audioLinkStatus,
                cached: { tracks: b.audioTrackCount, kb: b.audioSizeKb },
                bucket: { tracks: count, kb },
            });
        }
    }
    console.log(`2. Pastilles en retard sur le dossier : ${stale.length} livre(s)`);
    for (const s of stale) {
        console.log(`   #${String(s.id).padEnd(6)} ${s.status.padEnd(15)} en cache ${s.cached.tracks ?? '—'} pistes / ${s.cached.kb ?? '—'} Ko` +
            ` · dossier ${s.bucket.tracks ?? '—'} / ${s.bucket.kb ?? '—'}  ${s.title.trim().slice(0, 50)}`);
    }
    console.log('   (corrigé en ouvrant la fenêtre Audio du livre)\n');

    // --- 3. Outside the catalogue tree -----------------------------------------
    const outside = new Map<string, number>();
    for (const o of all) {
        if (o.key.startsWith('dirt/') || o.key.startsWith(TRASH_PREFIX) || o.key.startsWith('_')) continue;
        const f = folderOf(o.key);
        outside.set(f, (outside.get(f) ?? 0) + 1);
    }
    const outsideList = [...outside].map(([folder, objects]) => ({ folder, objects, claimed: claimed.has(folder) }));
    console.log(`3. Dossiers hors de dirt/ et corbeille/ : ${outsideList.length} (${outsideList.filter((o) => o.claimed).length} revendiqués par une fiche)`);
    for (const o of outsideList.filter((o) => o.claimed)) console.log(`   revendiqué : ${o.folder} (${o.objects})`);
    console.log('');

    // --- 4. Duration cache rows that describe no file ----------------------------
    const pathByBook = new Map(books.map((b) => [b.id, resolvePrefix(b.audio_filepath)]));
    const durations = await prisma.audioTrackDuration.findMany({ select: { bookId: true, filename: true, sizeBytes: true } });
    let noBook = 0, gone = 0, resized = 0;
    for (const d of durations) {
        const prefix = d.bookId == null ? '' : pathByBook.get(d.bookId) ?? '';
        if (!prefix) { noBook++; continue; }
        const size = sizeByKey.get(prefix + d.filename);
        if (size === undefined) gone++;
        else if (size !== Number(d.sizeBytes)) resized++;
    }
    console.log(`4. AudioTrackDuration : ${durations.length} lignes — sans livre ou sans dossier ${noBook}, fichier disparu ${gone}, taille changée ${resized}`);

    if (OUT) {
        writeFileSync(OUT, JSON.stringify({
            database: describeDatabase(DB_URL), listedAt: new Date().toISOString(), objects: all.length,
            corbeille: {
                unrecorded: unrecorded.map((o) => o.key),
                activeWithoutCopy: activeWithoutCopy.map((r) => r.id),
                purgedStillThere: purgedStillThere.map((r) => r.id),
            },
            staleBooks: stale, outside: outsideList,
            durations: { total: durations.length, noBook, gone, resized },
        }, null, 2));
        console.log(`\nDétail écrit dans ${OUT}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
