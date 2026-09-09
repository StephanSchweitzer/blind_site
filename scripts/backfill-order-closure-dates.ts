/**
 * Rattrape la date de clôture des demandes rattachées à une facture.
 *
 *   pnpm tsx scripts/backfill-order-closure-dates.ts                 # rapport seul, n'écrit rien
 *   pnpm tsx scripts/backfill-order-closure-dates.ts --apply         # applique
 *   pnpm tsx scripts/backfill-order-closure-dates.ts --only-termine  # cf. « Le cas des demandes non terminées »
 *   pnpm tsx scripts/backfill-order-closure-dates.ts --csv=rapport.csv
 *   pnpm tsx scripts/backfill-order-closure-dates.ts --apply --limit=50
 *
 * POURQUOI
 *
 * La colonne « Livraison » de la facture (components/ui/admin/BillPDF.tsx) affiche
 * `Orders.closureDate`. Or cette date n'a longtemps été renseignée nulle part sur le
 * chemin qui compte : `resolveClosureDate` (lib/statusSync.ts) ne l'inscrit qu'au
 * FRANCHISSEMENT de « Terminé », et `syncOrderToStatus` — le chemin par lequel une
 * attribution fermait sa demande — n'écrivait que `statusId`. Le commentaire de
 * `syncOrderToStatus` le dit sans détour : le jour où elle a été close a simplement été
 * perdu, pour toute demande jamais close par son attribution. Les deux chemins dérivent
 * la date de la même façon depuis, mais les demandes d'avant gardent leur trou, et leur
 * facture une case vide.
 *
 * LA DATE RETENUE
 *
 * Trois sources, de la plus juste à la plus approchée :
 *
 *   1. `OrderEvent` de type CLOSED le plus récent, SI la demande est encore « Terminé ».
 *      C'est la date de clôture elle-même : le jour où un permanent a effectivement
 *      fermé la demande, donc le jour de l'expédition vers l'auditeur. Rien ne la
 *      surpasse — elle est simplement absente des demandes fermées avant OrderEvent.
 *      La condition sur le statut écarte une demande ROUVERTE depuis : sa clôture
 *      passée ne décrit plus son état, et l'attribution en dit alors davantage.
 *      (`backfill-order-events.ts` n'écrit que des lignes CREATED, jamais CLOSED : un
 *      CLOSED en base est donc toujours une vraie transition, jamais un artefact.)
 *   2. `Assignment.returnedToECADate` — le retour de l'enregistrement aux ECA, pour la
 *      dernière attribution terminée. Source principale sur l'historique, et GARANTIE
 *      sur une attribution « Terminé » : `guardAssignmentConsistency` refuse ce statut
 *      sans elle. C'est aussi une date de calendrier saisie par un permanent, pas un
 *      horodatage machine.
 *   3. `AssignmentEvent` de type CLOSED le plus récent — le jour où l'attribution est
 *      effectivement passée « Terminé ». Repli pour les lignes reprises d'Access,
 *      antérieures à la garde ci-dessus, qui peuvent être « Terminé » sans date de retour.
 *
 * Les sources 2 et 3 ne sont pas ce qu'écrit le portail : une demande se clôt le jour de
 * l'EXPÉDITION vers l'auditeur, pas le jour du RETOUR du lecteur (voir l'en-tête de
 * STATUS dans lib/statusSync.ts). Pour l'historique, ce jour-là n'a jamais été enregistré
 * nulle part : le retour est la meilleure approximation disponible, et c'est celle qui a
 * été demandée. Une facture datée à quelques jours près vaut mieux qu'une case vide.
 *
 * Une demande peut porter plusieurs attributions (livre ré-enregistré) : on retient la
 * DERNIÈRE terminée, celle après laquelle l'audio est effectivement parti. Une
 * duplication n'en porte aucune par nature, et ne se rattrape donc que par la source 1.
 *
 * LE FUSEAU
 *
 * La date est normalisée à minuit UTC du JOUR PARISIEN de la source. C'est la forme des
 * dates déjà en base (`…T00:00:00.000Z`), et celle que `parisDate` — par où la facture la
 * relit — rend sur le bon jour. Sans cette normalisation, un horodatage d'événement
 * (15 h 49) partirait tel quel, et le script rendrait un jour différent selon le fuseau de
 * la machine qui le lance.
 *
 * LE CAS DES DEMANDES NON TERMINÉES
 *
 * `guardClosureDateRequiresTermine` pose qu'une date de clôture n'a de sens que sur une
 * demande « Terminé ». Une demande facturée dont l'attribution est terminée mais qui
 * attend encore l'envoi vers l'auditeur reçoit donc ici une date que le portail lui
 * aurait refusée à la saisie. Le rapport isole ce groupe et le compte à part ;
 * `--only-termine` l'écarte. La garde possède déjà une échappatoire pour ces paires
 * (statut non terminé + même jour re-soumis à l'identique), donc les fiches concernées
 * restent modifiables.
 *
 * HORS PISTE D'AUDIT
 *
 * Comme les autres backfills (backfill-order-events.ts, backfill-order-costs.ts), ce
 * script ouvre son propre PrismaClient : il n'a donc ni le filtre de suppression logique
 * (repris à la main dans le `where`) ni l'extension d'audit. Une correction en masse ne
 * produit AUCUN AuditEvent — c'est voulu, la rétention les effacerait en 14 jours et le
 * volume compte face au plafond de 500 Mo. `--csv=` écrit la trace durable à la place ;
 * utilisez-le pour le passage en production.
 *
 * Idempotent : ne touche qu'une `closureDate` nulle, donc une seconde exécution ne trouve
 * plus rien.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import { STATUS } from '../lib/statusSync';
import { parisDayKey } from '../lib/paris-day';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_TERMINE = args.includes('--only-termine');
const CSV_PATH = args.find((a) => a.startsWith('--csv='))?.slice('--csv='.length) ?? null;
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? '') || null;

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});

/** Combien de demandes par transaction — chaque ligne a sa propre date, donc pas d'updateMany global. */
const BATCH = 200;

