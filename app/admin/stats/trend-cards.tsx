'use client';

import React from 'react';
import { AdminCard } from '@/components/ui/admin';
import type { StaffMetric, TrendPoint, TrendsResponse } from '@/types';
import { METRIC_LABELS, formatDayShort } from './stats-utils';

// Org-wide weekly totals per metric, as small sparkline cards above the heatmap.

const ORDERED: StaffMetric[] = ['books', 'billEvents', 'orders'];

function Sparkline({ points }: { points: TrendPoint[] }) {
    const width = 220;
    const height = 48;
    if (points.length === 0) {
        return <div className="h-12 flex items-center text-xs text-muted-foreground">Aucune donnée</div>;
    }
    const max = Math.max(...points.map((p) => p.count), 1);
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const y = (count: number) => height - 4 - (count / max) * (height - 8);
    const coords = points.map((p, i) => `${(i * stepX).toFixed(1)},${y(p.count).toFixed(1)}`);
    const area = `0,${height} ${coords.join(' ')} ${width},${height}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-12"
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

export default function TrendCards({ trends }: { trends: TrendsResponse | null }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ORDERED.map((metric) => {
                const points = trends?.[metric] ?? [];
                const total = points.reduce((sum, p) => sum + p.count, 0);
                const lastWeek = points.length > 0 ? points[points.length - 1] : null;
                return (
                    <AdminCard key={metric} className="p-4">
                        <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                {METRIC_LABELS[metric]}
                            </h3>
                            <span className="text-2xl font-bold text-foreground">
                                {trends ? total : '…'}
                            </span>
                        </div>
                        <Sparkline points={points} />
                        <p className="text-xs text-muted-foreground">
                            {lastWeek
                                ? `Semaine du ${formatDayShort(lastWeek.bucket)} : ${lastWeek.count}`
                                : 'Totaux hebdomadaires sur la période'}
                        </p>
                    </AdminCard>
                );
            })}
        </div>
    );
}
