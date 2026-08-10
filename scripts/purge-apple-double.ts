/**
 * Remove the macOS AppleDouble stubs the migration brought into the bucket.
 *
 *   pnpm tsx scripts/purge-apple-double.ts             # inspect, delete nothing
 *   pnpm tsx scripts/purge-apple-double.ts --confirm   # delete the verified ones
 *
 * Copying from a Mac onto a non-Mac filesystem writes a `._name.ext` beside
 * every `name.ext`, holding the resource fork. They carry the audio extension of
 * the file they describe and none of its content, so they passed every filter
 * and were counted as tracks — doubling the reported track count of ~160 books
 * and blocking their reading duration outright. They are ignored everywhere now
 * (isAudioKey) and refused on upload (isAppleDoubleName); this clears out the
 * ones already stored.
 *
 * ## Three independent checks before anything is deleted
 *
 * Nothing here trusts the filename alone. A key is only deleted when ALL of:
 *
 *   1. the name matches the AppleDouble pattern;
 *   2. the object is small — a real recording is megabytes, a stub is hundreds
 *      of bytes;
 *   3. its first four bytes are the AppleDouble magic number 00 05 16 07.
 *
 * (3) is what makes this safe rather than merely plausible: it is a statement
 * about the file's content, and no MP3 begins with those bytes. Anything failing
 * any check is reported and left alone.
 *
 * The sibling recording is also required to exist. A stub whose real file is
 * missing is the one case worth a human look — it would mean the recording was
 * lost and only its metadata survived — so those are listed, never deleted.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { deleteTracks } from '../lib/audio/bucket-core';
import { isAppleDoubleName } from '../lib/audio/naming';
import { TRASH_PREFIX } from '../lib/audio/trash-prefix';
import { pool } from '../lib/concurrency';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const CONFIRM = args.includes('--confirm');
const ROOT = arg('root') ?? '';
const CONCURRENCY = 12;

/** A stub is a few hundred bytes; anything approaching a real track is refused. */
const MAX_STUB_BYTES = 64 * 1024;
/** AppleDouble magic number. */
const MAGIC = [0x00, 0x05, 0x16, 0x07];

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
const Bucket = process.env.S3_AUDIO_BUCKET!;

async function listAll(prefix: string) {
    const out: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const o of res.Contents ?? []) {
            if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
        process.stdout.write(`\r  ${out.length} objets listés…`);
    } while (token);
    process.stdout.write('\n');
    return out;
}

/** `dir/1000 ._1 Titre.mp3` → `dir/1000 1 Titre.mp3`. */
function siblingKey(key: string): string {
    const cut = key.lastIndexOf('/') + 1;
    return key.slice(0, cut) + key.slice(cut).replace(/(^|\s)\._/, '$1');
}

async function main() {
    console.log(`PURGE DES FICHIERS APPLEDOUBLE${CONFIRM ? '' : ' — SIMULATION'}`);
    console.log(`  bucket ${Bucket}\n`);

    const all = await listAll(ROOT);
    const present = new Set(all.map((o) => o.key));

    // The corbeille is off limits, explicitly rather than by accident. Every
    // object under it is named by a DeletedAudioTrack row, and removing one
    // would turn that row's restore into a failure. Stubs in there were parked
    // by a deletion and are the corbeille's own business — its purge handles
    // them on the same terms as everything else it holds.
    const candidates = all.filter(
        (o) => isAppleDoubleName(o.key) && !o.key.startsWith(TRASH_PREFIX),
    );
    const inTrash = all.filter(
        (o) => isAppleDoubleName(o.key) && o.key.startsWith(TRASH_PREFIX),
    ).length;
    if (inTrash) {
        console.log(`  ${inTrash} stubs dans ${TRASH_PREFIX} — ignorés (gérés par la corbeille)`);
    }
    console.log(`  ${candidates.length} candidats sur ${all.length} objets\n`);
    if (!candidates.length) return;

    const verified: string[] = [];
    const refused: { key: string; why: string }[] = [];

    await pool(candidates, CONCURRENCY, async (o) => {
        if (o.size > MAX_STUB_BYTES) {
            refused.push({ key: o.key, why: `taille inattendue (${o.size} octets)` });
            return;
        }
        if (!present.has(siblingKey(o.key))) {
            refused.push({ key: o.key, why: 'enregistrement correspondant introuvable' });
            return;
        }
        try {
            const res = await s3.send(
                new GetObjectCommand({ Bucket, Key: o.key, Range: 'bytes=0-3' }),
            );
            const b = await res.Body!.transformToByteArray();
            if (MAGIC.some((m, i) => b[i] !== m)) {
                refused.push({
                    key: o.key,
                    why: `signature inattendue (${[...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')})`,
                });
                return;
            }
        } catch (e) {
            refused.push({ key: o.key, why: `lecture impossible : ${(e as Error).message}` });
            return;
        }
        verified.push(o.key);
    });

    const bytes = candidates
        .filter((c) => verified.includes(c.key))
        .reduce((s, c) => s + c.size, 0);
    console.log(`  Vérifiés (nom + taille + signature + jumeau présent) : ${verified.length}`);
    console.log(`  Écartés                                              : ${refused.length}`);
    console.log(`  Espace récupérable                                   : ${(bytes / 1024 / 1024).toFixed(1)} Mio`);

    if (refused.length) {
        console.log('\n  Écartés (laissés en place) :');
        for (const r of refused.slice(0, 20)) console.log(`    ${r.key}\n      → ${r.why}`);
        if (refused.length > 20) console.log(`    … et ${refused.length - 20} autres`);
    }

    if (!CONFIRM) {
        console.log('\n  Simulation : rien n’a été supprimé. Relancez avec --confirm.');
        return;
    }

    // The list is written before the deletion, not after: if the run dies part
    // way, what was targeted is still on disk to compare against.
    const file = `applesdouble-supprimes-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    writeFileSync(file, verified.join('\n'), 'utf8');
    console.log(`\n  Liste écrite : ${file}`);

    const { failed } = await deleteTracks(verified);
    console.log(`  Supprimés : ${verified.length - failed.length}`);
    if (failed.length) {
        console.log(`  Échecs    : ${failed.length}`);
        for (const k of failed.slice(0, 10)) console.log(`    ${k}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
