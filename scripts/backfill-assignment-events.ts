/**
 * Rattrape l'historique des attributions créées avant AssignmentEvent : une
 * ligne CREATED par attribution déjà existante, pour que « Attributions
 * traitées » (/admin/stats) ne retombe pas à zéro le jour du déploiement.
 *
 *   pnpm tsx scripts/backfill-assignment-events.ts            # rapport seul, n'écrit rien
 *   pnpm tsx scripts/backfill-assignment-events.ts --apply    # applique
 *
 * Périmètre : les mêmes attributions que l'ancienne définition de la métrique
 * (lib/stats.ts, avant son passage à AssignmentEvent) — sentToReaderDate
 * renseignée. processedByStaffId peut être vide (l'ancienne métrique comptait
 * déjà ces lignes sous « Système ») ; une attribution sans date d'envoi reste
 * hors du calcul, avant comme après.
 *
 * Volontairement étroit, comme backfill-order-events.ts : une seule ligne
 * CREATED par attribution, horodatée à sentToReaderDate. Les clôtures/
 * réouvertures passées ne sont PAS reconstituées — seules les transitions
 * FUTURES (à partir du déploiement) sont captées avec exactitude.
 *
 * Idempotent : saute toute attribution qui a déjà un AssignmentEvent (relance
 * sans risque de doublon).
 */
import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
    console.log(APPLY ? 'APPLIQUE — les événements vont être écrits\n' : 'SIMULATION — aucune écriture (--apply pour appliquer)\n');

    const candidates = await prisma.assignment.findMany({
        where: {
            sentToReaderDate: { not: null },
            events: { none: {} },
        },
        select: { id: true, sentToReaderDate: true, processedByStaffId: true, statusId: true },
        orderBy: { id: 'asc' },
    });

    console.log(`${candidates.length} attribution(s) sans AssignmentEvent, avec sentToReaderDate connue.\n`);

    if (candidates.length === 0) {
        console.log('Rien à faire.');
        return;
    }

    if (!APPLY) {
        console.log('Rien écrit (relancez avec --apply).');
        return;
    }

    const BATCH = 500;
    let done = 0;
    for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        await prisma.assignmentEvent.createMany({
            data: batch.map((a) => ({
                assignmentId: a.id,
                type: 'CREATED' as const,
                toStatusId: a.statusId,
                performedById: a.processedByStaffId,
                createdAt: a.sentToReaderDate!,
            })),
        });
        done += batch.length;
        process.stdout.write(`\r  ${done}/${candidates.length} événements créés…`);
    }
    process.stdout.write('\n');

    console.log(`\n${done} AssignmentEvent(s) CREATED créé(s).`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
