import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';

/**
 * Délais par étape — when an open demande is « en retard ».
 *
 * The old rule was one clock on the whole demande (« déposée il y a plus de
 * 3 mois »), and a second, 30-day one lived next to it on the same page. Both
 * were wrong at either end: a book that had waited 80 days for a lecteur stayed
 * silent, then turned red the day someone finally started reading it; and a
 * recording back aux ECA for a month was « à jour » as long as the demande was
 * young. A demande moves through stages owned by different people, so each
 * stage runs its own clock, started by the date that opened it.
 *
 * Thresholds come from the corpus (enregistrements since 2022, measured
 * 2026-09-23): a book waits a median 19 days for a lecteur (90 % within 105),
 * stays a median 28 days with one (90 % within 79), and the Access import left
 * no history for the last step, so that one is the team's own rule — a week.
 * They are documented, in these words, in content/aide/06-demandes.md
 * (« Délais et retards »): change both together.
 *
 * Everything below is DERIVED on read, never stored — like the blocked
 * duplication (lib/orders/duplicationBlocked.ts), a stored flag would go stale
 * the moment a date moves. And it is computed in ONE module — `computeDelai`
 * for a demande, `computeAssignmentDelai` for an attribution, both on the same
 * thresholds and clocks: the list filters work on the ids they flag rather than
 * on a parallel Prisma translation of the same rule, so the badge on a row, the
 * « Retard » filter and the dashboard count can never disagree. That costs one
 * read of the open rows per page, bounded by the work in progress, not history.
 */

export type DelaiEtape = 'attente_lecteur' | 'chez_lecteur' | 'a_expedier' | 'duplication';
export type DelaiNiveau = 'a_jour' | 'a_surveiller' | 'en_retard';

type EtapeConfig = {
    /** « Chez le lecteur » — as the stage reads on its own. */
    label: string;
    /** « chez le lecteur » — as it reads inside a sentence. */
    inSentence: string;
    /** Days on this stage's clock before it is flagged amber, then red. */
    surveillerJours: number;
    retardJours: number;
    /** The amber word. « À relancer » where the action is obvious — call the lecteur. */
    surveillerLabel: string;
};

export const DELAI_ETAPES: Record<DelaiEtape, EtapeConfig> = {
    attente_lecteur: {
        label: "En attente d'un lecteur",
        inSentence: "en attente d'un lecteur",
        surveillerJours: 30,
        retardJours: 60,
        surveillerLabel: 'À surveiller',
    },
    chez_lecteur: {
        label: 'Chez le lecteur',
        inSentence: 'chez le lecteur',
        surveillerJours: 60,
        retardJours: 90,
        surveillerLabel: 'À relancer',
    },
    a_expedier: {
        label: "À expédier à l'auditeur",
        inSentence: 'revenu aux ECA, pas encore expédié',
        surveillerJours: 3,
        retardJours: 7,
        surveillerLabel: 'À surveiller',
    },
    duplication: {
        label: 'Duplication à faire',
        inSentence: 'duplication à faire',
        surveillerJours: 7,
        retardJours: 14,
        surveillerLabel: 'À surveiller',
    },
};

/** Demande statuses that end the story — nothing is waited for past them. */
const CLOSED_STATUSES: number[] = [STATUS.TERMINE, STATUS.SOLDE];

/** Both statuses mean the book is still being recorded (same as duplicationBlocked.ts). */
const RECORDING_UNDER_WAY: number[] = [STATUS.ATTENTE, STATUS.EN_COURS];

/**
 * An open demande: no closure date AND not in a closing status. Both, because
 * the import left a handful of « Terminé » demandes without a closure date, and
 * those are finished — not late.
 */
export const openOrderWhere: Prisma.OrdersWhereInput = {
    closureDate: null,
    statusId: { notIn: CLOSED_STATUSES },
};

/**
 * What `computeDelai` reads. Nested relation filters escape the soft-delete
 * extension of lib/prisma.ts, hence the explicit `deletedAt: null`.
 */
