'use client';

import React, { useRef, useState } from 'react';
import { AdminCard } from '@/components/ui/admin';
import type { TrendMetric, TrendPoint, TrendsResponse } from '@/types';
import {
    METRIC_HINTS,
    METRIC_LABELS,
    TREND_TABS,
    formatDayShort,
} from './stats-utils';

// Org-wide totals, one small sparkline card per tracked series, grouped into
// tabs (see TREND_TABS for what is clustered with what, and what left the strip).
//
// The tabs are presentation only: /api/stats/trends returns every series in one
// response, so switching tabs costs no request. The period total sits on each
// tab label so a hidden cluster still announces whether anything happened —
// otherwise tabbing would trade clutter for a hunt.
//
// Built on the page's own pill idiom rather than a new Tabs dependency, but with
// the tablist semantics pills normally lack: this portal is run by an
// association serving visually impaired readers, and a control that a screen
// reader cannot announce or an arrow key cannot reach is not an option here.

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

const sumOf = (trends: TrendsResponse | null, metrics: TrendMetric[]): number =>
    metrics.reduce(
        (total, metric) => total + (trends?.[metric] ?? []).reduce((sum, p) => sum + p.count, 0),
        0
    );

export default function TrendCards({ trends }: { trends: TrendsResponse | null }) {
    const [active, setActive] = useState(TREND_TABS[0].value);
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const activeTab = TREND_TABS.find((tab) => tab.value === active) ?? TREND_TABS[0];

    // Arrow keys move between tabs and activate as they go, which is the
    // expected behaviour for a tablist whose panels are already loaded.
    const onKeyDown = (event: React.KeyboardEvent) => {
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const index = TREND_TABS.findIndex((tab) => tab.value === active);
        const next = TREND_TABS[(index + delta + TREND_TABS.length) % TREND_TABS.length];
        setActive(next.value);
        tabRefs.current[next.value]?.focus();
    };

    return (
        <div>
            <div
                role="tablist"
                aria-label="Séries suivies"
                onKeyDown={onKeyDown}
                className="flex flex-wrap gap-1 mb-3"
            >
                {TREND_TABS.map((tab) => {
                    const selected = tab.value === active;
                    return (
                        <button
                            key={tab.value}
                            ref={(node) => { tabRefs.current[tab.value] = node; }}
                            type="button"
                            role="tab"
                            id={`trend-tab-${tab.value}`}
                            aria-selected={selected}
                            aria-controls={`trend-panel-${tab.value}`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => setActive(tab.value)}
                            className={`h-9 rounded-md px-3 text-sm transition-colors ${
                                selected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'border border-border text-foreground hover:bg-muted'
                            }`}
                        >
                            {tab.label}
                            <span
                                className={`ml-2 tabular-nums ${
                                    selected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                }`}
                            >
                                {trends ? sumOf(trends, tab.metrics) : '…'}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div
                role="tabpanel"
                id={`trend-panel-${activeTab.value}`}
                aria-labelledby={`trend-tab-${activeTab.value}`}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
                {activeTab.metrics.map((metric) => (
                    <TrendCard
                        key={metric}
                        metric={metric}
                        points={trends?.[metric] ?? []}
                        loaded={trends !== null}
                    />
                ))}
            </div>
        </div>
    );
}
