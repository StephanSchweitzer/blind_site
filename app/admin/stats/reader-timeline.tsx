'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    getUserActivityStatusColor,
    getUserActivityStatusLabel,
} from '@/lib/user-activity-enums';
import type { ReaderInterval, ReaderStatsResponse } from '@/types';
import { buildBuckets, formatDayShort } from './stats-utils';

// Module B: per-lecteur timeline of attribution intervals
// (sentToReaderDate → returnedToECADate). Still-out attributions run to
// "today"; those out beyond the threshold are flagged overdue — the key
// problematic-volunteer signal. Activity-status changes are overlaid as
// markers (annotation, not a metric). Data volumes are small (one window),
// so everything is computed straight in render.

const DAY_MS = 86_400_000;
const OVERDUE_CHOICES = [30, 60, 90];

type IntervalStatus = 'returned' | 'out' | 'overdue';

interface PositionedInterval extends ReaderInterval {
    status: IntervalStatus;
    leftPct: number;
    widthPct: number;
}

// --primary has no <alpha-value> in the Tailwind config, so the returned-bar
// tint is inlined; the warning colors use standard palette classes.
const BAR_STYLE: Record<IntervalStatus, React.CSSProperties> = {
    returned: { backgroundColor: 'hsl(var(--primary) / 0.55)' },
    out: {},
    overdue: {},
};

