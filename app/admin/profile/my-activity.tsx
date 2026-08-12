'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, History, Loader2 } from 'lucide-react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import {
    OPERATION_LABELS,
    fieldLabel,
    formatAuditValue,
    isReservedField,
    modelLabel,
    recordHref,
} from '@/lib/audit/labels';
import type { AuditOperation, MyActivityItem, MyActivityResponse } from '@/types';
// Pure formatting, no data: importing them keeps one definition of what an
// upload/rename/delete is called rather than a second copy that drifts.
import { AUDIO_ACTION_LABEL, AUDIO_ACTION_TINT, formatDateTime } from '../stats/stats-utils';

/**
 * « Mon activité récente » — the audit trail, read by its own author.
 *
 * The trail has always recorded who changed what; until now only a super admin
 * could read it, on /admin/stats. Seeing your own last actions answers the
 * question people actually ask themselves — "did I save that fiche, and what
 * did I put in it?" — without granting any view onto anyone else's rows: the
 * route is pinned to the session's own id and takes no author parameter.
 *
 * Read-only. Replaying a deletion stays on /admin/stats, where a super admin
 * sees the whole picture before restoring anything.
 */

const OPERATION_TINT: Record<AuditOperation, string> = {
    CREATE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    RESTORE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

/**
 * An AudioTrackEvent row is stored as a CREATE whatever it describes — it is a
 * log line being inserted, never the track touched in place — so the action it
 * actually represents lives in `changes.action`. Badging on `operation` alone
 * would label a deletion burst « Création ».
 */
function operationBadge(event: MyActivityItem): { label: string; tint: string } {
    const action = event.model === 'AudioTrackEvent' ? event.changes.action?.[1] : null;
    if (typeof action === 'string' && action in AUDIO_ACTION_LABEL) {
        return { label: AUDIO_ACTION_LABEL[action], tint: AUDIO_ACTION_TINT[action] };
    }
    return { label: OPERATION_LABELS[event.operation], tint: OPERATION_TINT[event.operation] };
}

function ActivityRow({ event }: { event: MyActivityItem }) {
    const [open, setOpen] = useState(false);
    const badge = operationBadge(event);
    const label = event.recordLabel;

    // A piste audio names — and opens onto — the book it belongs to; every other
    // model points at itself.
    const target = label?.linked ?? { model: event.model, recordId: event.recordId };
    const href = recordHref(target.model, target.recordId);

    const fields = Object.entries(event.changes).filter(([field]) => !isReservedField(field));

    return (
        <li className="border-b border-border last:border-0">
            <div className="flex items-start gap-3 py-3">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={open ? 'Masquer le détail' : 'Afficher le détail'}
                >
                    {open ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.tint}`}>
                            {badge.label}
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {modelLabel(event.model)}
                        </span>
                        {label && (
                            <span className="text-sm font-medium text-foreground truncate">
                                {label.title}
                                {label.subtitle && (
                                    <span className="font-normal text-muted-foreground">
                                        {' · '}
                                        {label.subtitle}
                                    </span>
                                )}
                            </span>
                        )}
                        {href && (
                            <Link
                                href={href}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Ouvrir
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(event.at)}
                    </div>

                    {open && (
                        <div className="mt-3 rounded-md border border-border bg-muted/50 p-3">
                            {fields.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Aucun détail conservé pour cette action.
                                </p>
                            ) : (
                                <dl className="space-y-1.5 text-sm">
                                    {fields.map(([field, [before, after]]) => (
                                        <div key={field} className="flex flex-wrap gap-x-2">
                                            <dt className="text-muted-foreground">
                                                {fieldLabel(field)} :
                                            </dt>
                                            <dd className="text-foreground">
                                                <span className="line-through opacity-60">
                                                    {formatAuditValue(before, event.model, field)}
                                                </span>
                                                {' → '}
                                                <span className="font-medium">
                                                    {formatAuditValue(after, event.model, field)}
                                                </span>
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

export default function MyActivity() {
    const [events, setEvents] = useState<MyActivityItem[]>([]);
    const [retentionDays, setRetentionDays] = useState<number | null>(null);
    const [cursor, setCursor] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // setState lives in the promise callbacks, never in the effect body
    // (react-hooks/set-state-in-effect).
    useEffect(() => {
        let active = true;
        fetch('/api/user/me/activity')
            .then(async (response) => {
                if (!response.ok) throw new Error('Chargement impossible');
                return (await response.json()) as MyActivityResponse;
            })
            .then((data) => {
                if (!active) return;
                setEvents(data.events);
                setRetentionDays(data.retentionDays);
                setCursor(data.nextCursor);
            })
            .catch(() => {
                if (active) setError('Impossible de charger votre activité.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const loadMore = async () => {
        if (cursor === null) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/user/me/activity?before=${cursor}`);
            if (!response.ok) throw new Error('Chargement impossible');
            const data = (await response.json()) as MyActivityResponse;
            setEvents((previous) => [...previous, ...data.events]);
            setCursor(data.nextCursor);
        } catch {
            setError('Impossible de charger la suite.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminCard className="p-6">
            <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-foreground">Mon activité récente</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
                Ce que vous avez créé, modifié ou supprimé dans le back-office
                {retentionDays !== null && ` — le journal remonte à ${retentionDays} jours`}.
            </p>

            {error && (
                <p className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>
            )}

            {loading && events.length === 0 ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Chargement…
                </div>
            ) : events.length === 0 && !error ? (
                <p className="mt-6 text-sm text-muted-foreground">
                    Vous n’avez rien modifié
                    {retentionDays !== null ? ` ces ${retentionDays} derniers jours` : ' récemment'}.
                </p>
            ) : (
                <ul className="mt-4">
                    {events.map((event) => (
                        <ActivityRow key={event.id} event={event} />
                    ))}
                </ul>
            )}

            {cursor !== null && (
                <div className="mt-4">
                    <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                        Voir plus
                    </Button>
                </div>
            )}
        </AdminCard>
    );
}
