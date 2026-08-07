'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, ExternalLink, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { billEventLabel, billEventTint } from '@/components/ui/admin/BillHistory';
import type { StaffDetailItem, StaffDetailsResponse, StaffMetric, StatsGranularity } from '@/types';
import {
    AUDIO_ACTION_LABEL,
    AUDIO_ACTION_TINT,
    LIFECYCLE_EVENT_LABEL,
    LIFECYCLE_EVENT_TINT,
    METRIC_LABELS,
    formatBucketLabel,
    formatDateTime,
} from './stats-utils';
import { type DetailGroup, groupDetailItems, headOf } from './detail-grouping';

// AudioTrackAction and OrderEventType/AssignmentEventType share the `type`
// field on a detail item, but their values are NOT disjoint (both have a
// CREATED and a REOPENED) — so the lookup is scoped per metric rather than
// merged into one flat dict, which would let one clobber the other's
// label/tint. billEvents is handled separately via billEventLabel/billEventTint,
// which also need the event's payload (ORDER_ATTACHED reads differently
// depending on whether it was a manual attach or an auto-accrual on closing).
const BADGE_MAPS: Partial<Record<StaffMetric, [Record<string, string>, Record<string, string>]>> = {
    audioEvents: [AUDIO_ACTION_LABEL, AUDIO_ACTION_TINT],
    orders: [LIFECYCLE_EVENT_LABEL, LIFECYCLE_EVENT_TINT],
    assignments: [LIFECYCLE_EVENT_LABEL, LIFECYCLE_EVENT_TINT],
};

/** What a folded burst counts, in words — "12 pistes" reads better than "12 éléments". */
const GROUP_NOUN: Partial<Record<StaffMetric, string>> = {
    audioEvents: 'pistes',
};

const summarizeGroup = (group: DetailGroup, metric: StaffMetric): string =>
    `${group.items.length} ${GROUP_NOUN[metric] ?? 'éléments'}`;

// Side drawer behind a heatmap cell: the person's records for that bucket,
// fetched lazily on open, each deep-linking to its admin edit screen.

export interface DrawerSelection {
    metric: StaffMetric;
    granularity: StatsGranularity;
    actorId: number;
    actorName: string;
    bucket: string;
}

interface DrawerResult {
    key: string;
    items: StaffDetailItem[] | null; // null = fetch failed
}

