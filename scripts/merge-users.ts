/**
 * Regroupe deux fiches d'une même personne sous un seul numéro.
 *
 *   pnpm tsx scripts/merge-users.ts --keep=2878 --absorb=1601
 *   pnpm tsx scripts/merge-users.ts --keep=2878 --absorb=1601 --confirm
 *
 * Without --confirm nothing is written: it reads both fiches and prints the plan.
 * The dry run issues SELECTs only — it does not run the transaction and roll it
 * back, so it is safe against production.
 *
 * ## Why a script and not a screen (yet)
 *
 * Requests to regroup two people are rare (the first came on 2026-11-12, for an
 * auditeur carrying two numbers since the Access import). A merge moves money —
 * factures, payments, the hand-typed `currentBalance` — so the decision a
 * screen would have to make on its own (which balance) is refused here until a
 * person makes it with a flag. If this becomes frequent, lift `buildPlan` / `applyPlan` into
 * lib/users/ and put a button on the dossier.
 *
 * ## What moves to --keep
 *
 * Every row pointing at --absorb, soft-deleted ones included (this client has no
 * soft-delete filter, on purpose: a deleted demande still belongs to the person):
 * demandes, factures, payments, attributions held as lecteur, and the staff
 * columns (processedBy, addedBy…) in case the fiche was ever a permanent.
 * Addresses and languages move only where --keep lacks them.
 *
 * ## What stays on --absorb
 *
 * - UserActivityEvent rows: append-only, `userId` is never rewritten. The
 *   absorbed fiche's status history stays readable on it.
 * - Password-reset tokens (a login fiche is refused anyway).
 * - Addresses --keep already has, so nothing is lost and nothing is doubled.
 *
 * --absorb is then soft-deleted (deletedAt), never removed: a wrong merge can be
 * undone by hand from the snapshot written to disk before any write.
 *
 * ## The trail
 *
 * This runs on a plain PrismaClient, outside the audit extension (lib/audit/),
 * and AuditEvent trims itself after 14 days anyway. The durable trace is
 * therefore in the data: a dated line in both fiches' notes, which also carries
 * every value of --absorb that differed from --keep, so a second phone number or
 * a different email is kept in words rather than silently dropped.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { scriptDatabaseUrl, describeDatabase } from './db-url';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const KEEP = Number(arg('keep'));
const ABSORB = Number(arg('absorb'));
const CONFIRM = args.includes('--confirm');
/** Resolve a balance conflict: the value to leave on --keep. */
const BALANCE = arg('balance');
/** Allow merging fiches whose memberType differ (auditeur + lecteur…). */
const ALLOW_TYPE = args.includes('--allow-different-type');

if (!Number.isInteger(KEEP) || !Number.isInteger(ABSORB) || KEEP === ABSORB) {
    console.error(
        'Usage : --keep=<id> --absorb=<id> [--balance=<€>] ' +
            '[--allow-different-type] [--confirm]',
    );
    process.exit(1);
}

const DB_URL = scriptDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

type Tx = Prisma.TransactionClient;

const refusals: string[] = [];
const refuse = (why: string) => refusals.push(why);

