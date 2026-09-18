'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
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
import { useToast } from '@/hooks/use-toast';
import { parisDateTimeDisplay } from '@/lib/paris-day';
import { formatSizeKb } from '@/lib/pricing';

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
            <ul className="mt-2 ml-7 max-h-32 overflow-y-auto space-y-0.5 text-xs text-muted-foreground">
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
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [withDeletionChecked, setWithDeletionChecked] = useState(true);
    const [earlierChecked, setEarlierChecked] = useState(false);

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
            if (!response.ok) throw new Error(body?.message ?? 'Échec du chargement');
            setPreview(body as RestorePreview);
        } catch (error) {
            setPreviewError(
                error instanceof Error ? error.message : 'Impossible de préparer la restauration.',
            );
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
            if (!response.ok) {
                throw new Error(body?.message ?? 'Échec de la restauration');
            }
            toast({
                title: 'Fiche restaurée',
                description: body?.message ?? `« ${title} » a été restauré.`,
            });
            setConfirmOpen(false);
            onRestored();
        } catch (error) {
            toast({
                title: 'Erreur',
                description:
                    error instanceof Error ? error.message : 'Échec de la restauration.',
                variant: 'destructive',
            });
        } finally {
            setIsRestoring(false);
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
                        <p className="text-sm text-red-700 dark:text-red-300">{previewError}</p>
                    )}

                    {preview?.isbnConflict && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <div>
                                <p>{preview.isbnConflict}</p>
                                {preview.isbnHolder && (
                                    <Link
                                        href={`/admin/books?book=${preview.isbnHolder.id}`}
                                        className="mt-1 inline-block font-medium underline underline-offset-2"
                                    >
                                        Voir la fiche « {preview.isbnHolder.title} »
                                    </Link>
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
                            <p className="text-xs text-muted-foreground">
                                Les pistes non cochées restent dans la corbeille audio, restaurables
                                plus tard jusqu’à leur purge.
                            </p>
                        </div>
                    )}

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