/**
 * Minuit UTC du jour parisien d'un instant.
 *
 * Une date de clôture est un jour du calendrier français, pas un instant. Une source déjà
 * normalisée (`…T00:00:00.000Z`) se rend elle-même ; un horodatage d'événement perd son
 * heure et tombe sur le jour où le permanent a cliqué, vu de Paris.
 */
function parisMidnightUtc(instant: Date): Date {
    return new Date(`${parisDayKey(instant)}T00:00:00.000Z`);
}

type Skip = { orderId: number; billId: number | null; reason: string };

type Planned = {
    orderId: number;
    billId: number | null;
    statusId: number;
    closureDate: Date;
    source: Source;
    /** `null` quand la date vient de la demande elle-même (source « clôture de la demande »). */
    assignmentId: number | null;
    beforeReceived: boolean;
};

type Source = 'clôture de la demande' | 'retour aux ECA' | 'événement CLOSED';

const SOURCES: Source[] = ['clôture de la demande', 'retour aux ECA', 'événement CLOSED'];

async function main() {
    console.log(`Base ${describeDatabase(DB_URL)}`);
    console.log(
        APPLY
            ? 'APPLIQUE — les dates de clôture vont être écrites\n'
            : 'SIMULATION — aucune écriture (--apply pour appliquer)\n'
    );

    // Le filtre de suppression logique est repris à la main : ce client n'a pas
    // l'extension de lib/prisma.ts. `isActive` ET `deletedAt` — les deux sont écrits
    // ensemble sur une suppression et ni l'un ni l'autre ne remplace l'autre.
    const candidates = await prisma.orders.findMany({
        where: {
            billId: { not: null },
            closureDate: null,
            isActive: true,
            deletedAt: null,
        },
        select: {
            id: true,
            billId: true,
            statusId: true,
            isDuplication: true,
            requestReceivedDate: true,
            // La clôture de la demande elle-même, quand elle a été enregistrée.
            events: {
                where: { type: 'CLOSED' },
                select: { createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
            assignments: {
                where: { isActive: true, deletedAt: null, statusId: STATUS.TERMINE },
                select: {
                    id: true,
                    returnedToECADate: true,
                    // Le dernier passage à « Terminé » : une attribution rouverte puis
                    // refermée a fini le jour de la DERNIÈRE fermeture.
                    events: {
                        where: { type: 'CLOSED' },
                        select: { createdAt: true },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            },
        },
        orderBy: { id: 'asc' },
    });

    console.log(`${candidates.length} demande(s) sur facture sans date de clôture.\n`);

    const planned: Planned[] = [];
    const skipped: Skip[] = [];

    for (const order of candidates) {
        // Source 1 : la clôture de la demande elle-même. Elle prime sur tout le reste —
        // c'est LA date de clôture, pas une approximation tirée de l'attribution — mais
        // seulement tant que la demande est encore « Terminé » : rouverte depuis, sa
        // fermeture passée ne décrit plus rien.
        const ownClosure =
            order.statusId === STATUS.TERMINE ? order.events[0]?.createdAt : undefined;
        if (ownClosure) {
            planned.push(
                plan(order, parisMidnightUtc(ownClosure), 'clôture de la demande', null)
            );
            continue;
        }

        if (order.assignments.length === 0) {
            skipped.push({
                orderId: order.id,
                billId: order.billId,
                // Le statut fait partie du motif : sur une demande « En cours » ou
                // « Attente envoi vers lecteur », la case vide de la facture est JUSTE —
                // rien n'est encore parti. C'est ce qui distingue un trou à combler d'une
                // demande simplement pas terminée, et évite de relire le script en se
                // demandant pourquoi il en a laissé tant de côté.
                reason: order.isDuplication
                    ? `duplication (statut ${order.statusId}) — aucune attribution par nature`
                    : `aucune attribution active « Terminé » (demande au statut ${order.statusId})`,
            });
            continue;
        }

        // Chaque attribution terminée avec sa date, puis la plus tardive.
        const dated = order.assignments
            .map((a) => {
                if (a.returnedToECADate) {
                    return {
                        assignmentId: a.id,
                        date: parisMidnightUtc(a.returnedToECADate),
                        source: 'retour aux ECA' as const,
                    };
                }
                const closed = a.events[0]?.createdAt;
                if (closed) {
                    return {
                        assignmentId: a.id,
                        date: parisMidnightUtc(closed),
                        source: 'événement CLOSED' as const,
                    };
                }
                return null;
            })
            .filter((d): d is NonNullable<typeof d> => d !== null)
            .sort((a, b) => b.date.getTime() - a.date.getTime());

        if (dated.length === 0) {
            skipped.push({
                orderId: order.id,
                billId: order.billId,
                reason: 'attribution « Terminé » sans date de retour ni événement de clôture',
            });
            continue;
        }

        if (ONLY_TERMINE && order.statusId !== STATUS.TERMINE) {
            skipped.push({
                orderId: order.id,
                billId: order.billId,
                reason: `--only-termine : demande au statut ${order.statusId}`,
            });
            continue;
        }

        const best = dated[0];
        planned.push(plan(order, best.date, best.source, best.assignmentId));
    }

    const toWrite = LIMIT ? planned.slice(0, LIMIT) : planned;

    // ── Rapport ──────────────────────────────────────────────────────────────────────
    const notTermine = toWrite.filter((p) => p.statusId !== STATUS.TERMINE);
    const anomalies = toWrite.filter((p) => p.beforeReceived);

    const limitNote =
        LIMIT && planned.length > LIMIT ? ` (sur ${planned.length} éligibles, --limit=${LIMIT})` : '';
    console.log(`À renseigner : ${toWrite.length}${limitNote}`);
    for (const source of SOURCES) {
        const n = toWrite.filter((p) => p.source === source).length;
        console.log(`  depuis « ${source} »`.padEnd(32) + ` : ${n}`);
    }
    console.log(`Non traitables : ${skipped.length}`);
    for (const [reason, n] of countBy(skipped.map((s) => s.reason))) {
        console.log(`  ${String(n).padStart(6)}  ${reason}`);
    }

    if (notTermine.length > 0) {
        console.log(
            `\n[!] ${notTermine.length} demande(s) ne sont pas au statut « Terminé ». Une date de ` +
            "clôture y décrit un envoi vers l'auditeur qui n'a pas encore eu lieu, et le portail " +
            'refuserait cette paire à la saisie (guardClosureDateRequiresTermine). Relancez avec ' +
            '--only-termine pour les écarter.'
        );
        for (const [statusId, n] of countBy(notTermine.map((p) => String(p.statusId)))) {
            console.log(`  ${String(n).padStart(6)}  statut ${statusId}`);
        }
    }

    if (anomalies.length > 0) {
        const ids = anomalies.slice(0, 20).map((a) => `#${a.orderId}`).join(', ');
        console.log(
            `\n[!] ${anomalies.length} date(s) tombent AVANT la date de réception de la demande ` +
            "(reprises d'Access, sans doute). Écrites quand même — c'est la date que porte " +
            `l'attribution : ${ids}${anomalies.length > 20 ? '…' : ''}`
        );
    }

    // Pour information : le même trou existe hors facture, et une facture créée plus tard
    // sur ces demandes-là repartirait avec une case vide.
    const unbilled = await prisma.orders.count({
        where: {
            billId: null,
            closureDate: null,
            isActive: true,
            deletedAt: null,
            statusId: STATUS.TERMINE,
        },
    });
    if (unbilled > 0) {
        console.log(
            `\n(pour information : ${unbilled} demande(s) « Terminé » SANS facture sont dans le ` +
            'même cas — hors périmètre de ce script.)'
        );
    }

    if (toWrite.length > 0) {
        console.log('\nAperçu :');
        for (const p of toWrite.slice(0, 15)) {
            const from = p.assignmentId === null ? p.source : `${p.source}, attribution #${p.assignmentId}`;
            console.log(
                `  demande #${p.orderId} (facture ${p.billId}, statut ${p.statusId}) → ` +
                `${parisDayKey(p.closureDate)}  [${from}]`
            );
        }
        if (toWrite.length > 15) console.log(`  … ${toWrite.length - 15} de plus`);
    }

    if (CSV_PATH) {
        const rows = [
            'orderId;billId;orderStatusId;assignmentId;closureDate;source;action',
            ...toWrite.map(
                (p) =>
                    `${p.orderId};${p.billId};${p.statusId};${p.assignmentId ?? ''};` +
                    `${parisDayKey(p.closureDate)};${p.source};${APPLY ? 'ecrit' : 'simulation'}`
            ),
            ...skipped.map((s) => `${s.orderId};${s.billId};;;;;non traitable : ${s.reason}`),
        ];
        writeFileSync(CSV_PATH, rows.join('\n') + '\n', 'utf8');
        console.log(`\nRapport écrit dans ${CSV_PATH}`);
    }

    if (toWrite.length === 0) {
        console.log('\nRien à écrire.');
        return;
    }
    if (!APPLY) {
        console.log('\nRien écrit (relancez avec --apply).');
        return;
    }

    let done = 0;
    for (let i = 0; i < toWrite.length; i += BATCH) {
        const batch = toWrite.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map((p) =>
                // `closureDate: null` dans le where : une exécution concurrente, ou une
                // reprise après interruption, ne réécrit pas une date déjà posée.
                prisma.orders.updateMany({
                    where: { id: p.orderId, closureDate: null },
                    data: { closureDate: p.closureDate },
                })
            )
        );
        done += batch.length;
        process.stdout.write(`\r  ${done}/${toWrite.length} demandes mises à jour…`);
    }
    process.stdout.write('\n');

    console.log(`\n${done} date(s) de clôture renseignée(s).`);
}

/**
 * Une ligne du plan, quelle que soit la source.
 *
 * `beforeReceived` se compare en JOURS PARISIENS, pas en instants :
 * `requestReceivedDate` est tantôt un jour normalisé à minuit UTC (reprise Access),
 * tantôt l'horodatage de la saisie (17 h 21). Comparer les instants faisait passer pour
 * antérieure une clôture tombant le MÊME jour que la réception. Signalée, jamais écartée :
 * la donnée reste celle que porte la source.
 */
function plan(
    order: { id: number; billId: number | null; statusId: number; requestReceivedDate: Date },
    closureDate: Date,
    source: Source,
    assignmentId: number | null
): Planned {
    return {
        orderId: order.id,
        billId: order.billId,
        statusId: order.statusId,
        closureDate,
        source,
        assignmentId,
        beforeReceived: parisDayKey(closureDate) < parisDayKey(order.requestReceivedDate),
    };
}

/** Décompte par valeur, du plus fréquent au moins fréquent. */
function countBy(values: string[]): [string, number][] {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
