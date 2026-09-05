/**
 * READ-ONLY. Why a recorded deletion refuses to restore, and what survived where.
 *
 *   pnpm tsx scripts/diag-audit-restore.ts <bookId>
 *
 * Runs SELECT statements only — no INSERT/UPDATE/DELETE anywhere — so it is safe
 * to point at production. It uses DIRECT_URL (the session-mode pooler) like every
 * other script here, and prints the host it reached before it does anything:
 *
 *   DIRECT_URL='<prod session URL>' pnpm tsx scripts/diag-audit-restore.ts 8832
 *
 * Reads AuditEvent (14-day window) and BookMergeEvent (permanent), which is the
 * pair that answers "was anything kept, and where".
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

/** Same test the journal and the restore route apply — keep the three in step. */
const MARKER = /^\[(texte de \d+ caractères|binaire|valeur illisible)\]$/;
const MAX_PAYLOAD_CHARS = 20_000;

const DB_URL = scriptDatabaseUrl();
console.log(`DB → ${describeDatabase(DB_URL)}\n`);

/** Everything /admin/stats asks before it enables « Restaurer ». */
function blockerOf(recordId: string, snapshot: Record<string, unknown> | null): string | null {
    if (!snapshot) {
        return recordId === '*'
            ? 'ABSENT — suppression groupée, aucun instantané.'
            : 'ABSENT — aucun instantané disponible.';
    }
    const bad = Object.entries(snapshot)
        .filter(([, v]) => typeof v === 'string' && MARKER.test(v))
        .map(([k]) => k);
    return bad.length > 0 ? `INCOMPLETE — champs tronqués : ${bad.join(', ')}` : null;
}

async function inspect(bookId: string) {
    const id = Number(bookId);

    const live = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Book" WHERE id = ${id} LIMIT 1`;
    console.log(`Book n°${bookId} présent dans "Book" : ${live.length > 0}\n`);

    const events = await prisma.$queryRaw<Array<{
        id: number; at: Date; operation: string; actorEmail: string | null; snapshot: unknown;
    }>>`
        SELECT id, "createdAt" AS at, operation::text AS operation, "actorEmail", snapshot
        FROM "AuditEvent"
        WHERE model = 'Book' AND "recordId" = ${bookId}
        ORDER BY "createdAt" DESC`;

    console.log(`AuditEvent pour Book n°${bookId} : ${events.length} ligne(s)`);
    for (const e of events) {
        console.log(`\n  #${e.id}  ${e.operation}  ${e.at.toISOString()}  par ${e.actorEmail ?? '—'}`);
        if (e.operation !== 'DELETE') continue;

        const snap = e.snapshot as Record<string, unknown> | null;
        if (!snap) {
            console.log('    snapshot : NULL');
        } else {
            const size = JSON.stringify(snap).length;
            console.log(`    snapshot : ${Object.keys(snap).length} champs, ${size} car. ` +
                `(plafond ${MAX_PAYLOAD_CHARS})`);
            for (const [k, v] of Object.entries(snap)) {
                if (typeof v === 'string' && MARKER.test(v)) console.log(`      TRONQUÉ ${k} = ${v}`);
            }
            for (const k of ['id', 'title', 'author', 'isbn', 'audio_filepath']) {
                if (k in snap) console.log(`      ${k} = ${JSON.stringify(snap[k])}`);
            }
        }
        console.log(`    blocage : ${blockerOf(bookId, snap) ?? '(aucun — restaurable)'}`);
    }

    const merges = await prisma.$queryRaw<Array<{
        id: number; canonicalId: number; duplicateId: number; createdAt: Date; snapshot: unknown;
    }>>`
        SELECT id, "canonicalId", "duplicateId", "createdAt", snapshot
        FROM "BookMergeEvent"
        WHERE "duplicateId" = ${id} OR "canonicalId" = ${id}
        ORDER BY "createdAt" DESC`;

    console.log(`\nBookMergeEvent touchant ${bookId} : ${merges.length} ligne(s)`);
    for (const m of merges) {
        const snap = (m.snapshot ?? {}) as Record<string, unknown>;
        const removed = (snap.removedBook ?? null) as Record<string, unknown> | null;
        console.log(`  #${m.id}  canonical=${m.canonicalId} duplicate=${m.duplicateId} ` +
            `${m.createdAt.toISOString()}`);
        if (!removed) continue;
        console.log(`    removedBook : ${Object.keys(removed).length} champs, ` +
            `title=${JSON.stringify(removed.title)}`);
        for (const [k, v] of Object.entries(removed)) {
            if (typeof v === 'string' && v.length > 500) {
                console.log(`      ${k} : ${v.length} car., conservés INTÉGRALEMENT ici`);
            }
        }
    }
}

const bookId = process.argv[2];
if (!bookId || !/^\d+$/.test(bookId)) {
    console.error('Usage : pnpm tsx scripts/diag-audit-restore.ts <bookId>');
    process.exit(1);
}

inspect(bookId)
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
