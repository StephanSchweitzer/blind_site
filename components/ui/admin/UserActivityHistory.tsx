'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    getUserActivityStatusLabel,
    getUserActivityStatusColor,
    needsActivityStatusConfirmation,
} from '@/lib/user-activity-enums';
import {
    ActivityStatusConfirmDialog,
    ActivityStatusFields,
    useActivityStatusDraft,
} from '@/components/ui/admin/ActivityStatusFields';
import {
    describeUnavailability,
    formatDay,
    resolveEffectiveActivityStatus,
} from '@/lib/users/activityStatus';

interface ActivityEvent {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    comment: string | null;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
    changedAt: string;
    changedBy: { id: number; name: string | null; firstName: string | null; lastName: string | null } | null;
}

/** The person's stored status + window, as returned by the activity route. */
interface CurrentActivity {
    activityStatus: string;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
}

export function UserActivityHistory({ userId }: { userId: string | number }) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [current, setCurrent] = useState<CurrentActivity | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const draft = useActivityStatusDraft();
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Non-null while a status needing a confirmation waits for it.
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/user/${userId}/activity`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Erreur lors du chargement de l\'historique');
                return res.json();
            })
            .then((data) => {
                if (cancelled) return;
                setEvents(data.events ?? []);
                setCurrent(data.current ?? null);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    // The user row is authoritative: a member whose status predates the history
    // has no event to read it from. Events only fill in until the fetch lands.
    const latest = events[0] ?? null;
    const currentWindow = current ?? {
        activityStatus: latest?.toStatus ?? 'ACTIVE',
        unavailableFrom: latest?.unavailableFrom ?? null,
        unavailableUntil: latest?.unavailableUntil ?? null,
    };
    const currentStatus = currentWindow.activityStatus;
    // What the person reads as today — an unavailability that has elapsed (or
    // has not started) shows as Actif without anything having been rewritten.
    const effectiveStatus = resolveEffectiveActivityStatus(currentWindow);
    const effectiveDetail = describeUnavailability(currentWindow);

    const save = async () => {
        setPendingStatus(null);
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/user/${userId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No `reason`: the motif field is gone — the comment carries the
                // wording now. Motifs recorded before that stay in the history below.
                body: JSON.stringify({ ...draft.payload(), comment }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Erreur lors de l\'enregistrement');
            }
            const { event } = await res.json();
            setEvents((prev) => [event, ...prev]);
            setCurrent({
                activityStatus: event.toStatus,
                unavailableFrom: event.unavailableFrom ?? null,
                unavailableUntil: event.unavailableUntil ?? null,
            });
            draft.reset();
            setComment('');
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : 'Erreur');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => {
        if (!draft.isComplete || draft.status === currentStatus) return;
        // Décédé asks first. Confirming only gates the write — the status can
        // still be changed back afterwards like any other.
        if (needsActivityStatusConfirmation(draft.status)) {
            setPendingStatus(draft.status);
            return;
        }
        void save();
    };

    const fmtDate = (iso: string) =>
        new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

    const who = (e: ActivityEvent) => {
        if (!e.changedBy) return 'Syst\u00e8me';
        const full = [e.changedBy.firstName, e.changedBy.lastName].filter(Boolean).join(' ');
        return full || e.changedBy.name || `#${e.changedBy.id}`;
    };

    return (
        <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-foreground">Historique de statut</h3>
                <div className="flex items-center gap-2 min-w-0">
                    {effectiveDetail && (
                        <span className="text-xs text-muted-foreground truncate">{effectiveDetail}</span>
                    )}
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ${getUserActivityStatusColor(effectiveStatus)}`}>
                        {getUserActivityStatusLabel(effectiveStatus)}
                    </span>
                </div>
            </div>

            {/* Change status */}
            <div className="rounded-lg border border-border bg-card/60 p-3 mb-4 space-y-2">
                <div className="text-xs font-medium text-foreground">Changer le statut</div>
                <ActivityStatusFields
                    draft={draft}
                    currentStatus={currentStatus}
                    lockCurrent
                    triggerClassName="bg-card border-border text-foreground sm:w-56"
                />
                <Textarea
                    placeholder="Commentaire (optionnel)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="bg-card border-border text-foreground placeholder:text-muted-foreground"
                    rows={2}
                />
                {saveError && <p className="text-sm text-red-400">{saveError}</p>}
                <div className="flex justify-end">
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={!draft.isComplete || draft.status === currentStatus || saving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        size="sm"
                    >
                        {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
                    </Button>
                </div>
            </div>

            <ActivityStatusConfirmDialog
                status={pendingStatus}
                onConfirm={() => void save()}
                onCancel={() => setPendingStatus(null)}
            />

            {/* History */}
            {loading && <p className="text-sm text-muted-foreground">Chargement&#8230;</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!loading && !error && events.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun changement de statut enregistr&#233;.</p>
            )}

            {!loading && !error && events.length > 0 && (
                <ol className="space-y-3">
                    {events.map((e) => (
                        <li key={e.id} className="rounded border border-border bg-card p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">
                                    {e.fromStatus
                                        ? `${getUserActivityStatusLabel(e.fromStatus)} \u2192 ${getUserActivityStatusLabel(e.toStatus)}`
                                        : getUserActivityStatusLabel(e.toStatus)}
                                </span>
                                <span className="text-muted-foreground whitespace-nowrap">{fmtDate(e.changedAt)}</span>
                            </div>
                            {e.unavailableFrom && (
                                <p className="mt-1 text-foreground">
                                    Du {formatDay(e.unavailableFrom)}
                                    {e.unavailableUntil ? ` au ${formatDay(e.unavailableUntil)}` : ''}
                                </p>
                            )}
                            {e.reason && <p className="mt-1 text-foreground">Motif : {e.reason}</p>}
                            {e.comment && <p className="mt-1 text-muted-foreground">{e.comment}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">Par {who(e)}</p>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}