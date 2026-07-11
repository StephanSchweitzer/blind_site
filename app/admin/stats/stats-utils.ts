import type { StaffMetric, StatsGranularity } from '@/types';

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

export const METRIC_LABELS: Record<StaffMetric, string> = {
    books: 'Livres ajoutés',
    billEvents: 'Événements de facturation',
    orders: 'Demandes traitées',
};
