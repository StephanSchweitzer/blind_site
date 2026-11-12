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
import { parisDate } from '@/lib/paris-day';
import { useDelayedFlag } from '@/components/ui/inline-loading';
import { CotisationStatusPill } from '@/components/ui/admin/CotisationStatusPill';
import { ChevronRight } from 'lucide-react';

interface ActivityEvent {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    comment: string | null;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
    changedAt: string;
    changedBy: { id: number; firstName: string | null; lastName: string | null } | null;
}

/** The person's stored status + window, as returned by the activity route. */
interface CurrentActivity {
    activityStatus: string;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
}

export function UserActivityHistory({
    userId,
    memberType,
    showCotisation = false,
    framed = true,
    defaultHistoryOpen = false,
    onChanged,
}: {
    userId: string | number;
    /** Only for the cotisation pill: a Donateur owes none. */
    memberType?: string | null;
    /** Put the cotisation pill on the status line (the edit window, outside the dossier). */
    showCotisation?: boolean;
    /** The section's own rule and spacing; off inside the dossier header's popover. */
    framed?: boolean;
    defaultHistoryOpen?: boolean;
    /** After a status change is saved, e.g. to refresh the dossier header. */
    onChanged?: () => void;
}) {
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
    // The change form stays folded behind « Changer le statut »: always open at
    // the top of the fiche, its select, comment box and second « Enregistrer »
    // were the first thing anyone read about the person.
    const [changing, setChanging] = useState(false);
    // The history is reference, not the fiche: folded behind its count, with
    // the last change summed up on one line. Opened, every change was a card
    // of its own, and a member whose status had moved a few times pushed
    // « Informations de base » below the fold.
    const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);
    const showBadgePlaceholder = useDelayedFlag(loading);

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
            setChanging(false);
            onChanged?.();
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
        parisDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });

    const who = (e: ActivityEvent) => {
        if (!e.changedBy) return 'Syst\u00e8me';
        const full = [e.changedBy.firstName, e.changedBy.lastName].filter(Boolean).join(' ');
        return full || `#${e.changedBy.id}`;
    };

    return (
        <div className={framed ? 'mb-6 border-b border-border pb-3' : ''}>
            {/* One line: what the person is today, and the cotisation beside it.
                It used to be a section with its own heading row, a banner above
                it and the whole history under it — half a screen before the
                first field of the fiche. */}
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Statut</h3>
                {/* Until the route answers there is no status to show: the
                    fallback would read « Actif » for everyone. A pill-sized
                    placeholder keeps the line from shifting. */}
                {loading ? (
                    <span
                        aria-hidden
                        className={`inline-block h-6 w-16 shrink-0 rounded-full ${showBadgePlaceholder ? 'bg-muted animate-pulse' : ''}`}
                    />
                ) : (
                    <>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${getUserActivityStatusColor(effectiveStatus)}`}>
                            {getUserActivityStatusLabel(effectiveStatus)}
                        </span>
                        {effectiveDetail && (
                            <span className="text-xs text-muted-foreground">{effectiveDetail}</span>
                        )}
                    </>
                )}
                {showCotisation && <CotisationStatusPill userId={userId} memberType={memberType} />}
                {!loading && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 px-2.5 text-xs"
                        aria-expanded={changing}
                        onClick={() => {
                            if (changing) {
                                draft.reset();
                                setComment('');
                                setSaveError(null);
                            }
                            setChanging(!changing);
                        }}
                    >
                        {changing ? 'Annuler' : 'Changer le statut'}
                    </Button>
                )}
            </div>

            {/* Change status */}
            {changing && (
            <div className="rounded-lg border border-border bg-card/60 p-3 mt-3 space-y-2">
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
                        disabled={loading || !draft.isComplete || draft.status === currentStatus || saving}
                        variant="save"
                        size="sm"
                    >
                        {saving ? 'Enregistrement…' : 'Enregistrer le statut'}
                    </Button>
                </div>
            </div>
            )}

            <ActivityStatusConfirmDialog
                status={pendingStatus}
                onConfirm={() => void save()}
                onCancel={() => setPendingStatus(null)}
            />

            {/* History */}
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

            {!loading && !error && latest && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => setHistoryOpen(!historyOpen)}
                        aria-expanded={historyOpen}
                        className="inline-flex items-center gap-1 rounded hover:text-foreground hover:underline underline-offset-4"
                    >
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${historyOpen ? 'rotate-90' : ''}`} aria-hidden />
                        Historique du statut ({events.length})
                    </button>
                    {!historyOpen && (
                        <span>
                            · dernier changement le {fmtDate(latest.changedAt)}, par {who(latest)}
                        </span>
                    )}
                </div>
            )}

            {historyOpen && !loading && !error && events.length > 0 && (
                <ol className="mt-2 space-y-2">
                    {events.map((e) => (
                        <li key={e.id} className="rounded border border-border bg-card p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">
                                    {e.fromStatus
                                        ? `${getUserActivityStatusLabel(e.fromStatus)} → ${getUserActivityStatusLabel(e.toStatus)}`
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
