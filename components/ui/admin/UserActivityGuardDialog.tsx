import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    getUserActivityStatusLabel,
    needsActivityStatusConfirmation,
} from '@/lib/user-activity-enums';
import {
    ActivityStatusConfirmDialog,
    ActivityStatusFields,
    useActivityStatusDraft,
} from '@/components/ui/admin/ActivityStatusFields';
import { isEffectivelyActive } from '@/lib/users/activityStatus';
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
    const draft = useActivityStatusDraft({ status: 'ACTIVE' });
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);

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
            draft.reset('ACTIVE');
            setComment('');
            setPendingStatus(null);
        }
    }

    if (!blocked) return null;

    const toStatus = draft.status;

    const handleReactivate = async () => {
        setPendingStatus(null);
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/user/${blocked.userId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No `reason`: the motif field is gone — the comment carries the wording now.
                body: JSON.stringify({
                    ...draft.payload(),
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
            // Only an EFFECTIVELY active person unblocks the order/assignment
            // action. An unavailability booked for later counts as active today
            // (the server guard agrees); any other status leaves them blocked.
            onClose(
                isEffectivelyActive({
                    activityStatus: toStatus,
                    unavailableFrom: draft.needsWindow ? draft.from : null,
                    unavailableUntil: draft.needsWindow ? draft.until : null,
                })
            );
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
                        {blocked.statusDetail ? <> {blocked.statusDetail}</> : null}
                        {blocked.reason ? <> pour le motif « {blocked.reason} »</> : null}.
                    </p>
                    {blocked.comment && (
                        <p className="text-muted-foreground italic">{blocked.comment}</p>
                    )}
                    <p>
                        Pour continuer et {ROLE_ACTION[role]}, vous devez réactiver cette personne.
                        Vous pouvez choisir un autre statut ci-dessous, ainsi qu&apos;un commentaire
                        si vous le souhaitez.
                    </p>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nouveau statut</label>
                        <ActivityStatusFields
                            draft={draft}
                            currentStatus={blocked.activityStatus}
                            triggerClassName="bg-field border-border text-foreground"
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
                        onClick={() => {
                            if (needsActivityStatusConfirmation(toStatus)) {
                                setPendingStatus(toStatus);
                                return;
                            }
                            void handleReactivate();
                        }}
                        disabled={isSubmitting || !draft.isComplete}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isSubmitting ? 'Mise à jour...' : 'Réactiver et continuer'}
                    </Button>
                </div>

                <ActivityStatusConfirmDialog
                    status={pendingStatus}
                    personName={blocked.name}
                    onConfirm={() => void handleReactivate()}
                    onCancel={() => setPendingStatus(null)}
                />
            </DialogContent>
        </Dialog>
    );
}
