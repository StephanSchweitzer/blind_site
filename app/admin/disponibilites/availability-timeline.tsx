'use client';

import React from 'react';
import Link from 'next/link';
import type { DayKey } from '@/types';
import {
    addDays,
    daysBetween,
    formatDayKey,
    mondayOf,
    weeklyCoverage,
    type Absence,
    type CoverageWeek,
} from '@/lib/users/availability';
import type { AvailabilityPerson } from '@/types';
import { getMemberTypeColor, getMemberTypeLabel } from '@/lib/user-enums';

/**
 * Period view of who is away when: one row per indisponibilité, bars clamped to
 * the visible window, plus a weekly "combien de lecteurs manquent" strip above
 * them. Reads like the reader timeline on /admin/stats on purpose — same
 * left-label + proportional-bar grammar, so a permanent already knows how to
 * read it.
 */

const STATE_BAR: Record<Absence['state'], string> = {
    current: 'bg-blue-500 dark:bg-blue-500',
    upcoming: 'bg-amber-400 dark:bg-amber-500',
    elapsed: 'bg-muted-foreground/40',
    openEnded: 'bg-purple-500 dark:bg-purple-500',
};

const STATE_LABEL: Record<Absence['state'], string> = {
    current: 'Indisponible actuellement',
    upcoming: 'Indisponibilité à venir',
    elapsed: 'Indisponibilité terminée',
    openEnded: 'Indisponibilité sans date de fin',
};

/** Month starts inside the period, for the axis ticks. */
function monthTicks(start: DayKey, end: DayKey): DayKey[] {
    const ticks: DayKey[] = [];
    const first = new Date(`${start}T00:00:00Z`);
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    if (cursor.toISOString().slice(0, 10) < start) {
        cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    }
    while (cursor.toISOString().slice(0, 10) <= end) {
        ticks.push(cursor.toISOString().slice(0, 10));
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return ticks;
}

const monthLabel = (key: DayKey): string =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    });

export default function AvailabilityTimeline({
    absences,
    people,
    today,
    start,
    end,
}: {
    absences: Absence[];
    people: AvailabilityPerson[];
    today: DayKey;
    start: DayKey;
    /** Inclusive last day of the period. */
    end: DayKey;
}) {
    const span = Math.max(1, daysBetween(start, end));
    const pct = (day: DayKey) =>
        Math.min(100, Math.max(0, (daysBetween(start, day) / span) * 100));

    const coverage: CoverageWeek[] = weeklyCoverage(people, start, end);
    const peakAway = Math.max(1, ...coverage.map((w) => w.away));
    const rosterSize = coverage[0]?.available !== undefined
        ? coverage[0].available + coverage[0].away
        : 0;

    const rows = [...absences].sort(
        (a, b) =>
            (a.from ?? '0000-00-00').localeCompare(b.from ?? '0000-00-00') ||
            a.person.name.localeCompare(b.person.name, 'fr')
    );

    const todayPct = today >= start && today <= end ? pct(today) : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {(['current', 'upcoming', 'openEnded'] as const).map((state) => (
                    <span key={state} className="flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-sm ${STATE_BAR[state]}`} />
                        {STATE_LABEL[state]}
                    </span>
                ))}
                <span className="flex items-center gap-1.5">
                    <span className="w-0.5 h-3 bg-red-500" /> Aujourd&apos;hui
                </span>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                    {/* month axis */}
                    <div className="relative h-5 ml-56 text-[10px] text-muted-foreground border-b border-border">
                        {monthTicks(start, end).map((tick) => (
                            <span
                                key={tick}
                                className="absolute -translate-x-1/2"
                                style={{ left: `${pct(tick)}%` }}
                            >
                                {monthLabel(tick)}
                            </span>
                        ))}
                    </div>

                    {/* weekly coverage strip: how many lecteurs are missing */}
                    {rosterSize > 0 && (
                        <div className="flex items-end mt-2 mb-3">
                            <div className="w-56 shrink-0 pr-3 text-right text-[11px] text-muted-foreground leading-tight">
                                Lecteurs absents
                                <br />
                                <span className="text-[10px]">
                                    (sur {rosterSize} au total)
                                </span>
                            </div>
                            <div className="relative flex-1 h-12 flex items-end gap-px">
                                {coverage.map((week) => (
                                    <div
                                        key={week.week}
                                        className="flex-1 min-w-[2px] bg-muted/60 rounded-t-sm relative group"
                                        style={{ height: '100%' }}
                                        title={`Semaine du ${formatDayKey(week.week)} — ${week.away} absent(s), ${week.available} disponible(s)`}
                                    >
                                        <div
                                            className="absolute bottom-0 inset-x-0 bg-blue-400/70 dark:bg-blue-500/60 rounded-t-sm"
                                            style={{ height: `${(week.away / peakAway) * 100}%` }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {rows.length === 0 && (
                        <p className="text-sm text-muted-foreground py-10 text-center">
                            Aucune indisponibilité sur cette période.
                        </p>
                    )}

                    <div className="space-y-1">
                        {rows.map(({ person, from, until, state }) => {
                            const barStart = from && from > start ? from : start;
                            const barEnd = until && until < end ? until : end;
                            const left = pct(barStart);
                            // +1 day so a single-day absence is still visible.
                            const width = Math.max(pct(addDays(barEnd, 1)) - left, 0.8);
                            const label = [
                                person.name,
                                STATE_LABEL[state].toLowerCase(),
                                from ? `du ${formatDayKey(from)}` : null,
                                until ? `au ${formatDayKey(until)}` : 'sans date de fin',
                                person.activeAssignments > 0
                                    ? `${person.activeAssignments} attribution(s) en cours`
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(' — ');

                            return (
                                <div key={person.id} className="flex items-center">
                                    <div className="w-56 shrink-0 flex items-center gap-1.5 pr-3">
                                        <Link
                                            href={`/admin/users/dossier/${person.id}`}
                                            className="text-xs font-medium text-foreground truncate hover:underline"
                                            title={person.name}
                                        >
                                            {person.name}
                                        </Link>
                                        <span
                                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getMemberTypeColor(person.memberType)}`}
                                        >
                                            {getMemberTypeLabel(person.memberType)}
                                        </span>
                                    </div>
                                    <div className="relative flex-1 h-7 rounded bg-muted/50">
                                        <div
                                            className={`absolute top-1 bottom-1 rounded ${STATE_BAR[state]}`}
                                            style={{ left: `${left}%`, width: `${width}%` }}
                                            title={label}
                                            aria-label={label}
                                        />
                                        {todayPct !== null && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-y-0 w-0.5 bg-red-500/70"
                                                style={{ left: `${todayPct}%` }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Period presets offered above the timeline. */
export const PERIOD_PRESETS = [
    { value: '1m', label: '1 mois', days: 30 },
    { value: '3m', label: '3 mois', days: 91 },
    { value: '6m', label: '6 mois', days: 182 },
    { value: '12m', label: '12 mois', days: 365 },
] as const;

export type PeriodPreset = typeof PERIOD_PRESETS[number]['value'];

/** The visible window: starts on the current week's Monday so bars line up. */
export function resolvePeriod(today: DayKey, preset: PeriodPreset) {
    const days = PERIOD_PRESETS.find((p) => p.value === preset)?.days ?? 91;
    const start = mondayOf(today);
    return { start, end: addDays(start, days) };
}
