'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Loader2 } from 'lucide-react';
import { AdminCard } from '@/components/ui/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { getUserActivityStatusLabel } from '@/lib/user-activity-enums';
import { formatDay, isWindowInForce } from '@/lib/users/activityStatus';

interface MyUnavailabilityProps {
    /** The STORED status — what may be changed, not how it currently reads. */
    activityStatus: string;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
}

/**
 * « Mes indisponibilités » — declaring one's own absence.
 *
 * Until now this window could only be set by a permanent, on someone else's
 * fiche, which meant a lecteur leaving for three weeks had to ask for it and the
 * planning only learned about it once someone got round to typing it. The person
 * who knows the dates is the person themselves.
 *
 * Only Actif <-> Indisponible is offered here; the graver statuses are the
 * association's to set, and the server refuses them from this path whatever the
 * form sends. Anyone already carrying one sees a read-only note instead.
 */
export default function MyUnavailability({
    activityStatus,
    unavailableFrom,
    unavailableUntil,
}: MyUnavailabilityProps) {
    const router = useRouter();
    const [from, setFrom] = useState(unavailableFrom ?? '');
    const [until, setUntil] = useState(unavailableUntil ?? '');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);

    const isDeclared = activityStatus === 'UNAVAILABLE';
    const selfService = activityStatus === 'ACTIVE' || isDeclared;

    if (!selfService) {
        return (
            <AdminCard className="p-6">
                <h2 className="text-lg font-semibold text-foreground">Mes indisponibilités</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                    Votre statut est{' '}
                    <span className="font-medium text-foreground">
                        {getUserActivityStatusLabel(activityStatus)}
                    </span>
                    . Seul un permanent peut le modifier : contactez le secrétariat aux ECA.
                </p>
            </AdminCard>
        );
    }

    const inForce =
        isDeclared && isWindowInForce({ activityStatus, unavailableFrom, unavailableUntil });

    const send = async (method: 'POST' | 'DELETE') => {
        setBusy(true);
        try {
            const response = await fetch('/api/user/me/unavailability', {
                method,
                ...(method === 'POST' && {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        unavailableFrom: from,
                        unavailableUntil: until,
                        comment,
                    }),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || 'Échec de l’enregistrement');
            }

            if (method === 'DELETE') {
                setFrom('');
                setUntil('');
            }
            setComment('');
            toast({
                title: method === 'POST' ? 'Indisponibilité enregistrée' : 'Indisponibilité annulée',
                description:
                    method === 'POST'
                        ? 'Le secrétariat la voit dans le calendrier des disponibilités.'
                        : 'Vous êtes de nouveau noté comme actif.',
            });
            router.refresh();
        } catch (error) {
            toast({
                title: 'Erreur',
                description: error instanceof Error ? error.message : 'Échec de l’enregistrement',
                variant: 'destructive',
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminCard className="p-6">
            <h2 className="text-lg font-semibold text-foreground">Mes indisponibilités</h2>
            <p className="mt-1 text-sm text-muted-foreground">
                Prévenez le secrétariat des dates où vous ne pouvez pas recevoir de nouvelle
                attribution. Vous apparaîtrez comme indisponible pendant cette période, puis de
                nouveau actif automatiquement.
            </p>

            {isDeclared && (
                <div className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
                    <CalendarOff className="mr-2 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
                    {inForce ? 'Vous êtes indisponible' : 'Indisponibilité prévue'} du{' '}
                    {formatDay(unavailableFrom) ?? '—'} au {formatDay(unavailableUntil) ?? '—'}.
                </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="unavailable-from">Du</Label>
                    <Input
                        id="unavailable-from"
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unavailable-until">Au (inclus)</Label>
                    <Input
                        id="unavailable-until"
                        type="date"
                        value={until}
                        onChange={(e) => setUntil(e.target.value)}
                    />
                </div>
            </div>
            <div className="mt-4 space-y-2">
                <Label htmlFor="unavailable-comment">Précision (facultatif)</Label>
                <Input
                    id="unavailable-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Congés, déplacement…"
                />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void send('POST')} disabled={busy || !from || !until}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {isDeclared ? 'Modifier les dates' : 'Déclarer mon indisponibilité'}
                </Button>
                {isDeclared && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void send('DELETE')}
                        disabled={busy}
                    >
                        Annuler mon indisponibilité
                    </Button>
                )}
            </div>
        </AdminCard>
    );
}
