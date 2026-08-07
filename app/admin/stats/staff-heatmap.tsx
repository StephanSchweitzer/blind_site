'use client';

import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { StaffStatsResponse, StatsGranularity } from '@/types';
import type { DrawerSelection } from './detail-drawer';
import { buildBuckets, formatBucketLabel, formatDayShort } from './stats-utils';

// GitHub-contributions-style heatmap: rows = permanents, columns = day/week
// buckets, cell tint = count. Clicking a non-empty cell opens the detail drawer.

interface StaffHeatmapProps {
    start: string;
    end: string;
    granularity: StatsGranularity;
    data: StaffStatsResponse | null;
    loading: boolean;
    selection: DrawerSelection | null;
    onCellClick: (actorId: number, actorName: string, bucket: string) => void;
}

/** Cell tint on the brand token; --primary has no <alpha-value> in the
 *  Tailwind config, so opacity modifiers won't work — inline hsl() instead. */
const cellStyle = (count: number, max: number): React.CSSProperties | undefined =>
    count > 0
        ? { backgroundColor: `hsl(var(--primary) / ${(0.2 + 0.8 * (count / max)).toFixed(2)})` }
        : undefined;

export default function StaffHeatmap({
    start,
    end,
    granularity,
    data,
    loading,
    selection,
    onCellClick,
}: StaffHeatmapProps) {
    const buckets = useMemo(() => buildBuckets(start, end, granularity), [start, end, granularity]);

    const { actors, counts, max } = useMemo(() => {
        // rows may carry a per-type breakdown (bill events): sum per (actor, bucket).
        const counts = new Map<number, Map<string, number>>();
        let max = 1;
        for (const row of data?.rows ?? []) {
            let byBucket = counts.get(row.actorId);
            if (!byBucket) counts.set(row.actorId, (byBucket = new Map()));
            const next = (byBucket.get(row.bucket) ?? 0) + row.count;
            byBucket.set(row.bucket, next);
            if (next > max) max = next;
        }
        const totalOf = (id: number) =>
            [...(counts.get(id)?.values() ?? [])].reduce((sum, c) => sum + c, 0);
        const actors = [...(data?.actors ?? [])].sort((a, b) => totalOf(b.id) - totalOf(a.id));
        return { actors, counts, max };
    }, [data]);

    if (loading && !data) {
        return (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
                <Loader2 size={16} className="animate-spin" />
                Chargement…
            </p>
        );
    }
    if (actors.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8 text-center">
                Aucune activité sur la période.
            </p>
        );
    }

    return (
        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="border-separate border-spacing-[3px]">
                <thead>
                    <tr>
                        <th className="sticky left-0 bg-card z-10" aria-label="Permanent" />
                        {buckets.map((bucket) => (
                            <th
                                key={bucket}
                                scope="col"
                                title={formatBucketLabel(bucket, granularity)}
                                className="text-[10px] font-normal text-muted-foreground text-center align-bottom pb-1 min-w-7"
                            >
                                {formatDayShort(bucket)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {actors.map((actor) => (
                        <tr key={actor.id}>
                            <th
                                scope="row"
                                className="sticky left-0 bg-card z-10 text-xs font-medium text-foreground text-left pr-3 whitespace-nowrap max-w-44 truncate"
                                title={actor.name}
                            >
                                {actor.name}
                            </th>
                            {buckets.map((bucket) => {
                                const count = counts.get(actor.id)?.get(bucket) ?? 0;
                                const isSelected =
                                    selection?.actorId === actor.id && selection?.bucket === bucket;
                                const label = `${actor.name} — ${formatBucketLabel(bucket, granularity)} : ${count}`;
                                return (
                                    <td key={bucket} className="p-0">
                                        <button
                                            type="button"
                                            disabled={count === 0}
                                            onClick={() => onCellClick(actor.id, actor.name, bucket)}
                                            title={label}
                                            aria-label={label}
                                            className={`block w-7 h-7 rounded-sm transition-transform ${
                                                count === 0
                                                    ? 'bg-muted cursor-default'
                                                    : 'hover:scale-110 cursor-pointer'
                                            } ${isSelected ? 'ring-2 ring-ring' : ''}`}
                                            style={cellStyle(count, max)}
                                        >
                                            <span className="sr-only">{label}</span>
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <span>Moins</span>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <span
                        key={ratio}
                        className={`w-4 h-4 rounded-sm ${ratio === 0 ? 'bg-muted' : ''}`}
                        style={ratio > 0 ? cellStyle(ratio * max, max) : undefined}
                    />
                ))}
                <span>Plus</span>
            </div>
        </div>
    );
}
