/**
 * Rattrape l'historique des demandes créées avant OrderEvent : une ligne CREATED
 * par demande déjà existante, pour que « Demandes traitées » (/admin/stats) ne
 * retombe pas à zéro le jour du déploiement.
 *
 *   pnpm tsx scripts/backfill-order-events.ts            # rapport seul, n'écrit rien
 *   pnpm tsx scripts/backfill-order-events.ts --apply    # applique
 *
 * Périmètre : les mêmes demandes que l'ancienne définition de la métrique
 * (lib/stats.ts, avant son passage à OrderEvent) — createdDate ET
 * processedByStaffId renseignés. Une demande sans l'un des deux n'a jamais pu
 * être attribuée et reste hors du calcul, avant comme après.
 *
 * Volontairement étroit : une seule ligne CREATED par demande, horodatée à
 * createdDate. Les clôtures/réouvertures passées ne sont PAS reconstituées —
 * on ne sait pas de façon fiable qui a fermé une demande historique ni quand
 * précisément (closureDate est une date de calendrier, pas un acteur), et
 * deviner l'auteur risquerait de créditer la mauvaise personne. Seules les
 * transitions FUTURES (à partir du déploiement) sont donc captées avec
 * exactitude ; l'historique garde la même couverture qu'avant, ni plus ni
 * moins.
 *
 * Idempotent : saute toute demande qui a déjà un OrderEvent (relance sans
 * risque de doublon).
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

    const candidates = await prisma.orders.findMany({
        where: {
            createdDate: { not: null },
            processedByStaffId: { not: null },
            events: { none: {} },
        },
        select: { id: true, createdDate: true, processedByStaffId: true, statusId: true },
        orderBy: { id: 'asc' },
    });

    console.log(`${candidates.length} demande(s) sans OrderEvent, avec createdDate + permanent connus.\n`);

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
        await prisma.orderEvent.createMany({
            data: batch.map((o) => ({
                orderId: o.id,
                type: 'CREATED' as const,
                toStatusId: o.statusId,
                performedById: o.processedByStaffId,
                createdAt: o.createdDate!,
            })),
        });
        done += batch.length;
        process.stdout.write(`\r  ${done}/${candidates.length} événements créés…`);
    }
    process.stdout.write('\n');

    console.log(`\n${done} OrderEvent(s) CREATED créé(s).`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
