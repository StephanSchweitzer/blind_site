/**
 * Persist the audio-link state into the database.
 *
 *   pnpm tsx scripts/sync-audio-links.ts --dry-run   # report only, writes nothing
 *   pnpm tsx scripts/sync-audio-links.ts
 *
 * Reads the bucket, compares it with Book.audio_filepath, and records the result:
 *
 *   Book.audioLinkStatus  OK | FOLDER_EMPTY | FOLDER_MISSING | NO_PATH
 *   Book.audioTrackCount  number of audio files in the folder (OK only)
 *   Book.audioCheckedAt   when this ran
 *   OrphanAudioFolder     one row per bucket folder no book points at
 *
 * NOTHING IN THE BUCKET IS TOUCHED. No copies, no renames, no deletes — the
 * audio stays exactly where it is; only rows describing it are written.
 *
 * Safe to re-run: it's a full reconciliation, not an append. Orphans that are
 * still orphans get lastSeenAt bumped; folders that stopped being orphans (an
 * admin relinked them, or they were removed) have their row deleted, except
 * rows an admin dismissed — those are kept so the decision isn't lost.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { dbPathToPrefix, groupByFolder, parseFolder, inspectFolder } from './audio-match-rules';

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const DRY_RUN = args.includes('--dry-run');

const BUCKET = process.env.S3_AUDIO_BUCKET!;
const ROOT = arg('root') ?? 'dirt/';

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

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Status = 'OK' | 'FOLDER_EMPTY' | 'FOLDER_MISSING' | 'NO_PATH';

async function main() {
    if (DRY_RUN) console.log('DRY RUN — aucune écriture\n');
    console.log(`Bucket ${BUCKET} — racine "${ROOT}"`);

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

    const audio = objects.filter((o) => AUDIO_EXT.test(o.key));
    const folders = groupByFolder(audio); // folders holding at least one track
    const allFolders = groupByFolder(objects); // including placeholder-only folders
    console.log(`${folders.size} dossiers avec audio, ${audio.length} pistes\n`);

    const books = await prisma.book.findMany({
        select: { id: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });

    const ids: number[] = [];
    const statuses: Status[] = [];
    const trackCounts: (number | null)[] = [];
    const claimed = new Set<string>();
    const tally: Record<Status, number> = { OK: 0, FOLDER_EMPTY: 0, FOLDER_MISSING: 0, NO_PATH: 0 };

    for (const b of books) {
        let status: Status;
        let tracks: number | null = null;

        if (!b.audio_filepath?.trim()) {
            status = 'NO_PATH';
        } else {
            const prefix = dbPathToPrefix(b.audio_filepath, ROOT);
            const sections = folders.get(prefix);
            if (sections) {
                status = 'OK';
                tracks = sections.length;
                claimed.add(prefix);
            } else {
                status = allFolders.has(prefix) ? 'FOLDER_EMPTY' : 'FOLDER_MISSING';
            }
        }

        tally[status]++;
        ids.push(b.id);
        statuses.push(status);
        trackCounts.push(tracks);
    }

    console.log('Livres');
    for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(15)} ${v}`);

    const orphans = [...folders.entries()].filter(([prefix]) => !claimed.has(prefix));
    console.log(`\nDossiers orphelins : ${orphans.length}`);

    if (DRY_RUN) {
        console.log('\nRien écrit (--dry-run).');
        return;
    }

    // --- Books: one statement per chunk rather than 15k round trips ----------
    const CHUNK = 5000;
    let written = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
        const idChunk = ids.slice(i, i + CHUNK);
        const stChunk = statuses.slice(i, i + CHUNK);
        const tcChunk = trackCounts.slice(i, i + CHUNK);
        written += await prisma.$executeRawUnsafe(
            `UPDATE "Book" b
               SET "audioLinkStatus" = v.status::"AudioLinkStatus",
                   "audioTrackCount" = v.tc,
                   "audioCheckedAt"  = NOW()
              FROM (SELECT unnest($1::int[])  AS id,
                           unnest($2::text[]) AS status,
                           unnest($3::int[])  AS tc) v
             WHERE b.id = v.id`,
            idChunk,
            stChunk,
            tcChunk,
        );
        process.stdout.write(`\r  ${written} livres mis à jour…`);
    }
    process.stdout.write('\n');

    // --- Orphans: upsert the current set, drop the ones that resolved -------
    const seen: string[] = [];
    for (const [prefix, sections] of orphans) {
        const info = inspectFolder(sections);
        const f = parseFolder(prefix);
        const data = {
            year: f.year,
            folderNum: f.num,
            title: f.title,
            trackCount: info.count,
            bytes: BigInt(info.bytes),
        };
        await prisma.orphanAudioFolder.upsert({
            where: { prefix },
            create: { prefix, ...data },
            update: data,
        });
        seen.push(prefix);
    }

    // Folders that are no longer orphaned. Dismissed rows survive so an admin's
    // "this is junk" decision isn't silently undone by the next run.
    //
    // `notIn: []` matches every row, so an empty orphan set would wipe the table.
    // That only happens if the listing came back empty — a bucket or credential
    // problem, not a real result. Refuse rather than destroy the queue.
    const removed =
        seen.length > 0
            ? await prisma.orphanAudioFolder.deleteMany({
                  where: { prefix: { notIn: seen }, dismissedAt: null },
              })
            : { count: 0 };
    if (!seen.length) console.log('  (aucun orphelin listé — suppression ignorée par sécurité)');

    const dismissed = await prisma.orphanAudioFolder.count({ where: { dismissedAt: { not: null } } });
    console.log(`  ${seen.length} orphelins enregistrés, ${removed.count} périmés supprimés`);
    console.log(`  ${dismissed} écartés par un admin (conservés)`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
