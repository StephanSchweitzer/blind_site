import type { MemberGroup, StaffMetric, StatsGranularity, TrendMetric } from '@/types';

// Client-side date helpers for the stats dashboard. Buckets are plain
// 'YYYY-MM-DD' keys manipulated through UTC arithmetic so no local-timezone
// parsing can shift a day; they must line up with the server's Paris-day
// buckets, which they do for a viewer on French time.

const DAY_MS = 86_400_000;

const keyFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const todayKey = (): string => {
    const now = new Date();
    return keyFromMs(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export const addDays = (key: string, days: number): string =>
    keyFromMs(Date.parse(key) + days * DAY_MS);

/** ISO Monday of the bucket's week (matches Postgres date_trunc('week')). */
export const mondayOf = (key: string): string => {
    const dow = (new Date(key).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    return addDays(key, -dow);
};

/** Ordered bucket keys covering [start, end) at the given granularity. */
export function buildBuckets(start: string, end: string, granularity: StatsGranularity): string[] {
    const step = granularity === 'week' ? 7 : 1;
    const buckets: string[] = [];
    for (let key = granularity === 'week' ? mondayOf(start) : start; key < end; key = addDays(key, step)) {
        buckets.push(key);
    }
    return buckets;
}

const asUtcDate = (key: string) => new Date(`${key}T00:00:00Z`);

export const formatDayShort = (key: string): string =>
    asUtcDate(key).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export const formatDayLong = (key: string): string =>
    asUtcDate(key).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });

export const formatBucketLabel = (key: string, granularity: StatsGranularity): string =>
    granularity === 'week' ? `Semaine du ${formatDayShort(key)}` : formatDayLong(key);

export const formatDateTime = (iso: string): string =>
    new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// Range presets shared by both modules.
export type RangePreset = '14d' | '28d' | '12w' | '26w';

export interface ResolvedRange {
    start: string;
    end: string; // exclusive
    granularity: StatsGranularity;
}

export const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
    { value: '14d', label: '2 semaines' },
    { value: '28d', label: '4 semaines' },
    { value: '12w', label: '3 mois' },
    { value: '26w', label: '6 mois' },
];

export function resolveRange(preset: RangePreset): ResolvedRange {
    const end = addDays(todayKey(), 1); // include today
    switch (preset) {
        case '14d': return { start: addDays(end, -14), end, granularity: 'day' };
        case '28d': return { start: addDays(end, -28), end, granularity: 'day' };
        case '12w': return { start: addDays(mondayOf(todayKey()), -11 * 7), end, granularity: 'week' };
        case '26w': return { start: addDays(mondayOf(todayKey()), -25 * 7), end, granularity: 'week' };
    }
}

export const METRIC_LABELS: Record<TrendMetric, string> = {
    books: 'Livres ajoutés',
    billEvents: 'Événements de facturation',
    orders: 'Demandes traitées',
    assignments: 'Attributions envoyées',
    coupsDeCoeur: 'Coups de cœur',
    news: 'Actualités publiées',
    auditEvents: 'Modifications tracées',
    payments: 'Paiements enregistrés',
    bills: 'Factures créées',
    newMembers: 'Nouveaux membres',
    activityEvents: 'Changements de statut',
};

/** Metrics that can be broken down per permanent — mirrors STAFF_METRICS. */
export const STAFF_METRIC_ORDER: StaffMetric[] = [
    'books',
    'billEvents',
    'orders',
    'assignments',
    'coupsDeCoeur',
    'news',
    'auditEvents',
];

/**
 * The trend strip, clustered.
 *
 * Eleven cards side by side read as one undifferentiated wall — nothing groups
 * « Livres ajoutés » with « Événements de facturation » except that both are
 * counts. Three tabs of two or three cards each give every number a heading that
 * says what question it answers.
 *
 * Two series are deliberately NOT here:
 *   - newMembers / activityEvents moved into the Membres card, where the
 *     Lecteurs / Auditeurs / Autres filter makes them say more than a bare total;
 *   - auditEvents left the strip altogether. The journal is purged after
 *     AUDIT_RETENTION_DAYS, so on the 3-month and 6-month presets that card
 *     drew two weeks of real data followed by a long tail of zeros — a decline
 *     that never happened. « Journal des modifications » states the same thing
 *     truthfully in its own header (rows kept, window, size on disk).
 */
export interface TrendTab {
    value: string;
    label: string;
    metrics: TrendMetric[];
}

export const TREND_TABS: TrendTab[] = [
    {
        value: 'production',
        label: 'Production',
        metrics: ['books', 'coupsDeCoeur', 'news'],
    },
    {
        value: 'demandes',
        label: 'Demandes',
        metrics: ['orders', 'assignments'],
    },
    {
        value: 'facturation',
        label: 'Facturation',
        metrics: ['bills', 'billEvents', 'payments'],
    },
];

/** Every series the strip still shows, in reading order. */
export const TREND_METRIC_ORDER: TrendMetric[] = TREND_TABS.flatMap((tab) => tab.metrics);

/**
 * A one-line caveat under a card, where the number alone would mislead. Only
 * the metrics that genuinely need one have an entry.
 */
export const METRIC_HINTS: Partial<Record<TrendMetric, string>> = {
    orders: 'Hors demandes importées sans date ni permanent.',
    assignments: 'Comptées à la date d’envoi au lecteur.',
    auditEvents: 'Le journal ne conserve que les 14 derniers jours.',
};

export const MEMBER_GROUP_FILTERS: Array<{ value: MemberGroup | 'all'; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'lecteur', label: 'Lecteurs' },
    { value: 'auditeur', label: 'Auditeurs' },
    { value: 'autre', label: 'Autres' },
];

export const MEMBER_GROUP_LABELS: Record<MemberGroup, string> = {
    lecteur: 'Lecteurs',
    auditeur: 'Auditeurs',
    autre: 'Autres',
};

/** Euros, no cents — the amounts on this page are read, not reconciled. */
export const formatEuros = (amount: number): string =>
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