export const delaiSelect = {
    id: true,
    isDuplication: true,
    statusId: true,
    closureDate: true,
    requestReceivedDate: true,
    assignments: {
        where: { deletedAt: null },
        select: {
            sentToReaderDate: true,
            returnedToECADate: true,
            // A réattribution adds a reader row dated the day it happened; the
            // new lecteur's clock starts there, not at the first envoi.
            readerHistory: { select: { assignedDate: true }, orderBy: { assignedDate: 'desc' }, take: 1 },
        },
    },
    // Fallback clock for « À expédier » when no attribution carries a return
    // date (a demande moved there by hand): the day it entered that status.
    events: {
        where: { toStatusId: STATUS.ATTENTE_AUDITEUR },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
    },
    // A duplication is blocked while its book is being recorded, and its clock
    // starts when that recording comes back.
    catalogue: {
        select: {
            audio_filepath: true,
            assignments: {
                where: { deletedAt: null },
                select: { statusId: true, returnedToECADate: true },
            },
        },
    },
} as const satisfies Prisma.OrdersSelect;

export type DelaiRow = Prisma.OrdersGetPayload<{ select: typeof delaiSelect }>;

export type Delai = {
    etape: DelaiEtape;
    niveau: DelaiNiveau;
    /** When this stage's clock started; null when it has none (a blocked duplication). */
    depuis: Date | null;
    /** Whole days since `depuis`; null with it. */
    jours: number | null;
    /** A duplication waiting on a recording still under way — never late on its own account. */
    bloquee: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const maxDate = (dates: (Date | null | undefined)[]): Date | null => {
    let best: Date | null = null;
    for (const d of dates) if (d && (!best || d > best)) best = d;
    return best;
};

/**
 * The « chez le lecteur » clock of one attribution: the later of the envoi and
 * the last réattribution. Shared by the demande and the attribution side, so a
 * book out with a lecteur is late on both lists on the same day.
 */
export function lecteurClock(a: {
    sentToReaderDate: Date | null;
    readerHistory: { assignedDate: Date }[];
}): Date | null {
    return a.sentToReaderDate ? maxDate([a.sentToReaderDate, a.readerHistory[0]?.assignedDate]) : null;
}

/** Level of a stage whose clock started at `depuis`. */
function niveauFor(etape: DelaiEtape, jours: number | null): DelaiNiveau {
    if (jours === null) return 'a_jour';
    const { surveillerJours, retardJours } = DELAI_ETAPES[etape];
    return jours >= retardJours ? 'en_retard' : jours >= surveillerJours ? 'a_surveiller' : 'a_jour';
}

function delaiOf(etape: DelaiEtape, depuis: Date | null, now: Date, bloquee = false): Delai {
    const jours = depuis ? Math.max(0, Math.floor((now.getTime() - depuis.getTime()) / DAY_MS)) : null;
    return { etape, niveau: niveauFor(etape, jours), depuis, jours, bloquee };
}

/** The stage an open demande is in. Status decides it — the dates only start the clock. */
export function etapeOf(row: Pick<DelaiRow, 'isDuplication' | 'statusId'>): DelaiEtape {
    if (row.isDuplication) return 'duplication';
    if (row.statusId === STATUS.EN_COURS) return 'chez_lecteur';
    if (row.statusId === STATUS.ATTENTE_AUDITEUR) return 'a_expedier';
    return 'attente_lecteur';
}

/**
 * Stage, clock and level of one demande. Null for a closed demande: it waits
 * for nothing, so it has no délai at all.
 */
export function computeDelai(row: DelaiRow, now: Date = new Date()): Delai | null {
    if (row.closureDate || CLOSED_STATUSES.includes(row.statusId)) return null;

    const etape = etapeOf(row);
    let depuis: Date | null = null;
    let bloquee = false;

    switch (etape) {
        case 'attente_lecteur':
            depuis = row.requestReceivedDate;
            break;
        case 'chez_lecteur': {
            // Per attribution out with a lecteur: the later of the envoi and the
            // last réattribution. With several (it doesn't happen, but nothing
            // forbids it) the oldest one is the one that is late.
            const out = row.assignments.filter((a) => a.sentToReaderDate && !a.returnedToECADate);
            const clocks = out.map(lecteurClock);
            depuis = clocks.length
                ? clocks.reduce((min, d) => (d! < min! ? d : min))
                // « En cours » with no attribution out — a legacy row. Fall back
                // on the demande itself rather than hiding it.
                : row.requestReceivedDate;
            break;
        }
        case 'a_expedier':
            depuis = maxDate(row.assignments.map((a) => a.returnedToECADate)) ?? row.events[0]?.createdAt ?? null;
            break;
        case 'duplication': {
            const bookAssignments = row.catalogue.assignments;
            bloquee = !row.catalogue.audio_filepath
                && bookAssignments.some((a) => RECORDING_UNDER_WAY.includes(a.statusId));
            if (!bloquee) {
                depuis = maxDate([row.requestReceivedDate, ...bookAssignments.map((a) => a.returnedToECADate)]);
            }
            break;
        }
    }

    return delaiOf(etape, depuis, now, bloquee);
}

/** Every open demande's délai, keyed by id — optionally narrowed (one auditeur's dossier). */
export async function getOpenOrderDelais(
    where: Prisma.OrdersWhereInput = {},
    now: Date = new Date(),
): Promise<Map<number, Delai>> {
    const rows = await prisma.orders.findMany({
        where: { AND: [openOrderWhere, where] },
        select: delaiSelect,
    });
    const map = new Map<number, Delai>();
    for (const row of rows) {
        const delai = computeDelai(row, now);
        if (delai) map.set(row.id, delai);
    }
    return map;
}

// ─── Attributions ───────────────────────────────────────────────────────────
//
// An attribution covers the first two stages of an enregistrement: waiting to
// go out (« Attente envoi vers lecteur »), then out with the lecteur (« En
// cours »). Once « Terminé » the book is back aux ECA and what remains — the
// expédition — is the demande's business, so a finished attribution has no
// délai. Same thresholds, same clocks as the demande side: the waiting clock
// is the demande's date, the lecteur's clock is `lecteurClock`.

/** What `computeAssignmentDelai` reads (nested filters: see delaiSelect). */
export const assignmentDelaiSelect = {
    id: true,
    statusId: true,
    receptionDate: true,
    sentToReaderDate: true,
    returnedToECADate: true,
    readerHistory: { select: { assignedDate: true }, orderBy: { assignedDate: 'desc' }, take: 1 },
    order: { select: { requestReceivedDate: true } },
} as const satisfies Prisma.AssignmentSelect;

export type AssignmentDelaiRow = Prisma.AssignmentGetPayload<{ select: typeof assignmentDelaiSelect }>;

export function computeAssignmentDelai(row: AssignmentDelaiRow, now: Date = new Date()): Delai | null {
    // The demande's date where there is one; the attribution's own date de
    // réception otherwise (the two coincide across the imported corpus).
    const waitingSince = row.order?.requestReceivedDate ?? row.receptionDate;
    if (row.statusId === STATUS.ATTENTE) return delaiOf('attente_lecteur', waitingSince, now);
    if (row.statusId === STATUS.EN_COURS) {
        return delaiOf('chez_lecteur', lecteurClock(row) ?? waitingSince, now);
    }
    return null;
}

/** Every open attribution's délai, keyed by id — optionally narrowed (a dossier). */
export async function getOpenAssignmentDelais(
    where: Prisma.AssignmentWhereInput = {},
    now: Date = new Date(),
): Promise<Map<number, Delai>> {
    const rows = await prisma.assignment.findMany({
        where: { AND: [{ statusId: { in: [STATUS.ATTENTE, STATUS.EN_COURS] } }, where] },
        select: assignmentDelaiSelect,
    });
    const map = new Map<number, Delai>();
    for (const row of rows) {
        const delai = computeAssignmentDelai(row, now);
        if (delai) map.set(row.id, delai);
    }
    return map;
}

// ─── Filter, badges, tallies — shared by both lists ────────────────────────

/**
 * The « Retard » filter of the demandes and attributions lists, as a where
 * clause built from the ids the délais flagged. `true` / `false` are the values
 * the demandes filter has always carried in its URL, so bookmarks keep working:
 *  - `true`       — en retard, whatever the stage
 *  - `surveiller` — past the amber line, not yet the red one
 *  - `false`      — à jour: every other row, closed ones included
 * Typed structurally so it fits an Orders and an Assignment where alike.
 */
export function retardWhere(
    retard: string | undefined,
    delais: Map<number, Delai>,
): { id: { in: number[] } | { notIn: number[] } } | null {
    const idsAt = (...niveaux: DelaiNiveau[]) =>
        [...delais].filter(([, d]) => niveaux.includes(d.niveau)).map(([id]) => id);

    if (retard === 'true') return { id: { in: idsAt('en_retard') } };
    if (retard === 'surveiller') return { id: { in: idsAt('a_surveiller') } };
    if (retard === 'false') return { id: { notIn: idsAt('en_retard', 'a_surveiller') } };
    return null;
}

/** JSON-safe, display-ready délai for a table row — only for rows past a line. */
export type SerializedDelai = {
    niveau: Exclude<DelaiNiveau, 'a_jour'>;
    /** Short badge: « En retard · 97 j ». */
    badge: string;
    /** Full sentence for the tooltip / screen readers. */
    phrase: string;
};

/**
 * « 12 jours », « 5 mois », « 8 ans ». The imported backlog holds demandes
 * open for years, and « 3263 j » is a number to decode, not a duration to read.
 * Days up to the red lines people reason in (the longest is 90), then months.
 */
export function dureeLabel(jours: number): string {
    if (jours < 120) return `${jours} jour${jours > 1 ? 's' : ''}`;
    if (jours < 730) return `${Math.floor(jours / 30.44)} mois`;
    return `${Math.floor(jours / 365.25)} ans`;
}

export function serializeDelai(delai: Delai): SerializedDelai | null {
    if (delai.niveau === 'a_jour' || delai.jours === null) return null;
    const cfg = DELAI_ETAPES[delai.etape];
    const word = delai.niveau === 'en_retard' ? 'En retard' : cfg.surveillerLabel;
    return {
        niveau: delai.niveau,
        badge: `${word} · ${dureeLabel(delai.jours)}`,
        phrase: `${word} : ${cfg.inSentence} depuis ${dureeLabel(delai.jours)} `
            + `(à surveiller après ${cfg.surveillerJours} jours, en retard après ${cfg.retardJours}).`,
    };
}

/** Row badges for one page of the list, keyed by demande id. */
export function serializeDelaisFor(ids: number[], delais: Map<number, Delai>): Record<number, SerializedDelai> {
    const out: Record<number, SerializedDelai> = {};
    for (const id of ids) {
        const d = delais.get(id);
        const s = d && serializeDelai(d);
        if (s) out[id] = s;
    }
    return out;
}

/** Per-stage tallies for the dashboard's « À traiter » cards. */
export type DelaiTally = { total: number; aSurveiller: number; enRetard: number; bloquees: number };

export function tallyDelais(delais: Map<number, Delai>): Record<DelaiEtape, DelaiTally> {
    const empty = (): DelaiTally => ({ total: 0, aSurveiller: 0, enRetard: 0, bloquees: 0 });
    const out: Record<DelaiEtape, DelaiTally> = {
        attente_lecteur: empty(),
        chez_lecteur: empty(),
        a_expedier: empty(),
        duplication: empty(),
    };
    for (const d of delais.values()) {
        const t = out[d.etape];
        t.total += 1;
        if (d.bloquee) t.bloquees += 1;
        if (d.niveau === 'en_retard') t.enRetard += 1;
        else if (d.niveau === 'a_surveiller') t.aSurveiller += 1;
    }
    return out;
}
