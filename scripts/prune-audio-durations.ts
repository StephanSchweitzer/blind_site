/**
 * AudioTrackDuration rows that describe no current file.
 *
 *   pnpm tsx scripts/prune-audio-durations.ts            # report only
 *   pnpm tsx scripts/prune-audio-durations.ts --apply    # then delete them
 *
 * The table is a CACHE of measured durations (lib/audio/measure.ts), keyed on
 * book, filename and size; it is not an append-only log, and every row here can
 * be measured again by pressing « Mesurer ». Rows nothing will ever read again:
 *
 *  - `bookId` NULL — the book row was really deleted (SetNull); no fiche, no
 *    folder, nothing can look the row up;
 *  - the book has no folder any more;
 *  - the file is no longer in the book's folder (deleted, renamed outside the
 *    portal, folder moved).
 *
 * A row whose file is there at another SIZE is left alone: the next measure of
 * that book replaces it, and it is never read meanwhile (the size is part of
 * the key).
 *
 * The production database turns read-only past 500 MB, and this table was its
 * largest (53 MB on dev, November 2026) — but almost all of that is one row per
 * track that exists; this prune takes back well under 1 %. Report first, and
 * delete only with --apply. It refuses when more than MAX_SHARE of the table
 * would go: a listing that came back short (a wrong bucket, a wrong .env) must
 * not empty the cache.
 *
 * Reads the whole bucket once (ListObjectsV2) and deletes nothing in it.
 */
import 'dotenv/config';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getS3, AUDIO_BUCKET, listRawObjects } from '../lib/audio/bucket-core';
import { TRASH_PREFIX } from '../lib/audio/trash-prefix';
import { resolvePrefix } from '../lib/audio/prefix';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const APPLY = process.argv.includes('--apply');
const MAX_SHARE = 0.05;
const BATCH = 1000;

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

async function liveKeys(): Promise<Set<string>> {
    const roots = await getS3().send(new ListObjectsV2Command({ Bucket: AUDIO_BUCKET, Delimiter: '/' }));
    const keys = new Set<string>();
    for (const p of roots.CommonPrefixes ?? []) {
        if (!p.Prefix || p.Prefix === TRASH_PREFIX) continue;
        for (const o of await listRawObjects(p.Prefix)) keys.add(o.key);
    }
    return keys;
}

async function main() {
    console.log(`Base : ${describeDatabase(DB_URL)} · stockage : ${AUDIO_BUCKET} · ${APPLY ? 'SUPPRESSION' : 'rapport seul'}`);
    const keys = await liveKeys();
    console.log(`${keys.size} objets hors corbeille listés`);
    if (!keys.size) throw new Error('Le stockage n’a rien listé : rien ne sera supprimé.');

    const books = await prisma.book.findMany({ select: { id: true, audio_filepath: true } });
    const prefixOf = new Map(books.map((b) => [b.id, resolvePrefix(b.audio_filepath)]));
    const rows = await prisma.audioTrackDuration.findMany({ select: { id: true, bookId: true, filename: true } });

    const reasons = { sansLivre: 0, sansDossier: 0, fichierDisparu: 0 };
    const doomed: number[] = [];
    const byBook = new Map<number, number>();
    for (const r of rows) {
        if (r.bookId == null) { reasons.sansLivre++; doomed.push(r.id); continue; }
        const prefix = prefixOf.get(r.bookId) ?? '';
        if (!prefix) { reasons.sansDossier++; doomed.push(r.id); continue; }
        if (!keys.has(prefix + r.filename)) {
            reasons.fichierDisparu++;
            doomed.push(r.id);
            byBook.set(r.bookId, (byBook.get(r.bookId) ?? 0) + 1);
        }
    }

    console.log(`${rows.length} lignes ; à supprimer : ${doomed.length}`, reasons);
    const top = [...byBook].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top.length) console.log('Livres les plus concernés (fichier disparu) :', top.map(([id, n]) => `#${id} (${n})`).join(', '));

    if (!APPLY || !doomed.length) {
        if (!APPLY) console.log('\nRien supprimé. Relancez avec --apply pour supprimer ces lignes.');
        return;
    }
    if (doomed.length > rows.length * MAX_SHARE) {
        throw new Error(
            `Refusé : ${doomed.length} lignes sur ${rows.length} (plus de ${MAX_SHARE * 100} %). ` +
                'Le listing est probablement incomplet — vérifiez le stockage et la base visés.',
        );
    }
    let deleted = 0;
    for (let i = 0; i < doomed.length; i += BATCH) {
        const res = await prisma.audioTrackDuration.deleteMany({ where: { id: { in: doomed.slice(i, i + BATCH) } } });
        deleted += res.count;
    }
    console.log(`${deleted} lignes supprimées.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
