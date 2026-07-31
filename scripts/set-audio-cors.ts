/**
 * Set the bucket CORS rule that lets the browser PUT straight to B2.
 *
 * The B2 web console can only express "no origins / every origin / all HTTPS /
 * one origin", none of which fit: we need two specific origins AND the PUT
 * method. Its own UI points at the B2 CLI for that, but the S3-compatible API
 * exposes PutBucketCors, so the credentials we already have are enough.
 *
 * Note the shape is S3's (AllowedMethods: GET/HEAD/PUT), not B2's native
 * `s3_get`/`s3_put` naming — B2 maps one onto the other.
 */
import 'dotenv/config';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_AUDIO_BUCKET!;
const raw = process.env.S3_ENDPOINT;
const endpoint = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : undefined;

const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
});

const RULES = [
    {
        ID: 'eca-portal-audio',
        AllowedOrigins: ['https://eca-aveugles.fr', 'http://localhost:3000'],
        // PUT = upload. GET/HEAD cover ranged playback if a media element is
        // ever given crossorigin. DELETE is deliberately absent: deletion is
        // server-side only.
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['etag'],
        MaxAgeSeconds: 3600,
    },
];

async function main() {
    console.log(`Bucket ${BUCKET}`);
    try {
        const before = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
        console.log('Règles existantes :', JSON.stringify(before.CORSRules, null, 2));
    } catch (e) {
        console.log(`Règles existantes : aucune (${(e as Error).name})`);
    }

    await s3.send(
        new PutBucketCorsCommand({
            Bucket: BUCKET,
            CORSConfiguration: { CORSRules: RULES },
        }),
    );
    console.log('\nPutBucketCors envoyé.');

    // Read back rather than trust the write.
    const after = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    console.log('\nRègles en place :\n' + JSON.stringify(after.CORSRules, null, 2));
}

main().catch((e) => {
    console.error(`\nÉCHEC : ${(e as Error).name}: ${(e as Error).message}`);
    process.exitCode = 1;
});
