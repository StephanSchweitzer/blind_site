'use client';

import { useId, useState } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast, toast as showToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { parisDateTimeDisplay } from '@/lib/paris-day';
import { formatSizeKb } from '@/lib/pricing';
import { ApiErrorMessage, apiErrorToast } from '@/admin/ApiErrorMessage';
import { toUserFacingError, userErrorFromResponse, type UserFacingError } from '@/lib/user-error';

/**
 * La « cette fiche est supprimée » de la fiche livre — même rôle et même forme
 * que DossierDeletedNotice côté personnes : la page reste ouvrable par id (la
 * fiche existe toujours, seul `deletedAt` la cache — voir lib/prisma.ts), mais
 * rien ne le montrait avant ce bandeau, et Restaurer est la seule action qui
 * ait un sens sur une fiche censée ne plus exister ailleurs.
 *
 * La confirmation demande quoi faire de l'audio resté en corbeille, en deux
 * groupes — parti avec la suppression (coché) ou retiré avant (décoché) : voir
 * lib/books/restorePreview.ts pour pourquoi ce n'est plus automatique.
 */

interface BookDeletedNoticeProps {
    bookId: number;
    title: string;
    /** ISO string — formaté ici pour que serveur et client s'accordent sur le fuseau. */
    deletedAt: string;
    onRestored: () => void;
}

interface RestorableTrack {
    id: number;
    filename: string;
    sizeBytes: number;
    deletedAt: string;
}