const BAR_CLASS: Record<IntervalStatus, string> = {
    returned: '',
    out: 'bg-amber-400 dark:bg-amber-500',
    overdue: 'bg-red-500 dark:bg-red-600',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

export default function ReaderTimeline({
    start,
    end,
    data,
    now,
}: {
    start: string;
    end: string;
    data: ReaderStatsResponse | null;
    /** Timestamp captured when the data was fetched (Date.now() is impure in render). */
    now: number;
}) {
    const [overdueDays, setOverdueDays] = useState(60);
    const [onlyOverdue, setOnlyOverdue] = useState(false);

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const nowMs = Math.min(now, endMs);
    const pct = (ms: number) =>
        Math.min(100, Math.max(0, ((ms - startMs) / (endMs - startMs)) * 100));

    const byReader = new Map<number, PositionedInterval[]>();
    for (const interval of data?.intervals ?? []) {
        const sentMs = Date.parse(interval.sentAt);
        const returnedMs = interval.returnedAt ? Date.parse(interval.returnedAt) : null;
        const status: IntervalStatus =
            returnedMs !== null
                ? 'returned'
                : now - sentMs > overdueDays * DAY_MS
                    ? 'overdue'
                    : 'out';
        const leftPct = pct(sentMs);
        const rightPct = pct(returnedMs ?? nowMs);
        const positioned: PositionedInterval = {
            ...interval,
            status,
            leftPct,
            widthPct: Math.max(rightPct - leftPct, 0.7),
        };
        const list = byReader.get(interval.readerId);
        if (list) list.push(positioned); else byReader.set(interval.readerId, [positioned]);
    }

    const countOf = (id: number, status: IntervalStatus) =>
        (byReader.get(id) ?? []).filter((i) => i.status === status).length;

    const rows = (data?.readers ?? [])
        .map((reader) => ({
            reader,
            intervals: byReader.get(reader.id) ?? [],
            overdue: countOf(reader.id, 'overdue'),
            out: countOf(reader.id, 'out'),
        }))
        .filter((row) => row.intervals.length > 0 && (!onlyOverdue || row.overdue > 0))
        .sort((a, b) =>
            b.overdue - a.overdue || b.out - a.out || a.reader.name.localeCompare(b.reader.name, 'fr')
        );

    const markers = new Map<number, ReaderStatsResponse['activityEvents']>();
    for (const event of data?.activityEvents ?? []) {
        const list = markers.get(event.userId);
        if (list) list.push(event); else markers.set(event.userId, [event]);
    }

    // ~8 tick labels max, snapped to ISO Mondays like the aggregates.
    const weeks = buildBuckets(start, end, 'week');
    const tickEvery = Math.max(1, Math.ceil(weeks.length / 8));
    const ticks = weeks.filter((_, i) => i % tickEvery === 0);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h2 className="text-lg font-semibold text-foreground">
                    Attributions des lecteurs
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-1">Retard après</span>
                        {OVERDUE_CHOICES.map((days) => (
                            <Button
                                key={days}
                                size="sm"
                                variant={days === overdueDays ? 'default' : 'outline'}
                                onClick={() => setOverdueDays(days)}
                            >
                                {days} j
                            </Button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                            type="checkbox"
                            checked={onlyOverdue}
                            onChange={(e) => setOnlyOverdue(e.target.checked)}
                            className="accent-current"
                        />
                        Uniquement les lecteurs en retard
                    </label>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={BAR_STYLE.returned} /> Rendue
                </span>
                <span className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-sm ${BAR_CLASS.out}`} /> En cours
                </span>
                <span className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-sm ${BAR_CLASS.overdue}`} /> En retard
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-foreground" /> Changement de statut
                </span>
            </div>

            {!data && <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>}
            {data && rows.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucune attribution sur la période.
                </p>
            )}

            {rows.length > 0 && (
                <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                        {/* time axis */}
                        <div className="relative h-5 ml-48 text-[10px] text-muted-foreground">
                            {ticks.map((tick) => (
                                <span
                                    key={tick}
                                    className="absolute -translate-x-1/2"
                                    style={{ left: `${pct(Date.parse(tick))}%` }}
                                >
                                    {formatDayShort(tick)}
                                </span>
                            ))}
                        </div>

                        <div className="space-y-1">
                            {rows.map(({ reader, intervals, overdue }) => (
                                <div key={reader.id} className="flex items-center">
                                    <div className="w-48 shrink-0 flex items-center gap-1.5 pr-2">
                                        <span
                                            className="text-xs font-medium text-foreground truncate"
                                            title={reader.name}
                                        >
                                            {reader.name}
                                        </span>
                                        {overdue > 0 && (
                                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 shrink-0">
                                                {overdue} en retard
                                            </Badge>
                                        )}
                                        {reader.activityStatus !== 'ACTIVE' && (
                                            <Badge className={`${getUserActivityStatusColor(reader.activityStatus)} shrink-0`}>
                                                {getUserActivityStatusLabel(reader.activityStatus)}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="relative flex-1 h-7 rounded bg-muted/50">
                                        {intervals.map((interval) => {
                                            const label = [
                                                interval.bookTitle,
                                                `envoyée le ${fmtDate(interval.sentAt)}`,
                                                interval.returnedAt
                                                    ? `rendue le ${fmtDate(interval.returnedAt)}`
                                                    : 'toujours en cours',
                                                interval.readerChanges > 1 ? 'réattribuée' : null,
                                            ].filter(Boolean).join(' — ');
                                            return (
                                                <a
                                                    key={interval.assignmentId}
                                                    href={`/admin/assignments?assignment=${interval.assignmentId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={label}
                                                    aria-label={label}
                                                    className={`absolute top-1 bottom-1 rounded hover:opacity-80 ${BAR_CLASS[interval.status]} ${
                                                        interval.readerChanges > 1 ? 'ring-1 ring-foreground/50' : ''
                                                    }`}
                                                    style={{
                                                        left: `${interval.leftPct}%`,
                                                        width: `${interval.widthPct}%`,
                                                        ...BAR_STYLE[interval.status],
                                                    }}
                                                />
                                            );
                                        })}
                                        {(markers.get(reader.id) ?? []).map((event, i) => (
                                            <span
                                                key={i}
                                                title={`${getUserActivityStatusLabel(event.toStatus)} — ${fmtDate(event.changedAt)}`}
                                                className={`absolute top-0 w-2.5 h-2.5 -translate-x-1/2 rounded-full border-2 border-card z-10 ${getUserActivityStatusColor(event.toStatus)}`}
                                                style={{ left: `${pct(Date.parse(event.changedAt))}%` }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
