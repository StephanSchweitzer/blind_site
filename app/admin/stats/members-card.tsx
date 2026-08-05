'use client';

import React, { useMemo, useState } from 'react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import type { MemberGroup, MemberSeriesRow, MemberStatsResponse } from '@/types';
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
 *
 * WHAT THIS CARD IS FOR, AFTER THE REMODEL
 *
 * The breakdown by group is the thing nothing else on the dashboard can show,
 * so it is the card's centrepiece — a table, where every number sits under a
 * heading that names it. The chart below it keeps the time dimension, which the
 * table cannot carry, and it now owns « Inscriptions » and « Changements de
 * statut » outright: both used to be sparklines in the trend strip as well,
 * saying strictly less than they say here next to a group filter.
 *
 * The chart it replaces stacked those two series on one bar and scaled the
 * whole thing on their SUM. Inscriptions are people arriving; changements de
 * statut are events on people already here. Adding them produces a number that
 * counts nothing, so the bars are side by side now, and the axis is drawn and
 * labelled rather than left to be guessed at.
 *
 * Buckets are always ISO weeks — /api/stats/members hardcodes date_trunc('week')
 * whatever preset is selected — which is why the labels say « semaine » outright.
 */

const SERIES = [
    {
        key: 'newMembers',
        label: 'Inscriptions',
        bar: 'bg-primary',
        swatch: 'bg-primary',
    },
    {
        key: 'statusChanges',
        label: 'Changements de statut',
        bar: 'bg-amber-400 dark:bg-amber-500',
        swatch: 'bg-amber-400 dark:bg-amber-500',
    },
] as const;

type GroupFilter = MemberGroup | 'all';

interface Bucket {
    bucket: string;
    newMembers: number;
    statusChanges: number;
}

/**
 * A readable top of scale: 7 becomes 10, 23 becomes 25. An axis whose top reads
 * « 23 » invites the eye to measure against it, which is not what it is for.
 */
function niceMax(value: number): number {
    if (value <= 5) return Math.max(value, 1);
    const magnitude = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 1.5, 2, 2.5, 5, 10]) {
        const candidate = step * magnitude;
        if (candidate >= value) return candidate;
    }
    return value;
}

/** Round numbers only — an axis labelled « 2,5 inscriptions » helps nobody. */
const axisTicks = (max: number): number[] =>
    Number.isInteger(max / 2) ? [max, max / 2, 0] : [max, 0];

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