/** Profile fields compared between the two fiches. Order = print order. */
const PROFILE_FIELDS = [
    'civilityId',
    'civilityOther',
    'firstName',
    'lastName',
    'email',
    'homePhone',
    'cellPhone',
    'nonProfitAffiliation',
    'preferredDeliveryMethod',
    'preferredMediaFormatId',
    'paymentThreshold',
    'specialization',
    'saveType',
    'maxConcurrentAssignments',
    'availabilityNotes',
    'gestconteNotes',
    // Gestconte is gone (confirmed 2026-11-12): the id is a legacy reference,
    // not a live bridge, so a second one is no decision — --keep's stays and
    // the other is kept in the notes like any differing value.
    'gestconteId',
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

const LABELS: Record<ProfileField | 'currentBalance', string> = {
    civilityId: 'Civilité',
    civilityOther: 'Civilité (autre)',
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'Email',
    homePhone: 'Téléphone fixe',
    cellPhone: 'Téléphone portable',
    nonProfitAffiliation: 'Association',
    preferredDeliveryMethod: 'Mode de livraison',
    preferredMediaFormatId: 'Support préféré',
    paymentThreshold: 'Seuil de facturation',
    specialization: 'Spécialisation',
    saveType: 'Logiciel d’enregistrement',
    maxConcurrentAssignments: 'Attributions simultanées max',
    availabilityNotes: 'Notes de disponibilité',
    gestconteNotes: 'Notes Gestconte',
    gestconteId: 'Identifiant Gestconte',
    currentBalance: 'Solde',
};

const show = (v: unknown) =>
    v === null || v === undefined || v === '' ? '—' : v instanceof Prisma.Decimal ? v.toFixed(2) : String(v);
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const same = (a: unknown, b: unknown) => {
    if (a instanceof Prisma.Decimal && b instanceof Prisma.Decimal) return a.equals(b);
    // Whitespace-blind: the Access import left line breaks inside some values
    // (« AVEUGLE⏎ECA » vs « AVEUGLE ECA »), which are the same thing.
    if (typeof a === 'string' && typeof b === 'string') {
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        return norm(a) === norm(b);
    }
    return a === b;
};
const addressKey = (a: { addressLine1: string | null; postalCode: string | null; city: string | null }) =>
    [a.addressLine1, a.postalCode, a.city]
        .map((s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '').toLowerCase())
        .join('|');

const today = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

async function loadUser(id: number) {
    return prisma.user.findUnique({
        where: { id },
        include: { addresses: true, languages: true },
    });
}
type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

/** Rows pointing at --absorb, per relation. Counted without any soft-delete filter. */
async function countReferences(id: number) {
    const [
        ordersAsAuditeur,
        ordersProcessed,
        assignmentsProcessed,
        assignmentReaders,
        bills,
        payments,
        books,
        coupsDeCoeur,
        news,
        activityEvents,
    ] = await Promise.all([
        prisma.orders.groupBy({ by: ['isActive'], where: { aveugleId: id }, _count: true }),
        prisma.orders.count({ where: { processedByStaffId: id } }),
        prisma.assignment.count({ where: { processedByStaffId: id } }),
        prisma.assignmentReader.count({ where: { readerId: id } }),
        prisma.bill.findMany({
            where: { clientId: id },
            select: { id: true, state: true, kind: true, invoiceAmount: true, isActive: true },
            orderBy: { id: 'asc' },
        }),
        prisma.payment.findMany({
            where: { clientId: id },
            select: { id: true, type: true, amount: true, billId: true, isActive: true },
            orderBy: { id: 'asc' },
        }),
        prisma.book.count({ where: { addedById: id } }),
        prisma.coupsDeCoeur.count({ where: { addedById: id } }),
        prisma.news.count({ where: { authorId: id } }),
        prisma.userActivityEvent.count({ where: { userId: id } }),
    ]);
    const orders = ordersAsAuditeur.reduce((s, g) => s + g._count, 0);
    const ordersDeleted = ordersAsAuditeur.find((g) => !g.isActive)?._count ?? 0;
    return {
        orders,
        ordersDeleted,
        ordersProcessed,
        assignmentsProcessed,
        assignmentReaders,
        bills,
        payments,
        books,
        coupsDeCoeur,
        news,
        activityEvents,
    };
}

async function booksOnBoth(a: number, b: number): Promise<number[]> {
    const perUser = await prisma.orders.findMany({
        where: { aveugleId: { in: [a, b] }, isActive: true },
        select: { catalogueId: true, aveugleId: true },
        distinct: ['catalogueId', 'aveugleId'],
    });
    const seen = new Map<number, Set<number>>();
    for (const o of perUser) seen.set(o.catalogueId, (seen.get(o.catalogueId) ?? new Set()).add(o.aveugleId));
    return [...seen].filter(([, users]) => users.size === 2).map(([book]) => book).sort((x, y) => x - y);
}

interface Plan {
    keep: LoadedUser;
    absorb: LoadedUser;
    /** Fields --keep lacks, filled from --absorb. */
    fill: Partial<Record<ProfileField, unknown>>;
    /** Fields that differ; --keep's value stays, --absorb's goes into the notes. */
    conflicts: { field: string; keep: unknown; absorb: unknown }[];
    currentBalance: Prisma.Decimal | null;
    addressesToMove: number[];
    addressesLeft: number;
    languagesToMove: number[];
    keepNotes: string;
    absorbNotes: string;
    refs: Awaited<ReturnType<typeof countReferences>>;
    keepRefs: Awaited<ReturnType<typeof countReferences>>;
    /** Books with an active demande on both fiches: maybe one demande typed twice. */
    sharedBooks: number[];
}

function buildPlan(
    keep: LoadedUser,
    absorb: LoadedUser,
    refs: Plan['refs'],
    keepRefs: Plan['keepRefs'],
    sharedBooks: number[],
): Plan {
    if (keep.deletedAt) refuse(`la fiche n°${keep.id} à garder est supprimée`);
    if (absorb.deletedAt) refuse(`la fiche n°${absorb.id} est déjà supprimée (fusion déjà faite ?)`);
    for (const u of [keep, absorb]) {
        if (u.accessLevel !== 'member') {
            refuse(`la fiche n°${u.id} est un compte de connexion (${u.accessLevel}) — à traiter à la main`);
        }
    }
    if (keep.memberType !== absorb.memberType && !ALLOW_TYPE) {
        refuse(
            `types différents (n°${keep.id} ${keep.memberType}, n°${absorb.id} ${absorb.memberType}) — ` +
                'relancer avec --allow-different-type si c’est voulu',
        );
    }

    const fill: Plan['fill'] = {};
    const conflicts: Plan['conflicts'] = [];
    for (const f of PROFILE_FIELDS) {
        const k = keep[f];
        const a = absorb[f];
        if (isBlank(a)) continue;
        if (isBlank(k)) fill[f] = a;
        else if (!same(k, a)) conflicts.push({ field: LABELS[f], keep: k, absorb: a });
    }

    // currentBalance is typed by hand in the form (lib/audit/config.ts), not
    // derived: whether two balances add up is not something to guess.
    const zero = (d: Prisma.Decimal | null) => d == null || d.isZero();
    let currentBalance = zero(keep.currentBalance) ? absorb.currentBalance : keep.currentBalance;
    if (!zero(keep.currentBalance) && !zero(absorb.currentBalance) && !same(keep.currentBalance, absorb.currentBalance)) {
        if (BALANCE !== undefined) {
            currentBalance = new Prisma.Decimal(BALANCE);
            conflicts.push({ field: LABELS.currentBalance, keep: keep.currentBalance, absorb: absorb.currentBalance });
        } else {
            refuse(
                `deux soldes non nuls (${show(keep.currentBalance)} € et ${show(absorb.currentBalance)} €) — ` +
                    'choisir avec --balance=<montant>',
            );
        }
    }

    // A status only moves through the dossier, which writes the UserActivityEvent
    // (append-only) that explains it. Keeping --keep's status silently would leave
    // an active auditeur looking radié, with no event saying why.
    if (keep.activityStatus !== absorb.activityStatus) {
        refuse(
            `statuts différents (n°${keep.id} ${keep.activityStatus}, n°${absorb.id} ${absorb.activityStatus}) — ` +
                `mettre la fiche n°${keep.id} au bon statut depuis son dossier, puis relancer`,
        );
    }

    const keepAddressKeys = new Set(keep.addresses.map(addressKey));
    const addressesToMove = absorb.addresses.filter((a) => !keepAddressKeys.has(addressKey(a))).map((a) => a.id);
    const keepLanguages = new Set(keep.languages.map((l) => l.language));
    const languagesToMove = absorb.languages.filter((l) => !keepLanguages.has(l.language)).map((l) => l.id);

    const lines = [`[${today}] Fiche n°${absorb.id} regroupée ici.`];
    for (const c of conflicts) lines.push(`  ${c.field} sur n°${absorb.id} : ${show(c.absorb)}`);
    if (!isBlank(absorb.notes)) lines.push(`  Notes de n°${absorb.id} :`, absorb.notes!.trim());
    const keepNotes = [keep.notes?.trim(), lines.join('\n')].filter(Boolean).join('\n\n');
    const absorbNotes = [absorb.notes?.trim(), `[${today}] Regroupée dans la fiche n°${keep.id}.`]
        .filter(Boolean)
        .join('\n\n');

    return {
        keep,
        absorb,
        fill,
        conflicts,
        currentBalance,
        addressesToMove,
        addressesLeft: absorb.addresses.length - addressesToMove.length,
        languagesToMove,
        keepNotes,
        absorbNotes,
        refs,
        keepRefs,
        sharedBooks,
    };
}

/**
 * Ids of every row about to move, read inside the transaction so the list is
 * exactly what the updates below touch. Without it an undo would have to guess
 * which of --keep's demandes came from --absorb.
 */
async function movedIds(tx: Tx, p: Plan) {
    const from = p.absorb.id;
    const ids = (rows: { id: number }[]) => rows.map((r) => r.id);
    const sel = { select: { id: true } } as const;
    return {
        orders: ids(await tx.orders.findMany({ where: { aveugleId: from }, ...sel })),
        bills: ids(await tx.bill.findMany({ where: { clientId: from }, ...sel })),
        payments: ids(await tx.payment.findMany({ where: { clientId: from }, ...sel })),
        assignmentReaders: ids(await tx.assignmentReader.findMany({ where: { readerId: from }, ...sel })),
        ordersProcessed: ids(await tx.orders.findMany({ where: { processedByStaffId: from }, ...sel })),
        assignmentsProcessed: ids(await tx.assignment.findMany({ where: { processedByStaffId: from }, ...sel })),
        books: ids(await tx.book.findMany({ where: { addedById: from }, ...sel })),
        coupsDeCoeur: ids(await tx.coupsDeCoeur.findMany({ where: { addedById: from }, ...sel })),
        news: ids(await tx.news.findMany({ where: { authorId: from }, ...sel })),
        addresses: p.addressesToMove,
        languages: p.languagesToMove,
    };
}

async function applyPlan(tx: Tx, p: Plan, backupFile: string) {
    const from = p.absorb.id;
    const to = p.keep.id;

    // Written before the first update: if the transaction then fails, the file
    // describes a merge that did not happen, which is harmless; the reverse is not.
    writeFileSync(
        backupFile,
        JSON.stringify(
            { keep: p.keep, absorb: p.absorb, moved: await movedIds(tx, p) },
            (_k, v) => (typeof v === 'bigint' ? String(v) : v),
            2,
        ),
    );

    // Email is unique: free it on --absorb before --keep takes it.
    if (p.fill.email !== undefined || (p.absorb.email && p.conflicts.some((c) => c.field === LABELS.email))) {
        await tx.user.update({ where: { id: from }, data: { email: null } });
    }

    const moved = {
        orders: (await tx.orders.updateMany({ where: { aveugleId: from }, data: { aveugleId: to } })).count,
        bills: (await tx.bill.updateMany({ where: { clientId: from }, data: { clientId: to } })).count,
        payments: (await tx.payment.updateMany({ where: { clientId: from }, data: { clientId: to } })).count,
        assignmentReaders: (
            await tx.assignmentReader.updateMany({ where: { readerId: from }, data: { readerId: to } })
        ).count,
        ordersProcessed: (
            await tx.orders.updateMany({ where: { processedByStaffId: from }, data: { processedByStaffId: to } })
        ).count,
        assignmentsProcessed: (
            await tx.assignment.updateMany({ where: { processedByStaffId: from }, data: { processedByStaffId: to } })
        ).count,
        books: (await tx.book.updateMany({ where: { addedById: from }, data: { addedById: to } })).count,
        coupsDeCoeur: (await tx.coupsDeCoeur.updateMany({ where: { addedById: from }, data: { addedById: to } }))
            .count,
        news: (await tx.news.updateMany({ where: { authorId: from }, data: { authorId: to } })).count,
        addresses: (
            await tx.address.updateMany({
                where: { id: { in: p.addressesToMove } },
                // Never steal the default: --keep's own address stays the one used.
                data: { userId: to, isDefault: p.keep.addresses.length ? false : undefined },
            })
        ).count,
        languages: (
            await tx.readerLanguage.updateMany({ where: { id: { in: p.languagesToMove } }, data: { userId: to } })
        ).count,
    };

    await tx.user.update({
        where: { id: to },
        data: {
            ...(p.fill as Prisma.UserUncheckedUpdateInput),
            currentBalance: p.currentBalance,
            notes: p.keepNotes,
        },
    });
    await tx.user.update({
        where: { id: from },
        data: { deletedAt: new Date(), notes: p.absorbNotes },
    });
    return moved;
}

/** « : PAID 70 (1 512,20 €), BILLED 1 (21,00 €) » — counts and totals per key. */
function summarize<T>(rows: T[], key: (r: T) => string, amount: (r: T) => Prisma.Decimal): string {
    if (!rows.length) return '';
    const groups = new Map<string, { n: number; total: Prisma.Decimal }>();
    for (const r of rows) {
        const g = groups.get(key(r)) ?? { n: 0, total: new Prisma.Decimal(0) };
        g.n += 1;
        g.total = g.total.plus(amount(r));
        groups.set(key(r), g);
    }
    return ' : ' + [...groups].map(([k, g]) => `${k} ${g.n} (${g.total.toFixed(2)} €)`).join(', ');
}

const formatAddress = (a: LoadedUser['addresses'][number]) =>
    [a.addressLine1, a.addressSupplement, [a.postalCode, a.city].filter(Boolean).join(' '), a.country]
        .filter((x) => !isBlank(x))
        .join(', ') + (a.isDefault ? ' (par défaut)' : '');

function printPlan(p: Plan) {
    const name = (u: LoadedUser) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '(sans nom)';
    console.log(`  à garder   n°${p.keep.id}  ${name(p.keep)}  (${p.keep.memberType}, ${p.keep.activityStatus}, ` +
        `Gestconte ${show(p.keep.gestconteId)}, créée le ${p.keep.createdAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })})`);
    console.log(`  à regrouper n°${p.absorb.id}  ${name(p.absorb)}  (${p.absorb.memberType}, ${p.absorb.activityStatus}, ` +
        `Gestconte ${show(p.absorb.gestconteId)}, créée le ${p.absorb.createdAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })})\n`);

    const k = p.keepRefs;
    console.log(`  n°${p.keep.id} porte déjà : ${k.orders} demande(s), ${k.bills.length} facture(s)` +
        `${summarize(k.bills, (b) => b.state, (b) => b.invoiceAmount)}, ${k.payments.length} paiement(s), ` +
        `${k.activityEvents} évènement(s) de statut`);
    if (p.sharedBooks.length) {
        console.log(`  ⚠ ${p.sharedBooks.length} livre(s) demandé(s) sur les deux fiches (doublons de demande ?) : ` +
            p.sharedBooks.map((b) => `#${b}`).join(', '));
    }
    console.log(`
  Adresses n°${p.keep.id} :`);
    for (const a of p.keep.addresses) console.log(`    #${a.id} ${formatAddress(a)}`);
    console.log(`  Adresses n°${p.absorb.id} :`);
    for (const a of p.absorb.addresses) {
        console.log(`    #${a.id} ${formatAddress(a)}  → ${p.addressesToMove.includes(a.id) ? 'déplacée' : 'déjà présente, laissée'}`);
    }
    console.log();

    const r = p.refs;
    console.log(`  Passeraient sur n°${p.keep.id} :`);
    console.log(`    ${r.orders} demande(s)${r.ordersDeleted ? ` dont ${r.ordersDeleted} supprimée(s)` : ''}`);
    console.log(`    ${r.bills.length} facture(s)${summarize(r.bills, (b) => b.state, (b) => b.invoiceAmount)}`);
    const open = r.bills.filter((b) => b.isActive && (b.state === 'DRAFT' || b.state === 'BILLED'));
    if (open.length) {
        console.log(`      dont ouvertes : ${open.map((b) => `#${b.id} ${b.state}${b.kind !== 'STANDARD' ? `/${b.kind}` : ''} ${b.invoiceAmount.toFixed(2)} €`).join(', ')}`);
    }
    console.log(`    ${r.payments.length} paiement(s)${summarize(r.payments.filter((x) => x.isActive), (x) => x.type, (x) => x.amount)}` +
        (r.payments.some((x) => !x.isActive) ? ` + ${r.payments.filter((x) => !x.isActive).length} supprimé(s)` : ''));
    console.log(`    ${r.assignmentReaders} attribution(s) en tant que lecteur`);
    const staff = r.ordersProcessed + r.assignmentsProcessed + r.books + r.coupsDeCoeur + r.news;
    if (staff) {
        console.log(`    ${staff} ligne(s) « traité par » / « ajouté par » (demandes ${r.ordersProcessed}, ` +
            `attributions ${r.assignmentsProcessed}, livres ${r.books}, coups de cœur ${r.coupsDeCoeur}, actualités ${r.news})`);
    }
    console.log(`    ${p.addressesToMove.length} adresse(s)` +
        (p.addressesLeft ? ` (${p.addressesLeft} déjà présente(s) sur n°${p.keep.id}, laissée(s))` : ''));
    console.log(`    ${p.languagesToMove.length} langue(s)`);
    console.log(`  Resterait sur n°${p.absorb.id} : ${r.activityEvents} évènement(s) d’historique de statut (append-only)\n`);

    const filled = Object.entries(p.fill);
    if (filled.length) {
        console.log(`  Champs vides sur n°${p.keep.id}, complétés depuis n°${p.absorb.id} :`);
        for (const [f, v] of filled) console.log(`    ${LABELS[f as ProfileField]} : ${show(v)}`);
        console.log();
    }
    if (p.conflicts.length) {
        console.log(`  Valeurs différentes — celle de n°${p.keep.id} est gardée, l’autre va dans les notes :`);
        for (const c of p.conflicts) console.log(`    ${c.field} : n°${p.keep.id} ${show(c.keep)}  |  n°${p.absorb.id} ${show(c.absorb)}`);
        console.log();
    }
    if (!same(p.currentBalance, p.keep.currentBalance)) console.log(`  Solde sur n°${p.keep.id} : ${show(p.currentBalance)} €`);

    console.log(`  Notes de n°${p.keep.id} après fusion :`);
    console.log(p.keepNotes.split('\n').map((l) => `    │ ${l}`).join('\n'));
    console.log(`\n  n°${p.absorb.id} serait supprimée (suppression logique, deletedAt), notes :`);
    console.log(p.absorbNotes.split('\n').map((l) => `    │ ${l}`).join('\n'));
}

async function main() {
    console.log('REGROUPEMENT DE DEUX FICHES');
    console.log(`  base ${describeDatabase(DB_URL)}`);
    console.log(`  ${CONFIRM ? 'EXÉCUTION' : 'Simulation (--confirm absent) — lecture seule'}\n`);

    const [keep, absorb] = await Promise.all([loadUser(KEEP), loadUser(ABSORB)]);
    if (!keep || !absorb) {
        console.error(`\n✗ REFUS : la fiche n°${!keep ? KEEP : ABSORB} n’existe pas. Rien n’a été modifié.`);
        process.exit(1);
    }
    const [refs, keepRefs, sharedBooks] = await Promise.all([
        countReferences(ABSORB),
        countReferences(KEEP),
        booksOnBoth(KEEP, ABSORB),
    ]);
    const plan = buildPlan(keep, absorb, refs, keepRefs, sharedBooks);
    printPlan(plan);

    if (refusals.length) {
        console.error('\n✗ REFUS :');
        for (const r of refusals) console.error(`  - ${r}`);
        console.error('  Rien n’a été modifié.');
        process.exitCode = 1;
        return;
    }
    if (!CONFIRM) {
        console.log('\n  Rien n’a été modifié. Relancer avec --confirm pour exécuter.');
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `merged-users-${KEEP}-${ABSORB}-${stamp}.json`;
    const moved = await prisma.$transaction((tx) => applyPlan(tx, plan, file), { timeout: 60_000 });
    console.log(`\n  Sauvegarde écrite : ${file} (les deux fiches + l’id de chaque ligne déplacée)`);
    console.log(`  ✓ Fusion faite : ${JSON.stringify(moved)}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
