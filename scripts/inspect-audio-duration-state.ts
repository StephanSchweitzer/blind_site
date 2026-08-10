/**
 * What state is this database in, for the reading-duration work?
 *
 *   pnpm tsx scripts/inspect-audio-duration-state.ts
 *   pnpm tsx scripts/inspect-audio-duration-state.ts --book=1234
 *   pnpm tsx scripts/inspect-audio-duration-state.ts --title=pahlavi
 *
 * STRICTLY READ-ONLY — every statement is a SELECT.
 *
 * Answers three questions before anything is changed:
 *
 *   1. are the two hand-applied migrations present (AudioTrackEvent
 *      .durationSeconds, and the AudioTrackDuration cache table)? The backfill
 *      and the « Recalculer » button both fail with P2022 without them.
 *   2. how much of the catalogue currently has a duration, so the backfill's
 *      effect can be stated rather than guessed.
 *   3. for a named book, the full picture of it and of any duplicate it is
 *      paired with — which is what a stuck review card needs before anyone
 *      decides how to unstick it.
 */
import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const ONLY_BOOK = arg('book') ? Number(arg('book')) : undefined;
const TITLE = arg('title');

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

const bar = (label: string) => `\n${label}\n${'─'.repeat(label.length)}`;

/** Does a column exist? Asked of the catalogue, so a missing table is not an error. */
async function hasColumn(table: string, column: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = ${table}
           AND column_name = ${column}`;
    return Number(rows[0]?.n ?? 0) > 0;
}

async function hasTable(table: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
          FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ${table}`;
    return Number(rows[0]?.n ?? 0) > 0;
}

async function schemaState() {
    console.log(bar('1. État du schéma'));
    const durationCol = await hasColumn('AudioTrackEvent', 'durationSeconds');
    const cacheTable = await hasTable('AudioTrackDuration');
    console.log(`  AudioTrackEvent.durationSeconds  ${durationCol ? 'présent' : 'ABSENT'}`);
    console.log(`  Table AudioTrackDuration         ${cacheTable ? 'présente' : 'ABSENTE'}`);
    if (!durationCol || !cacheTable) {
        console.log('\n  → migrations manuelles à appliquer avant toute mesure :');
        if (!durationCol) console.log('    prisma/migrations/manual/20260809214500_add_audio_track_duration.sql');
        if (!cacheTable) console.log('    prisma/migrations/manual/20260810120000_add_audio_track_duration_cache.sql');
    }
    return { durationCol, cacheTable };
}

async function coverage(cacheTable: boolean) {
    console.log(bar('2. Couverture des durées'));
    const [total, withAudio, withDuration, audioNoDuration] = await Promise.all([
        prisma.book.count(),
        prisma.book.count({ where: { audioLinkStatus: 'OK', audio_filepath: { not: null } } }),
        prisma.book.count({ where: { readingDurationMinutes: { not: null, gt: 0 } } }),
        prisma.book.count({
            where: {
                audioLinkStatus: 'OK',
                audio_filepath: { not: null },
                OR: [{ readingDurationMinutes: null }, { readingDurationMinutes: 0 }],
            },
        }),
    ]);
    console.log(`  Livres au catalogue                 ${total}`);
    console.log(`  … avec audio (statut OK)            ${withAudio}`);
    console.log(`  … avec une durée renseignée         ${withDuration}`);
    console.log(`  … avec audio MAIS sans durée        ${audioNoDuration}   ← cible du backfill`);

    if (cacheTable) {
        const measured = await prisma.audioTrackDuration.count();
        console.log(`  Pistes déjà mesurées en cache       ${measured}`);
    }
}

interface Row {
    id: number;
    title: string;
    author: string;
    audio_filepath: string | null;
    audioLinkStatus: string | null;
    audioTrackCount: number | null;
    audioSizeKb: number | null;
    readingDurationMinutes: number | null;
    needsReview: boolean;
    id_arbre: number | null;
    source_access_id: number | null;
}

const SELECT = {
    id: true,
    title: true,
    author: true,
    audio_filepath: true,
    audioLinkStatus: true,
    audioTrackCount: true,
    audioSizeKb: true,
    readingDurationMinutes: true,
    needsReview: true,
    id_arbre: true,
    source_access_id: true,
} as const;

function show(label: string, b: Row | null) {
    if (!b) {
        console.log(`  ${label}: (aucun)`);
        return;
    }
    console.log(`  ${label}  #${b.id} « ${b.title} » — ${b.author}`);
    console.log(`    dossier      ${b.audio_filepath ?? '(aucun)'}`);
    console.log(`    statut       ${b.audioLinkStatus ?? '(null)'}   pistes ${b.audioTrackCount ?? '—'}   poids ${b.audioSizeKb ?? '—'} Kio`);
    console.log(`    durée        ${b.readingDurationMinutes ?? '(non calculée)'}`);
    console.log(`    review       needsReview=${b.needsReview}  id_arbre=${b.id_arbre ?? '—'}  source_access_id=${b.source_access_id ?? '—'}`);
}

async function inspectBooks() {
    console.log(bar('3. Fiche(s) demandée(s)'));
    const books = (await prisma.book.findMany({
        where: ONLY_BOOK
            ? { id: ONLY_BOOK }
            : { title: { contains: TITLE!, mode: 'insensitive' } },
        select: SELECT,
        orderBy: { id: 'asc' },
        take: 20,
    })) as Row[];

    if (!books.length) {
        console.log('  Aucun livre ne correspond.');
        return;
    }

    for (const b of books) {
        console.log('');
        show('fiche  ', b);

        // The duplicate it is paired with, if any — id_arbre points at the
        // source_access_id of the record it should be compared against.
        if (b.id_arbre != null) {
            const match = (await prisma.book.findFirst({
                where: { source_access_id: b.id_arbre },
                select: SELECT,
            })) as Row | null;
            show('rapproché', match);
        }
        // And any record pointing AT this one, which is how the pair reads from
        // the other side.
        if (b.source_access_id != null) {
            const pointing = (await prisma.book.findMany({
                where: { id_arbre: b.source_access_id, id: { not: b.id } },
                select: SELECT,
            })) as Row[];
            for (const p of pointing) show('signalé ', p);
        }

        const [events, trashed, orders, assignments, coups] = await Promise.all([
            prisma.audioTrackEvent.count({ where: { bookId: b.id } }),
            prisma.deletedAudioTrack.count({ where: { bookId: b.id, restoredAt: null } }),
            prisma.orders.count({ where: { catalogueId: b.id } }),
            prisma.assignment.count({ where: { catalogueId: b.id } }),
            prisma.coupsDeCoeurBooks.count({ where: { bookId: b.id } }),
        ]);
        console.log(`    journal      ${events} évènement(s) audio, ${trashed} piste(s) en corbeille`);
        // These are exactly what the DELETE route refuses on — see
        // app/api/books/[id]/route.ts. A non-zero pair is why a fiche cannot be
        // deleted from the back office.
        console.log(
            `    références   ${orders} demande(s), ${assignments} attribution(s), ${coups} coup(s) de cœur` +
                (orders + assignments > 0 ? '   ← suppression refusée' : ''),
        );
    }
}

async function main() {
    console.log('INSPECTION — lecture seule, aucune écriture');
    console.log(`  base ${describeDatabase(DB_URL)}`);

    const { cacheTable } = await schemaState();
    await coverage(cacheTable);
    if (ONLY_BOOK || TITLE) await inspectBooks();
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
