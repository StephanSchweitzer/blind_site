/**
 * Look at both sides. Nothing clever — print what the database stores in
 * Book.audio_filepath next to the folder names that actually exist in the
 * bucket, so the link between them is visible.
 *
 *   pnpm tsx scripts/peek-audio-paths.ts
 *
 * Read-only. Lists at most --max objects (default 3000) so it returns fast.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const MAX = Number(arg('max') ?? 3000);

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// B2 shows the endpoint as a bare host; the SDK needs a URL.
const endpoint = process.env.S3_ENDPOINT
    ? /^https?:\/\//i.test(process.env.S3_ENDPOINT)
        ? process.env.S3_ENDPOINT
        : `https://${process.env.S3_ENDPOINT}`
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

async function main() {
    const total = await prisma.book.count();
    const withPath = await prisma.book.count({ where: { audio_filepath: { not: null } } });
    console.log(`Livres : ${total} — dont ${withPath} avec audio_filepath\n`);

    const books = await prisma.book.findMany({
        where: { audio_filepath: { not: null } },
        select: { id: true, title: true, audio_filepath: true, id_arbre: true, source_access_id: true },
        take: 20,
        orderBy: { id: 'asc' },
    });

    console.log('--- BASE (20 premiers) ---');
    for (const b of books) {
        console.log(`id=${b.id}  arbre=${b.id_arbre ?? '-'}  access=${b.source_access_id ?? '-'}`);
        console.log(`   ${JSON.stringify(b.audio_filepath)}`);
    }

    console.log(`\n--- BUCKET (${process.env.S3_AUDIO_BUCKET}) ---`);
    const keys: string[] = [];
    let token: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: process.env.S3_AUDIO_BUCKET,
                ContinuationToken: token,
            }),
        );
        for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token && keys.length < MAX);

    console.log(`${keys.length} objets échantillonnés`);
    console.log('\nPremières clés brutes :');
    for (const k of keys.slice(0, 5)) console.log(`   ${JSON.stringify(k)}`);

    const folders = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/') + 1)))];
    console.log(`\n${folders.length} dossiers distincts dans l'échantillon. 20 premiers :`);
    for (const f of folders.slice(0, 20)) console.log(`   ${JSON.stringify(f)}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
