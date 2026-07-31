/**
 * Rewrite Book.audio_filepath from the legacy NAS path to the bucket prefix.
 *
 *   pnpm tsx scripts/backfill-audio-paths.ts --dry-run   # report only
 *   pnpm tsx scripts/backfill-audio-paths.ts
 *
 *   T:\2022\21525  Le secret de l!abbé Saunière
 *   → dirt/2022/21525  Le secret de l!abbé Saunière/
 *
 * After this the column IS the bucket key: `Prefix: book.audio_filepath` needs
 * no translation, and new uploads write the same format old rows carry.
 *
 * Safety:
 *  - only rows whose folder was verified to exist (audioLinkStatus = OK) are
 *    touched; the 67 broken ones keep their legacy value so they stay visibly
 *    broken rather than looking migrated;
 *  - every original is copied into AudioFilepathBackup first, in the SAME
 *    transaction as the update — the rewrite is one-way, since trailing dots
 *    stripped for Windows cannot be reconstructed;
 *  - rows already in bucket format are skipped (the translation is idempotent),
 *    so re-running is harmless.
 *
 * Reads nothing from the bucket and writes nothing to it.
 */
import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { dbPathToPrefix } from './audio-match-rules';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const DRY_RUN = args.includes('--dry-run');
const ROOT = arg('root') ?? 'dirt/';

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
    if (DRY_RUN) console.log('DRY RUN — aucune écriture\n');

    const books = await prisma.book.findMany({
        where: { audioLinkStatus: 'OK', audio_filepath: { not: null } },
        select: { id: true, audio_filepath: true },
        orderBy: { id: 'asc' },
    });
    console.log(`Livres éligibles (audioLinkStatus = OK) : ${books.length}`);

    const ids: number[] = [];
    const oldPaths: string[] = [];
    const newPaths: string[] = [];
    let alreadyDone = 0;

    for (const b of books) {
        const oldPath = b.audio_filepath!;
        const newPath = dbPathToPrefix(oldPath, ROOT);
        if (oldPath === newPath) {
            alreadyDone++;
            continue;
        }
        ids.push(b.id);
        oldPaths.push(oldPath);
        newPaths.push(newPath);
    }

    console.log(`  déjà au format bucket : ${alreadyDone}`);
    console.log(`  à réécrire            : ${ids.length}`);

    if (ids.length) {
        console.log('\nExemples :');
        for (let i = 0; i < Math.min(3, ids.length); i++) {
            console.log(`  ${JSON.stringify(oldPaths[i])}`);
            console.log(`  → ${JSON.stringify(newPaths[i])}`);
        }
    }

    if (DRY_RUN || !ids.length) {
        if (DRY_RUN) console.log('\nRien écrit (--dry-run).');
        return;
    }

    // Backup and update together: a crash between them would lose the originals.
    const CHUNK = 5000;
    let backedUp = 0;
    let updated = 0;

    await prisma.$transaction(
        async (tx) => {
            for (let i = 0; i < ids.length; i += CHUNK) {
                const idChunk = ids.slice(i, i + CHUNK);
                const oldChunk = oldPaths.slice(i, i + CHUNK);
                const newChunk = newPaths.slice(i, i + CHUNK);

                backedUp += await tx.$executeRawUnsafe(
                    `INSERT INTO "AudioFilepathBackup" ("bookId", "oldPath", "newPath")
                     SELECT unnest($1::int[]), unnest($2::text[]), unnest($3::text[])
                     ON CONFLICT ("bookId") DO NOTHING`,
                    idChunk,
                    oldChunk,
                    newChunk,
                );

                updated += await tx.$executeRawUnsafe(
                    `UPDATE "Book" b
                        SET "audio_filepath" = v.path
                       FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS path) v
                      WHERE b.id = v.id`,
                    idChunk,
                    newChunk,
                );
                process.stdout.write(`\r  ${updated}/${ids.length}…`);
            }
        },
        { timeout: 120_000 },
    );

    process.stdout.write('\n');
    console.log(`  ${backedUp} originaux sauvegardés dans AudioFilepathBackup`);
    console.log(`  ${updated} chemins réécrits`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
