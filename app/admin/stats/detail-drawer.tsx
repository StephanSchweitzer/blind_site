'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TYPE_LABEL, TYPE_TINT } from '@/components/ui/admin/BillHistory';
import type { StaffDetailItem, StaffDetailsResponse, StaffMetric, StatsGranularity } from '@/types';
import { METRIC_LABELS, formatBucketLabel, formatDateTime } from './stats-utils';

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
                        <p className="text-sm text-muted-foreground">Chargement…</p>
                    )}
                    {items?.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aucun enregistrement.</p>
                    )}
                    {items?.map((item) => (
                        <Link
                            key={item.id}
                            href={item.href}
                            className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium text-foreground">
                                    {item.title}
                                </span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                            </div>
                            {item.subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="text-xs text-muted-foreground">
                                    {formatDateTime(item.at)}
                                </span>
                                {item.type && (
                                    <Badge className={TYPE_TINT[item.type] ?? 'bg-muted text-foreground'}>
                                        {TYPE_LABEL[item.type] ?? item.type}
                                    </Badge>
                                )}
                                {item.needsReview && (
                                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                                        à vérifier
                                    </Badge>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </aside>
        </>
    );
}
