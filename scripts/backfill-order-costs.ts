/**
 * Rattrape les tarifs des demandes non facturées sur le poids de l'enregistrement.
 *
 *   pnpm tsx scripts/backfill-order-costs.ts            # rapport seul, n'écrit rien
 *   pnpm tsx scripts/backfill-order-costs.ts --apply    # applique
 *
 * Le tarif est de 3 € par tranche de 700 Mio entamée (lib/pricing.ts). Deux
 * mécanismes le tiennent à jour tout seuls : les formulaires le proposent à la
 * saisie, et repriceOpenOrdersForBook le recalcule dès qu'un enregistrement
 * arrive dans le bucket. Restent deux trous que ce script comble :
 *   • les demandes créées avant tout ça ;
 *   • un `sync-audio-links` qui révèle le poids d'un dossier en masse — il écrit
 *     les colonnes en SQL brut, sans passer par refreshBookAudioState, donc sans
 *     retarifer. Lancer ce script après une resynchronisation complète.
 *
 * Périmètre — volontairement étroit, parce qu'un tarif est de l'argent : la même
 * définition qu'à chaud, ADJUSTABLE_ORDER_WHERE (demande active, « Non facturé »,
 * sans facture ou sur un brouillon), plus un livre au poids connu. Donc jamais
 * une demande « Non facturable », jamais une facture émise, payée ou soldée :
 * celles-là sont verrouillées ou déjà imprimées, et les rouvrir est une décision
 * humaine, pas celle d'un script.
 *
 * Écrit par facture touchée : le total est recalculé et un BillEvent
 * AMOUNT_CHANGED est ajouté (journal en append-only, jamais modifié). La logique
 * reprend celle de recomputeBillTotal / logBillEvent dans lib/billing.ts ; elle
 * est refaite ici pour que le script reste autonome, comme sync-audio-links.ts —
 * les helpers de lib/ passent par les alias `@/…` que ces scripts n'utilisent pas.
 *
 * Le passage par un client Prisma propre au script contourne aussi l'extension
 * d'audit : les modifications n'apparaîtront pas dans AuditEvent. C'est déjà le
 * cas des autres scripts, et le BillEvent garde la trace côté facturation.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import { ADJUSTABLE_ORDER_WHERE, suggestedCostEuros, formatSizeKb, cdCount } from '../lib/pricing';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});

async function main() {
    console.log(`Base ${describeDatabase(DB_URL)}`);
    console.log(APPLY ? 'APPLIQUE — les tarifs vont être écrits\n' : 'SIMULATION — aucune écriture (--apply pour appliquer)\n');

    const orders = await prisma.orders.findMany({
        where: {
            ...ADJUSTABLE_ORDER_WHERE,
            catalogue: { audioSizeKb: { not: null } },
        },
        select: {
            id: true,
            cost: true,
            billId: true,
            catalogue: { select: { id: true, title: true, audioSizeKb: true } },
        },
        orderBy: { id: 'asc' },
    });

    const changes = orders
        .map((o) => {
            const sizeKb = o.catalogue.audioSizeKb!;
            const newCost = new Prisma.Decimal(suggestedCostEuros(sizeKb));
            return { order: o, sizeKb, newCost };
        })
        // `.equals` and not `!==`: 3 et 3.00 sont le même montant, et réécrire
        // une ligne identique ajouterait un AMOUNT_CHANGED qui ne raconte rien.
        .filter((c) => !(c.order.cost ?? new Prisma.Decimal(0)).equals(c.newCost));

    console.log(`${orders.length} demandes dans le périmètre, ${changes.length} à ajuster\n`);

    if (changes.length === 0) {
        console.log('Rien à faire.');
        return;
    }

    for (const c of changes) {
        const before = c.order.cost?.toFixed(2) ?? '—';
        const title = c.order.catalogue.title.slice(0, 42).padEnd(42);
        console.log(
            `  #${String(c.order.id).padStart(6)}  ${title}  ` +
                `${formatSizeKb(c.sizeKb).padStart(10)}  ${String(cdCount(c.sizeKb)).padStart(2)} CD  ` +
                `${before.padStart(7)} € → ${c.newCost.toFixed(2).padStart(7)} €`,
        );
    }

    // Un coût nul n'est pas un coût à zéro : une demande jamais tarifée vaut null,
    // et n'a donc aucune gratuité à protéger. Seul un 0 € écrit à la main compte.
    const zeroed = changes.filter((c) => c.order.cost != null && c.order.cost.isZero());
    if (zeroed.length) {
        console.log(
            `\n  ⚠ ${zeroed.length} demande(s) actuellement à 0 € seront tarifées. ` +
                'Si c\'était une gratuité voulue, traitez-les à la main avant --apply.',
        );
    }

    if (!APPLY) {
        console.log('\nRien écrit (relancez avec --apply).');
        return;
    }

    // Une transaction par facture : le tarif des lignes, le total et l'événement
    // d'audit d'une même facture doivent tomber ensemble ou pas du tout.
    const byBill = new Map<number | null, typeof changes>();
    for (const c of changes) {
        const list = byBill.get(c.order.billId);
        if (list) list.push(c);
        else byBill.set(c.order.billId, [c]);
    }

    let updated = 0;
    for (const [billId, group] of byBill) {
        // Prisma's 5 s default is far too short here. The `billId: null` group holds
        // every demande rattachée à aucune facture — most of the batch — and each
        // line is a separate round trip to the base. Against a remote Postgres that
        // blows the default long before the group is done, and the whole transaction
        // expires mid-flight ("a query cannot be executed on an expired transaction").
        // Rolls back cleanly when it happens, so the failure is safe — just useless.
        await prisma.$transaction(async (tx) => {
            for (const c of group) {
                await tx.orders.update({ where: { id: c.order.id }, data: { cost: c.newCost } });
            }
            if (billId == null) return;

            const linked = await tx.orders.findMany({
                where: { billId, isActive: true },
                select: { cost: true },
            });
            const total = linked.reduce(
                (sum, o) => sum.plus(o.cost ?? new Prisma.Decimal(0)),
                new Prisma.Decimal(0),
            );
            await tx.bill.update({ where: { id: billId }, data: { invoiceAmount: total } });
            await tx.billEvent.create({
                data: {
                    billId,
                    type: 'AMOUNT_CHANGED',
                    payload: {
                        reason: 'backfill-order-costs',
                        orders: group.map((c) => ({
                            orderId: c.order.id,
                            previousCost: c.order.cost?.toString() ?? null,
                            newCost: c.newCost.toString(),
                        })),
                        newTotal: total.toString(),
                    },
                    performedById: null,
                },
            });
        }, { timeout: 120_000, maxWait: 20_000 });
        updated += group.length;
        process.stdout.write(`\r  ${updated} demandes mises à jour…`);
    }
    process.stdout.write('\n');

    const touchedBills = [...byBill.keys()].filter((id) => id != null).length;
    console.log(`\n${updated} demandes ajustées, ${touchedBills} brouillon(s) recalculé(s).`);
    console.log('Les seuils de facturation ne sont pas réévalués : un brouillon qui dépasse');
    console.log('désormais le seuil sera émis à la prochaine demande du client.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