/** Grouped bars, two series, one column per week. */
function MemberChart({ buckets }: { buckets: Bucket[] }) {
    const max = niceMax(
        Math.max(1, ...buckets.flatMap((b) => [b.newMembers, b.statusChanges]))
    );
    const ticks = axisTicks(max);

    const period = buckets.length
        ? `du ${formatDayShort(buckets[0].bucket)} au ${formatDayShort(buckets[buckets.length - 1].bucket)}`
        : '';

    // Enough room for a label every N columns without them colliding.
    const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

    return (
        <figure className="mt-1">
            <figcaption className="text-xs text-muted-foreground mb-2">
                Totaux par semaine {period}. Chaque colonne est une semaine ; les deux
                barres sont comptées séparément.
            </figcaption>

            <div className="overflow-x-auto">
                <div className="flex gap-2 min-w-[320px] pt-3">
                    {/* Y axis: the scale the bars are drawn against. */}
                    <div
                        className="relative h-32 w-7 shrink-0 text-[10px] text-muted-foreground tabular-nums"
                        aria-hidden="true"
                    >
                        {ticks.map((tick) => (
                            <span
                                key={tick}
                                className="absolute right-0 -translate-y-1/2 leading-none"
                                style={{ top: `${100 - (tick / max) * 100}%` }}
                            >
                                {tick}
                            </span>
                        ))}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="relative h-32 border-l border-b border-border">
                            {/* Gridlines, on the same values the axis is labelled with. */}
                            {ticks.filter((t) => t > 0).map((tick) => (
                                <div
                                    key={tick}
                                    aria-hidden="true"
                                    className="absolute inset-x-0 border-t border-border/50"
                                    style={{ top: `${100 - (tick / max) * 100}%` }}
                                />
                            ))}

                            <div className="absolute inset-0 flex items-end gap-1 px-0.5">
                                {buckets.map((bucket) => {
                                    const description =
                                        `Semaine du ${formatDayShort(bucket.bucket)} : ` +
                                        `${bucket.newMembers} inscription(s), ` +
                                        `${bucket.statusChanges} changement(s) de statut`;
                                    return (
                                        <div
                                            key={bucket.bucket}
                                            className="flex-1 min-w-2 h-full flex items-end justify-center gap-px"
                                            title={description}
                                            aria-label={description}
                                        >
                                            {SERIES.map((series) => {
                                                const count = bucket[series.key];
                                                return (
                                                    <div
                                                        key={series.key}
                                                        className={`w-1/2 max-w-3 rounded-t-sm ${
                                                            count > 0 ? series.bar : 'bg-border'
                                                        }`}
                                                        // A zero week keeps a hairline, so the
                                                        // column reads as "nothing happened"
                                                        // rather than as missing data.
                                                        style={{
                                                            height: count > 0
                                                                ? `${Math.max((count / max) * 100, 2)}%`
                                                                : '1px',
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* X axis: first and last always named, so the span is unambiguous. */}
                        <div className="flex gap-1 px-0.5 mt-1">
                            {buckets.map((bucket, index) => {
                                const show =
                                    index === 0 ||
                                    index === buckets.length - 1 ||
                                    index % labelEvery === 0;
                                return (
                                    <div
                                        key={bucket.bucket}
                                        className="flex-1 min-w-2 text-[10px] text-muted-foreground text-center truncate"
                                    >
                                        {show ? formatDayShort(bucket.bucket) : ''}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                            Semaine (début)
                        </p>
                    </div>
                </div>
            </div>
        </figure>
    );
}

export default function MembersCard({ data }: { data: MemberStatsResponse | null }) {
    const [group, setGroup] = useState<GroupFilter>('all');

    const totals = useMemo(() => {
        const inGroup = (row: { group: MemberGroup }) => group === 'all' || row.group === group;
        const rows = (data?.series ?? []).filter(inGroup);
        const roster = (data?.roster ?? []).filter(inGroup);

        // One entry per bucket, groups folded together when the filter is "Tous".
        const byBucket = new Map<string, Bucket>();
        for (const row of rows) {
            const entry = byBucket.get(row.bucket)
                ?? { bucket: row.bucket, newMembers: 0, statusChanges: 0 };
            entry.newMembers += row.newMembers;
            entry.statusChanges += row.statusChanges;
            byBucket.set(row.bucket, entry);
        }
        const buckets = [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));

        const sum = <K extends keyof MemberSeriesRow>(key: K) =>
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
        };
    }, [data, group]);

    /** Per-group rows for the table, plus the "Ensemble" line, in filter order. */
    const tableRows = useMemo(() => {
        const groups: MemberGroup[] = ['lecteur', 'auditeur', 'autre'];
        return groups.map((key) => {
            const roster = (data?.roster ?? []).find((r) => r.group === key);
            const series = (data?.series ?? []).filter((r) => r.group === key);
            const sum = <K extends keyof MemberSeriesRow>(field: K) =>
                series.reduce((acc, row) => acc + (row[field] as number), 0);
            return {
                group: key,
                total: roster?.total ?? 0,
                active: roster?.active ?? 0,
                unavailable: roster?.unavailable ?? 0,
                inactive: roster?.inactive ?? 0,
                newMembers: sum('newMembers'),
                statusChanges: sum('statusChanges'),
                paymentAmount: sum('paymentAmount'),
            };
        });
    }, [data]);

    const grandTotal = tableRows.reduce(
        (acc, row) => ({
            total: acc.total + row.total,
            active: acc.active + row.active,
            unavailable: acc.unavailable + row.unavailable,
            inactive: acc.inactive + row.inactive,
            newMembers: acc.newMembers + row.newMembers,
            statusChanges: acc.statusChanges + row.statusChanges,
            paymentAmount: acc.paymentAmount + row.paymentAmount,
        }),
        { total: 0, active: 0, unavailable: 0, inactive: 0, newMembers: 0, statusChanges: 0, paymentAmount: 0 }
    );

    const cell = 'py-1.5 px-2 text-right tabular-nums';

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

                    {/* The breakdown the rest of the dashboard cannot show. */}
                    <div className="overflow-x-auto mt-5">
                        <table className="w-full text-sm border-collapse">
                            <caption className="sr-only">
                                Effectif par type de membre et mouvements sur la période
                            </caption>
                            <thead>
                                <tr className="text-xs text-muted-foreground">
                                    <th scope="col" className="py-1 px-2 text-left font-normal" />
                                    <th scope="colgroup" colSpan={4} className="py-1 px-2 text-right font-normal border-b border-border">
                                        Effectif aujourd’hui
                                    </th>
                                    <th scope="colgroup" colSpan={3} className="py-1 px-2 text-right font-normal border-b border-border">
                                        Sur la période
                                    </th>
                                </tr>
                                <tr className="text-xs text-muted-foreground border-b border-border">
                                    <th scope="col" className="py-1 px-2 text-left font-normal">Type</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Total</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Actifs</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Indispo.</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Inactifs</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Inscript.</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Chgts statut</th>
                                    <th scope="col" className="py-1 px-2 text-right font-normal">Encaissé</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row) => (
                                    <tr
                                        key={row.group}
                                        className={`border-b border-border/60 ${
                                            group === row.group ? 'bg-muted/60' : ''
                                        }`}
                                    >
                                        <th scope="row" className="py-1.5 px-2 text-left font-medium text-foreground">
                                            {MEMBER_GROUP_LABELS[row.group]}
                                        </th>
                                        <td className={`${cell} text-foreground`}>{row.total}</td>
                                        <td className={`${cell} text-muted-foreground`}>{row.active}</td>
                                        <td className={`${cell} text-muted-foreground`}>{row.unavailable}</td>
                                        <td className={`${cell} text-muted-foreground`}>{row.inactive}</td>
                                        <td className={`${cell} text-foreground`}>{row.newMembers}</td>
                                        <td className={`${cell} text-foreground`}>{row.statusChanges}</td>
                                        <td className={`${cell} text-foreground`}>{formatEuros(row.paymentAmount)}</td>
                                    </tr>
                                ))}
                                <tr className="font-medium">
                                    <th scope="row" className="py-1.5 px-2 text-left text-foreground">Ensemble</th>
                                    <td className={`${cell} text-foreground`}>{grandTotal.total}</td>
                                    <td className={`${cell} text-muted-foreground`}>{grandTotal.active}</td>
                                    <td className={`${cell} text-muted-foreground`}>{grandTotal.unavailable}</td>
                                    <td className={`${cell} text-muted-foreground`}>{grandTotal.inactive}</td>
                                    <td className={`${cell} text-foreground`}>{grandTotal.newMembers}</td>
                                    <td className={`${cell} text-foreground`}>{grandTotal.statusChanges}</td>
                                    <td className={`${cell} text-foreground`}>{formatEuros(grandTotal.paymentAmount)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-6 mb-2">
                        {SERIES.map((series) => (
                            <span key={series.key} className="flex items-center gap-1.5">
                                <span className={`w-3 h-3 rounded-sm ${series.swatch}`} />
                                {series.label}
                            </span>
                        ))}
                    </div>

                    {totals.buckets.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucun mouvement sur la période pour ce type de membre.
                        </p>
                    ) : (
                        <MemberChart buckets={totals.buckets} />
                    )}
                </>
            )}
        </AdminCard>
    );
}
