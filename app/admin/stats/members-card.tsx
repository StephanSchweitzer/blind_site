'use client';

import React, { useMemo, useState } from 'react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import type { MemberGroup, MemberStatsResponse } from '@/types';
import {
    MEMBER_GROUP_FILTERS,
    MEMBER_GROUP_LABELS,
    formatDayShort,
    formatEuros,
} from './stats-utils';

/**
 * « Membres » — the one card on this page that is about the people rather than
 * about the permanents' work.
 *
 * Its Tous / Lecteurs / Auditeurs / Autres filter is local to the card and sits
 * on its own row: it changes nothing else on the page, and the period presets in
 * the header keep their own row above.
 */

type GroupFilter = MemberGroup | 'all';

const SERIES = [
    { key: 'newMembers', label: 'Inscriptions', className: 'bg-primary' },
    { key: 'statusChanges', label: 'Changements de statut', className: 'bg-amber-400 dark:bg-amber-500' },
] as const;

function StatTile({ value, label, hint }: { value: string; label: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-2xl font-semibold leading-none text-foreground tabular-nums">
                {value}
            </div>
            <div className="text-sm text-foreground mt-1">{label}</div>
            {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
        </div>
    );
}

export default function MembersCard({ data }: { data: MemberStatsResponse | null }) {
    const [group, setGroup] = useState<GroupFilter>('all');

    const totals = useMemo(() => {
        const rows = (data?.series ?? []).filter((r) => group === 'all' || r.group === group);
        const roster = (data?.roster ?? []).filter((r) => group === 'all' || r.group === group);

        // One entry per bucket, groups folded together when the filter is "Tous".
        const byBucket = new Map<string, { newMembers: number; statusChanges: number }>();
        for (const row of rows) {
            const entry = byBucket.get(row.bucket) ?? { newMembers: 0, statusChanges: 0 };
            entry.newMembers += row.newMembers;
            entry.statusChanges += row.statusChanges;
            byBucket.set(row.bucket, entry);
        }
        const buckets = [...byBucket.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([bucket, entry]) => ({ bucket, ...entry }));

        const sum = <K extends keyof (typeof rows)[number]>(key: K) =>
            rows.reduce((acc, row) => acc + (row[key] as number), 0);

        return {
            buckets,
            headcount: roster.reduce((acc, r) => acc + r.total, 0),
            active: roster.reduce((acc, r) => acc + r.active, 0),
            unavailable: roster.reduce((acc, r) => acc + r.unavailable, 0),
            newMembers: sum('newMembers'),
            statusChanges: sum('statusChanges'),
            payments: sum('payments'),
            paymentAmount: sum('paymentAmount'),
            roster,
        };
    }, [data, group]);

    const max = Math.max(
        1,
        ...totals.buckets.map((b) => b.newMembers + b.statusChanges)
    );

    return (
        <AdminCard className="p-4 md:p-6">
            <h2 className="text-lg font-semibold text-foreground">Membres</h2>

            {/* Own row, on purpose — the period presets live in the page header. */}
            <div className="flex flex-wrap gap-1 mt-3 mb-4">
                {MEMBER_GROUP_FILTERS.map((filter) => (
                    <Button
                        key={filter.value}
                        size="sm"
                        variant={filter.value === group ? 'default' : 'outline'}
                        onClick={() => setGroup(filter.value)}
                    >
                        {filter.label}
                    </Button>
                ))}
            </div>

            {!data ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatTile
                            value={String(totals.headcount)}
                            label="Effectif"
                            hint={`${totals.active} actifs · ${totals.unavailable} indisponibles`}
                        />
                        <StatTile
                            value={String(totals.newMembers)}
                            label="Inscriptions"
                            hint="sur la période"
                        />
                        <StatTile
                            value={String(totals.statusChanges)}
                            label="Changements de statut"
                            hint="sur la période"
                        />
                        <StatTile
                            value={formatEuros(totals.paymentAmount)}
                            label="Paiements encaissés"
                            hint={`${totals.payments} paiement(s)`}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-5 mb-2">
                        {SERIES.map((series) => (
                            <span key={series.key} className="flex items-center gap-1.5">
                                <span className={`w-3 h-3 rounded-sm ${series.className}`} />
                                {series.label}
                            </span>
                        ))}
                    </div>

                    {totals.buckets.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucun mouvement sur la période pour ce type de membre.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="flex items-end gap-1 h-32 min-w-[320px]">
                                {totals.buckets.map((bucket) => {
                                    const total = bucket.newMembers + bucket.statusChanges;
                                    const label = `Semaine du ${formatDayShort(bucket.bucket)} : ` +
                                        `${bucket.newMembers} inscription(s), ${bucket.statusChanges} changement(s) de statut`;
                                    return (
                                        <div
                                            key={bucket.bucket}
                                            className="flex-1 min-w-3 flex flex-col justify-end h-full"
                                            title={label}
                                            aria-label={label}
                                        >
                                            <div
                                                className="bg-amber-400 dark:bg-amber-500 rounded-t-sm"
                                                style={{ height: `${(bucket.statusChanges / max) * 100}%` }}
                                            />
                                            <div
                                                className="bg-primary"
                                                style={{ height: `${(bucket.newMembers / max) * 100}%` }}
                                            />
                                            {total === 0 && <div className="h-px bg-border" />}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-1 min-w-[320px] mt-1">
                                {totals.buckets.map((bucket, index) => (
                                    <div
                                        key={bucket.bucket}
                                        className="flex-1 min-w-3 text-[10px] text-muted-foreground text-center truncate"
                                    >
                                        {/* Every other label, so they never collide. */}
                                        {index % 2 === 0 ? formatDayShort(bucket.bucket) : ''}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {group === 'all' && totals.roster.length > 0 && (
                        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-muted-foreground">
                            {totals.roster.map((row) => (
                                <span key={row.group}>
                                    <span className="text-foreground font-medium">
                                        {MEMBER_GROUP_LABELS[row.group]}
                                    </span>{' '}
                                    : {row.total} ({row.active} actifs)
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
        </AdminCard>
    );
}
