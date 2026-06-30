import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    USER_ACTIVITY_STATUS_VALUES,
    getUserActivityStatusLabel,
} from '@/lib/user-activity-enums';
import type { ActivityBlockInfo, ActivityGuardRole } from '@/hooks/useUserActivityGuard';

const ROLE_ACTION: Record<ActivityGuardRole, string> = {
    aveugle: 'lui attribuer une demande',
    lecteur: 'lui assigner une attribution',
};

/**
 * Shared by OrderFormBackendBase and AssignmentFormBackendBase via
 * useUserActivityGuard(). Pair the `blocked`/`role` values from the hook
 * with `onClose` (= resolveAndClose): `onClose(true)` lets the caller
 * proceed (the person is now ACTIVE), `onClose(false)` means cancelled.
 */
export function UserActivityGuardDialog({
                                             blocked,
                                             role,
                                             onClose,
                                         }: {
    blocked: ActivityBlockInfo | null;
    role: ActivityGuardRole;
    onClose: (proceed: boolean) => void;
}) {
    const { toast } = useToast();
    const [toStatus, setToStatus] = useState<string>('ACTIVE');
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset the small form every time a new person is presented. Done during
    // render instead of in an effect to avoid the cascading re-render the
    // effect version triggered.
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const currentId = blocked?.userId ?? null;
    const [prevBlockedId, setPrevBlockedId] =
        useState<ActivityBlockInfo['userId'] | null>(null);
    if (currentId !== prevBlockedId) {
        setPrevBlockedId(currentId);
        if (blocked) {
            setToStatus('ACTIVE');
            setReason('');
            setComment('');
        }
    }

    if (!blocked) return null;

    const handleReactivate = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/user/${blocked.userId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toStatus,
                    reason: reason.trim() || undefined,
                    comment: comment.trim() || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                toast({
                    variant: 'destructive',
                    title: 'Erreur',
                    description: data?.message || 'Échec de la mise à jour du statut',
                });
                setIsSubmitting(false);
                return;
            }

            toast({
                title: 'Statut mis à jour',
                description: `${blocked.name} est maintenant ${getUserActivityStatusLabel(toStatus).toLowerCase()}.`,
            });

            setIsSubmitting(false);
            // Only ACTIVE actually unblocks the order/assignment action — any
            // other status leaves the person still ineligible.
            onClose(toStatus === 'ACTIVE');
        } catch (err) {
            console.error('Reactivation error:', err);
            toast({
                variant: 'destructive',
                title: 'Erreur',
                description: 'Échec de la mise à jour du statut',
            });
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog
            open={!!blocked}
            onOpenChange={(open) => {
                if (!open && !isSubmitting) onClose(false);
            }}
        >
            <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertCircle className="h-5 w-5" />
                        Personne inactive
                    </DialogTitle>
                </DialogHeader>

                <div className="text-foreground text-sm space-y-3">
                    <p>
                        <span className="font-semibold">{blocked.name}</span> est{' '}
                        <span className="font-semibold">{blocked.statusLabel.toLowerCase()}</span>
                        {blocked.reason ? <> pour le motif « {blocked.reason} »</> : null}.
                    </p>
                    {blocked.comment && (
                        <p className="text-muted-foreground italic">{blocked.comment}</p>
                    )}
                    <p>
                        Pour continuer et {ROLE_ACTION[role]}, vous devez réactiver cette personne.
                        Vous pouvez choisir un autre statut ci-dessous, ainsi qu&apos;un motif et un
                        commentaire si vous le souhaitez.
                    </p>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nouveau statut</label>
                        <Select value={toStatus} onValueChange={setToStatus}>
                            <SelectTrigger className="bg-field border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {USER_ACTIVITY_STATUS_VALUES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {getUserActivityStatusLabel(value)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Motif (optionnel)</label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ex : retour de vacances"
                            className="bg-field border-border text-foreground"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Commentaire (optionnel)</label>
                        <Textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="bg-field border-border text-foreground min-h-[80px]"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => onClose(false)} disabled={isSubmitting}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleReactivate}
                        disabled={isSubmitting}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isSubmitting ? 'Mise à jour...' : 'Réactiver et continuer'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