export default function DetailDrawer({
    selection,
    onClose,
}: {
    selection: DrawerSelection;
    onClose: () => void;
}) {
    const { metric, granularity, actorId, actorName, bucket } = selection;
    const key = `${metric}|${actorId}|${bucket}|${granularity}`;

    // Result is tagged with the cell it answers; "loading" is derived from a
    // key mismatch rather than reset synchronously in the effect.
    const [result, setResult] = useState<DrawerResult | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(
            `/api/stats/staff/details?metric=${metric}&actorId=${actorId}&bucket=${bucket}&granularity=${granularity}`
        )
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then((data: StaffDetailsResponse) => {
                if (!cancelled) setResult({ key, items: data.items });
            })
            .catch(() => { if (!cancelled) setResult({ key, items: null }); });
        return () => { cancelled = true; };
    }, [key, metric, granularity, actorId, bucket]);

    const current = result?.key === key ? result : null;
    const items = current ? current.items : undefined; // undefined = loading
    const error = current !== null && current.items === null;
    const [badgeLabel, badgeTint] = BADGE_MAPS[metric] ?? [{}, {}];

    // Bulk actions (a folder of tracks uploaded at once, a batch job walking
    // several records) fold into one row with a count, the same way the
    // journal at the bottom of the page does — see detail-grouping.ts.
    const groups = React.useMemo(() => groupDetailItems(items ?? []), [items]);

    // Collapse open bursts when the drawer switches to a different cell.
    const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<number>>(new Set());
    const [syncedKey, setSyncedKey] = useState(key);
    if (key !== syncedKey) {
        setSyncedKey(key);
        setExpandedKeys(new Set());
    }
    const toggleExpanded = (groupKey: number) =>
        setExpandedKeys((previous) => {
            const next = new Set(previous);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });

    return (
        <>
            <div
                className="fixed inset-0 z-[60] bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside
                role="dialog"
                aria-label={`Détail — ${actorName}`}
                className="fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-card border-l border-border shadow-xl flex flex-col"
            >
                <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
                    <div>
                        <h3 className="font-semibold text-foreground">{actorName}</h3>
                        <p className="text-sm text-muted-foreground">
                            {METRIC_LABELS[metric]} — {formatBucketLabel(bucket, granularity)}
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {error && (
                        <p className="text-sm text-destructive">Impossible de charger le détail.</p>
                    )}
                    {!error && items === undefined && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 size={16} className="animate-spin" />
                            Chargement…
                        </p>
                    )}
                    {items?.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aucun enregistrement.</p>
                    )}
                    {groups.map((group) => {
                        const item = headOf(group);
                        const merged = group.items.length;
                        const expanded = expandedKeys.has(group.key);
                        const typeBadge = item.type && (
                            metric === 'billEvents' ? (
                                <Badge className={billEventTint(item.type, item.payload ?? null)}>
                                    {billEventLabel(item.type, item.payload ?? null)}
                                </Badge>
                            ) : (
                                <Badge className={badgeTint[item.type] ?? 'bg-muted text-foreground'}>
                                    {badgeLabel[item.type] ?? item.type}
                                </Badge>
                            )
                        );

                        // Some traced records have no edit screen to open (a
                        // Genre, a CMS block): those rows render flat, not as a
                        // link that goes nowhere. A merged burst's link (if any)
                        // opens via the icon itself, since the card's own click
                        // toggles the sub-item list instead of navigating.
                        const body = (
                            <>
                                <div className="flex items-start justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                        {merged > 1 && (expanded
                                            ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                                            : <ChevronRight size={14} className="text-muted-foreground shrink-0" />)}
                                        {item.title}
                                    </span>
                                    {item.href && (
                                        merged > 1 ? (
                                            <Link
                                                href={item.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                aria-label={`Ouvrir ${item.title}`}
                                                className="text-muted-foreground hover:text-foreground shrink-0"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mt-0.5" />
                                            </Link>
                                        ) : (
                                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                                        )
                                    )}
                                </div>
                                {merged === 1 && item.subtitle && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    <span className="text-xs text-muted-foreground">
                                        {formatDateTime(item.at)}
                                    </span>
                                    {typeBadge}
                                    {merged > 1 && (
                                        <Badge
                                            variant="outline"
                                            className="font-normal text-muted-foreground"
                                            title={`${merged} écritures entre ${formatDateTime(group.items[0].at)} et ${formatDateTime(item.at)}, regroupées`}
                                        >
                                            {summarizeGroup(group, metric)}
                                        </Badge>
                                    )}
                                    {item.needsReview && (
                                        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                                            à vérifier
                                        </Badge>
                                    )}
                                </div>
                                {merged > 1 && expanded && (
                                    <ul className="text-sm space-y-0.5 mt-2 pt-2 border-t border-border/60 max-h-64 overflow-y-auto">
                                        {[...group.items].reverse().map((sub) => (
                                            <li
                                                key={sub.id}
                                                className="flex items-center justify-between gap-2 text-foreground/80"
                                            >
                                                <span className="truncate">{sub.subtitle ?? '—'}</span>
                                                <span className="text-xs text-muted-foreground shrink-0">
                                                    {formatDateTime(sub.at)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        );

                        if (merged > 1) {
                            // A <div role="button"> rather than a real <button>:
                            // the row can contain the external-link <a> above,
                            // which a <button> may not (interactive-in-interactive).
                            return (
                                <div
                                    key={group.key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleExpanded(group.key)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleExpanded(group.key);
                                        }
                                    }}
                                    aria-expanded={expanded}
                                    className="rounded-lg border border-border p-3 cursor-pointer hover:bg-accent transition-colors"
                                >
                                    {body}
                                </div>
                            );
                        }

                        return item.href ? (
                            <Link
                                key={item.id}
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                            >
                                {body}
                            </Link>
                        ) : (
                            <div key={item.id} className="rounded-lg border border-border p-3">
                                {body}
                            </div>
                        );
                    })}
                </div>
            </aside>
        </>
    );
}
