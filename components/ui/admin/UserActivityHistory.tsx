'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    USER_ACTIVITY_STATUS_VALUES,
    getUserActivityStatusLabel,
    getUserActivityStatusColor,
} from '@/lib/user-activity-enums';

interface ActivityEvent {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    comment: string | null;
    changedAt: string;
    changedBy: { id: number; name: string | null; firstName: string | null; lastName: string | null } | null;
}

export function UserActivityHistory({ userId }: { userId: string | number }) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newStatus, setNewStatus] = useState<string>('');
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/user/${userId}/activity`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Erreur lors du chargement de l\'historique');
                return res.json();
            })
            .then((data) => {
                if (!cancelled) setEvents(data.events ?? []);
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

    const currentStatus = events[0]?.toStatus ?? 'ACTIVE';

    const handleSave = async () => {
        if (!newStatus || newStatus === currentStatus) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/user/${userId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toStatus: newStatus, reason, comment }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Erreur lors de l\'enregistrement');
            }
            const { event } = await res.json();
            setEvents((prev) => [event, ...prev]);
            setNewStatus('');
            setReason('');
            setComment('');
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : 'Erreur');
        } finally {
            setSaving(false);
        }
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
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Historique de statut</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getUserActivityStatusColor(currentStatus)}`}>
                    {getUserActivityStatusLabel(currentStatus)}
                </span>
            </div>

            {/* Change status */}
            <div className="rounded-lg border border-border bg-card/60 p-3 mb-4 space-y-2">
                <div className="text-xs font-medium text-foreground">Changer le statut</div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger className="bg-card border-border text-foreground sm:w-56">
                            <SelectValue placeholder="Nouveau statut" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            {USER_ACTIVITY_STATUS_VALUES.map((s) => (
                                <SelectItem key={s} value={s} className="text-foreground" disabled={s === currentStatus}>
                                    {getUserActivityStatusLabel(s)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Motif (optionnel)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="bg-card border-border text-foreground placeholder:text-muted-foreground flex-1"
                    />
                </div>
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
                        disabled={!newStatus || newStatus === currentStatus || saving}
                        className="bg-blue-600 hover:bg-blue-500 text-white"
                        size="sm"
                    >
                        {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
                    </Button>
                </div>
            </div>

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