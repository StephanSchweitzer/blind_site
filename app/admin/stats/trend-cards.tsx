'use client';

import React from 'react';
import { AdminCard } from '@/components/ui/admin';
import type { TrendMetric, TrendPoint, TrendsResponse } from '@/types';
import {
    METRIC_HINTS,
    METRIC_LABELS,
    TREND_METRIC_ORDER,
    formatDayShort,
} from './stats-utils';

// Org-wide weekly totals, one small sparkline card per tracked series.
// Eleven of them, so the cards are deliberately compact: a number, a shape, and
// a line of context — the heatmap below is where a series gets interrogated.

function Sparkline({ points }: { points: TrendPoint[] }) {
    const width = 220;
    const height = 40;
    if (points.length === 0) {
        return <div className="h-10 flex items-center text-xs text-muted-foreground">Aucune donnée</div>;
    }
    const max = Math.max(...points.map((p) => p.count), 1);
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const y = (count: number) => height - 4 - (count / max) * (height - 8);
    const coords = points.map((p, i) => `${(i * stepX).toFixed(1)},${y(p.count).toFixed(1)}`);
    const area = `0,${height} ${coords.join(' ')} ${width},${height}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-10"
            preserveAspectRatio="none"
            role="img"
            aria-label="Évolution hebdomadaire"
        >
            <polygon points={area} style={{ fill: 'hsl(var(--primary) / 0.15)' }} />
            <polyline
                points={coords.join(' ')}
                fill="none"
                strokeWidth="2"
                style={{ stroke: 'hsl(var(--primary))' }}
            />
        </svg>
    );
}

function TrendCard({ metric, points, loaded }: {
    metric: TrendMetric;
    points: TrendPoint[];
    loaded: boolean;
}) {
    const total = points.reduce((sum, p) => sum + p.count, 0);
    const lastWeek = points.length > 0 ? points[points.length - 1] : null;
    const hint = METRIC_HINTS[metric];

    return (
        <AdminCard className="p-3">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground leading-tight">
                    {METRIC_LABELS[metric]}
                </h3>
                <span className="text-xl font-bold text-foreground tabular-nums">
                    {loaded ? total : '…'}
                </span>
            </div>
            <Sparkline points={points} />
            <p className="text-[11px] text-muted-foreground leading-snug">
                {lastWeek
                    ? `Semaine du ${formatDayShort(lastWeek.bucket)} : ${lastWeek.count}`
                    : 'Totaux hebdomadaires sur la période'}
            </p>
            {hint && <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{hint}</p>}
        </AdminCard>
    );
}

export default function TrendCards({ trends }: { trends: TrendsResponse | null }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {TREND_METRIC_ORDER.map((metric) => (
                <TrendCard
                    key={metric}
                    metric={metric}
                    points={trends?.[metric] ?? []}
                    loaded={trends !== null}
                />
            ))}
        </div>
    );
}
