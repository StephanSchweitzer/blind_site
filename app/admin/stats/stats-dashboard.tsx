'use client';

import React, { useEffect, useState } from 'react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import type {
    MemberStatsResponse,
    StaffMetric,
    StaffStatsResponse,
    TrendsResponse,
} from '@/types';
import {
    METRIC_HINTS,
    METRIC_LABELS,
    RANGE_PRESETS,
    RangePreset,
    STAFF_METRIC_ORDER,
    resolveRange,
} from './stats-utils';
import TrendCards from './trend-cards';
import StaffHeatmap from './staff-heatmap';
import DetailDrawer, { DrawerSelection } from './detail-drawer';
import MembersCard from './members-card';
import AuditTimeline from './audit-timeline';

// Super-admin activity dashboard. All charts consume pre-aggregated data
// (one GROUP BY per request); record lists are only fetched when a cell is
// clicked (see DetailDrawer) or when the journal is paged.
//
// Fetched results are tagged with the query key they answer, so "loading" is
// derived (stored key ≠ current key) instead of set synchronously in effects
// (react-hooks/set-state-in-effect).
//
// The journal keeps its own state: its window is the retention window, not the
// period presets, so wiring it to them would just promise data it cannot have.

interface Keyed<T> {
    key: string;
    data: T;
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

export default function StatsDashboard() {
    const [preset, setPreset] = useState<RangePreset>('28d');
    const [metric, setMetric] = useState<StaffMetric>('books');

    const [staff, setStaff] = useState<Keyed<StaffStatsResponse> | null>(null);
    const [trends, setTrends] = useState<Keyed<TrendsResponse> | null>(null);
    const [members, setMembers] = useState<Keyed<MemberStatsResponse> | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [selection, setSelection] = useState<DrawerSelection | null>(null);

    const range = resolveRange(preset);
    const rangeQuery = `start=${range.start}&end=${range.end}`;
    const staffKey = `${metric}|${rangeQuery}|${range.granularity}`;

    // Heatmap: refetch on metric or range change.
    useEffect(() => {
        let cancelled = false;
        fetchJson<StaffStatsResponse>(
            `/api/stats/staff?metric=${metric}&${rangeQuery}&granularity=${range.granularity}`
        )
            .then((data) => {
                if (!cancelled) { setStaff({ key: staffKey, data }); setError(null); }
            })
            .catch(() => { if (!cancelled) setError('Impossible de charger les statistiques.'); });
        return () => { cancelled = true; };
    }, [staffKey, metric, rangeQuery, range.granularity]);

    // Trend cards + Membres: refetch on range change only.
    useEffect(() => {
        let cancelled = false;
        fetchJson<TrendsResponse>(`/api/stats/trends?${rangeQuery}`)
            .then((data) => { if (!cancelled) setTrends({ key: rangeQuery, data }); })
            .catch(() => { if (!cancelled) setError('Impossible de charger les tendances.'); });
        fetchJson<MemberStatsResponse>(`/api/stats/members?${rangeQuery}`)
            .then((data) => { if (!cancelled) setMembers({ key: rangeQuery, data }); })
            .catch(() => { if (!cancelled) setError('Impossible de charger les statistiques membres.'); });
        return () => { cancelled = true; };
    }, [rangeQuery]);

    const staffLoading = staff?.key !== staffKey;
    const metricHint = METRIC_HINTS[metric];

    return (
        <div className="space-y-6">
            <AdminCard className="p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-xl font-bold text-foreground">Statistiques d’activité</h1>
                    <div className="flex flex-wrap gap-1">
                        {RANGE_PRESETS.map((p) => (
                            <Button
                                key={p.value}
                                size="sm"
                                variant={p.value === preset ? 'default' : 'outline'}
                                onClick={() => { setPreset(p.value); setSelection(null); }}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>
                </div>
                {error && (
                    <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>
                )}
            </AdminCard>

            <TrendCards trends={trends?.key === rangeQuery ? trends.data : null} />

            <AdminCard className="p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                    <h2 className="text-lg font-semibold text-foreground">
                        Activité des permanents
                    </h2>
                    <div className="flex flex-wrap gap-1">
                        {STAFF_METRIC_ORDER.map((m) => (
                            <Button
                                key={m}
                                size="sm"
                                variant={m === metric ? 'default' : 'outline'}
                                onClick={() => { setMetric(m); setSelection(null); }}
                            >
                                {METRIC_LABELS[m]}
                            </Button>
                        ))}
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                    {metricHint ?? 'Cliquez une case pour voir les enregistrements correspondants.'}
                </p>
                <StaffHeatmap
                    start={range.start}
                    end={range.end}
                    granularity={range.granularity}
                    data={staff?.data ?? null}
                    loading={staffLoading}
                    selection={selection}
                    onCellClick={(actorId, actorName, bucket) =>
                        setSelection({
                            metric,
                            granularity: range.granularity,
                            actorId,
                            actorName,
                            bucket,
                        })
                    }
                />
            </AdminCard>

            <MembersCard data={members?.key === rangeQuery ? members.data : null} />

            <AuditTimeline />

            {selection && (
                <DetailDrawer selection={selection} onClose={() => setSelection(null)} />
            )}
        </div>
    );
}