interface RestorePreview {
    isbnConflict: string | null;
    isbnHolder: { id: number; title: string } | null;
    audio: { withDeletion: RestorableTrack[]; earlier: RestorableTrack[] };
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const tracksLabel = (n: number) => `${n} ${plural(n, 'piste', 'pistes')}`;
const totalSize = (tracks: RestorableTrack[]) =>
    formatSizeKb(tracks.reduce((sum, t) => sum + t.sizeBytes, 0) / 1024);

function TrackGroup({
    tracks,
    checked,
    onCheckedChange,
    label,
    hint,
    showDates,
}: {
    tracks: RestorableTrack[];
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: string;
    hint: string;
    showDates: boolean;
}) {
    const id = useId();
    return (
        <div className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2.5">
                <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(v) => onCheckedChange(v === true)}
                    className="mt-0.5"
                />
                <label htmlFor={id} className="cursor-pointer text-sm">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="block text-muted-foreground">{hint}</span>
                </label>
            </div>
            <ul className="mt-2 ml-7 max-h-32 overflow-y-auto space-y-0.5 text-sm text-muted-foreground">
                {tracks.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3">
                        <span className="truncate" title={t.filename}>{t.filename}</span>
                        {showDates && (
                            <span className="shrink-0 tabular-nums">{parisDateTimeDisplay(t.deletedAt)}</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

interface TrackRestoreTally {
    restored: number;
    failed: number;
    /** Pistes pas encore commencées — à repasser avec `continueAudio`. */
    remaining: number[];
    interrupted: boolean;
}

/**
 * Rappelle POST /api/books/[id]/restore avec `continueAudio` tant qu'il reste des
 * pistes et que chaque appel en ramène. Hors du composant : « Reprendre », dans
 * le message qui suit, s'en sert alors que l'encadré a déjà disparu.
 */
async function continueTrackRestore(
    bookId: number,
    start: TrackRestoreTally,
    onStep: (restored: number) => void,
): Promise<TrackRestoreTally> {
    const tally = { ...start, interrupted: false };
    while (tally.remaining.length) {
        const next = await fetch(`/api/books/${bookId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioTrackIds: tally.remaining, continueAudio: true }),
        }).catch(() => null);
        const data = next ? await next.json().catch(() => null) : null;
        if (!next?.ok || !data) {
            tally.interrupted = true;
            break;
        }
        const step: number = data.audio?.restoredTracks ?? 0;
        tally.restored += step;
        tally.failed += data.audio?.failedTracks ?? 0;
        tally.remaining = Array.isArray(data.remainingTrackIds) ? data.remainingTrackIds : [];
        onStep(tally.restored);
        // Rien n'est revenu : une requête de plus referait la même chose.
        if (!step && tally.remaining.length) {
            tally.interrupted = true;
            break;
        }
    }
    return tally;
}

/**
 * Le message de fin. Interrompue, la restauration garde ce qui reste à ramener :
 * « Reprendre » relance exactement ces pistes-là — auparavant le message
 * renvoyait vers la Corbeille audio, où il fallait les retrouver et les cocher.
 */
function reportTrackRestore(bookId: number, title: string, tally: TrackRestoreTally): void {
    const s = (n: number) => (n > 1 ? 's' : '');
    const left = tally.failed + (tally.interrupted ? tally.remaining.length : 0);
    const resumable = tally.interrupted && tally.remaining.length > 0;
    showToast({
        title: 'Fiche restaurée',
        ...(tally.interrupted ? { variant: 'destructive' as const, duration: Infinity } : {}),
        description:
            `« ${title} » a été restauré. ${tally.restored} piste${s(tally.restored)} audio ` +
            `restaurée${s(tally.restored)} depuis la corbeille.` +
            (left > 0
                ? ` ${left} piste${s(left)} ${left > 1 ? 'sont restées' : 'est restée'} dans la corbeille` +
                  (resumable ? '.' : ' — voir Corbeille audio.')
                : ''),
        action: resumable ? (
            <ToastAction
                altText="Reprendre la restauration des pistes"
                onClick={() => void resumeTrackRestore(bookId, title, tally)}
            >
                Reprendre
            </ToastAction>
        ) : undefined,
    });
}

async function resumeTrackRestore(bookId: number, title: string, from: TrackRestoreTally): Promise<void> {
    const total = from.remaining.length;
    const progress = showToast({ title: 'Restauration des pistes…', description: `0 sur ${total}`, duration: Infinity });
    const base = from.restored;
    const tally = await continueTrackRestore(
        bookId,
        from,
        (restored) =>
            progress.update({
                id: progress.id,
                title: 'Restauration des pistes…',
                description: `${restored - base} sur ${total}`,
                duration: Infinity,
            }),
    );
    progress.dismiss();
    reportTrackRestore(bookId, title, tally);
}

export default function BookDeletedNotice({
    bookId,
    title,
    deletedAt,
    onRestored,
}: BookDeletedNoticeProps) {
    const { toast } = useToast();
    const [isRestoring, setIsRestoring] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [preview, setPreview] = useState<RestorePreview | null>(null);
    const [previewError, setPreviewError] = useState<UserFacingError | null>(null);
    const [withDeletionChecked, setWithDeletionChecked] = useState(true);
    const [earlierChecked, setEarlierChecked] = useState(false);
    /** Pistes revenues jusqu'ici, quand la restauration prend plusieurs requêtes. */
    const [trackProgress, setTrackProgress] = useState<{ restored: number; total: number } | null>(null);

    const on = new Date(deletedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    });

    const openConfirm = async () => {
        setConfirmOpen(true);
        setPreview(null);
        setPreviewError(null);
        setWithDeletionChecked(true);
        setEarlierChecked(false);
        try {
            const response = await fetch(`/api/books/${bookId}/restore`, { cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw userErrorFromResponse(response, body);
            setPreview(body as RestorePreview);
        } catch (error) {
            setPreviewError(toUserFacingError(error));
        }
    };

    const withDeletion = preview?.audio.withDeletion ?? [];
    const earlier = preview?.audio.earlier ?? [];
    const chosen = [
        ...(withDeletionChecked ? withDeletion : []),
        ...(earlierChecked ? earlier : []),
    ];
    const hasAudio = withDeletion.length + earlier.length > 0;
    const blocked = !preview || !!preview.isbnConflict;

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const response = await fetch(`/api/books/${bookId}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioTrackIds: chosen.map((t) => t.id) }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw userErrorFromResponse(response, body);

            // Un gros dossier revient en plusieurs requêtes : la première restaure
            // la fiche et ce qui tient dans son délai, les suivantes (continueAudio)
            // le reste. La fiche est déjà revenue — une panne ici ne la remet pas
            // en cause, d'où un message à part plutôt que l'erreur ci-dessous.
            const remaining: number[] = Array.isArray(body?.remainingTrackIds) ? body.remainingTrackIds : [];
            const first: TrackRestoreTally = {
                restored: body?.audio?.restoredTracks ?? 0,
                failed: body?.audio?.failedTracks ?? 0,
                remaining,
                interrupted: false,
            };
            if (!remaining.length) {
                toast({ title: 'Fiche restaurée', description: body?.message ?? `« ${title} » a été restauré.` });
            } else {
                setTrackProgress({ restored: first.restored, total: chosen.length });
                const tally = await continueTrackRestore(bookId, first, (restored) =>
                    setTrackProgress({ restored, total: chosen.length }),
                );
                reportTrackRestore(bookId, title, tally);
            }
            setConfirmOpen(false);
            onRestored();
        } catch (error) {
            toast(
                apiErrorToast(error, {
                    title: 'Restauration impossible',
                    action: `Restaurer le livre #${bookId} (${chosen.length} piste(s) cochée(s))`,
                }),
            );
        } finally {
            setIsRestoring(false);
            setTrackProgress(null);
        }
    };

    return (
        <>
            <div
                role="status"
                className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Trash2 size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                        <div>
                            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                                Fiche supprimée le {on}
                            </p>
                            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                                Elle n’apparaît plus dans les listes, les recherches ni les menus
                                déroulants. Ses demandes et attributions passées gardent leur
                                référence, et son dossier audio reste attaché. Le reste de la
                                page est en lecture seule tant qu’elle n’est pas restaurée.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 bg-background"
                        onClick={() => void openConfirm()}
                        disabled={isRestoring}
                    >
                        {isRestoring ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                            <RotateCcw size={14} className="mr-1.5" />
                        )}
                        Restaurer
                    </Button>
                </div>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={(open) => !isRestoring && setConfirmOpen(open)}>
                <AlertDialogContent className="max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurer « {title} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La fiche redeviendra visible partout aux ECA : listes, recherches et
                            menus déroulants.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {!preview && !previewError && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 size={14} className="animate-spin" />
                            Vérification de la fiche et de sa corbeille audio…
                        </div>
                    )}

                    {previewError && (
                        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                            <ApiErrorMessage
                                error={previewError}
                                action={`Préparer la restauration du livre #${bookId}`}
                            />
                        </p>
                    )}

                    {preview?.isbnConflict && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <div>
                                <p>{preview.isbnConflict}</p>
                                {preview.isbnHolder && (
                                    <IntentLink
                                        href={`/admin/books?book=${preview.isbnHolder.id}`}
                                        className="mt-1 inline-block font-medium underline underline-offset-2"
                                    >
                                        Voir la fiche « {preview.isbnHolder.title} »
                                    </IntentLink>
                                )}
                            </div>
                        </div>
                    )}

                    {preview && !preview.isbnConflict && !hasAudio && (
                        <p className="text-sm text-muted-foreground">
                            Aucune piste de ce livre n’est en corbeille : son dossier audio revient
                            tel quel.
                        </p>
                    )}

                    {preview && !preview.isbnConflict && hasAudio && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">Audio en corbeille</p>
                            {withDeletion.length > 0 && (
                                <TrackGroup
                                    tracks={withDeletion}
                                    checked={withDeletionChecked}
                                    onCheckedChange={setWithDeletionChecked}
                                    label={`Ramener les ${tracksLabel(withDeletion.length)} ${plural(withDeletion.length, 'envoyée', 'envoyées')} à la corbeille avec la suppression`}
                                    hint={`${totalSize(withDeletion)} — ${plural(withDeletion.length, 'elle retourne', 'elles retournent')} dans le dossier du livre.`}
                                    showDates={false}
                                />
                            )}
                            {earlier.length > 0 && (
                                <TrackGroup
                                    tracks={earlier}
                                    checked={earlierChecked}
                                    onCheckedChange={setEarlierChecked}
                                    label={`Ramener aussi ${plural(earlier.length, 'la piste supprimée', `les ${earlier.length} pistes supprimées`)} avant, depuis l’éditeur audio`}
                                    hint={
                                        earlier.length > 1
                                            ? 'Retirées une par une avant la suppression de la fiche — souvent des prises ratées ou remplacées.'
                                            : 'Retirée avant la suppression de la fiche — souvent une prise ratée ou remplacée.'
                                    }
                                    showDates
                                />
                            )}
                            <p className="text-sm text-muted-foreground">
                                Les pistes non cochées restent dans la corbeille audio, restaurables
                                plus tard jusqu’à leur purge.
                            </p>
                        </div>
                    )}

                    {/* Monté en permanence : une région qui apparaît avec son texte n'est pas annoncée. */}
                    <div role="status">
                        {trackProgress && (
                            <p className="text-sm text-muted-foreground">
                                {trackProgress.restored} piste{trackProgress.restored > 1 ? 's' : ''} sur{' '}
                                {trackProgress.total} revenue{trackProgress.restored > 1 ? 's' : ''} dans le dossier…
                            </p>
                        )}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRestoring}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                // Keep the dialog up while the request runs, so the
                                // action cannot be fired twice on a slow network.
                                e.preventDefault();
                                void handleRestore();
                            }}
                            disabled={isRestoring || blocked}
                        >
                            {isRestoring && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                            {chosen.length > 0
                                ? `Restaurer la fiche et ${tracksLabel(chosen.length)}`
                                : hasAudio
                                    ? 'Restaurer la fiche seule'
                                    : 'Restaurer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
