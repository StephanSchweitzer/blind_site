'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, ExternalLink, Loader2, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BookUsageLinks } from '@/admin/BookUsageLinks';
import { BookSearchCombobox, type BookSearchResult } from '@/admin/BookSearchCombobox';
import { bytesToKb, formatSizeKb } from '@/lib/pricing';
import type {
    BookAudioDispositionMode,
    BookDeletionPreflightResponse,
} from '@/types/api/book.api';

/**
 * Supprimer une fiche livre : ce qui l'empêche, puis ce que devient l'enregistrement.
 *
 * DEUX CHOSES QUE CETTE FENÊTRE CORRIGE
 *
 * 1. Les refus arrivaient TROP TARD. C'était un `window.confirm`, et le
 *    permanent apprenait qu'une demande nommait le livre — ou qu'une autre fiche
 *    partageait son dossier audio — après avoir confirmé, en lisant l'erreur d'un
 *    appel qui n'a rien fait. Le contrôle (GET /api/books/[id]/deletion-check) est
 *    donc lu à l'ouverture : quand il refuse, la fenêtre le dit et n'offre
 *    AUCUNE option.
 * 2. Le dossier audio partait à la corbeille en silence. Copier 77 pistes et
 *    748 Mio dans une requête de 45 s pour protéger une copie que plus aucune
 *    fiche ne réclamera, c'est long, coûteux, et souvent inutile. Les trois
 *    sorts possibles sont donc proposés, « laisser le dossier » en premier.
 *
 * La suppression reste irréversible côté fiche : c'est le journal des
 * modifications (/admin/stats, 14 jours) qui permet de la rejouer, et le
 * dossier audio, lui, n'est jamais supprimé du stockage par cette fenêtre.
 */

interface DeleteBookModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    /** Titre affiché en attendant le contrôle, et dans la phrase de confirmation. */
    bookTitle?: string;
    /** Appelé une fois la fiche réellement supprimée. */
    onDeleted: () => void;
}

interface DeleteFailure {
    error: string;
    /** Le livre visé par un transfert porte un chemin, vide, qu'il faut confirmer d'écraser. */
    requiresTargetReplaceConfirm?: boolean;
}

const tracksLabel = (n: number) => `${n} piste${n > 1 ? 's' : ''}`;

/** « 3 pistes · 748,0 Mo » — le poids passe par le formateur commun (lib/pricing.ts). */
const folderSummary = (trackCount: number, sizeBytes: number) =>
    `${tracksLabel(trackCount)} · ${formatSizeKb(bytesToKb(sizeBytes))}`;

export function DeleteBookModal({
    isOpen,
    onOpenChange,
    bookId,
    bookTitle,
    onDeleted,
}: DeleteBookModalProps) {
    const { toast } = useToast();

    const [preflight, setPreflight] = useState<BookDeletionPreflightResponse | null>(null);
    /**
     * Vrai jusqu'à ce que le contrôle réponde. L'état de départ, et remis par
     * reset() à la fermeture, plutôt que posé dans l'effet : `setState` synchrone
     * dans un effet est précisément ce que react-hooks/set-state-in-effect
     * interdit ici, et la fermeture est un gestionnaire d'évènement.
     */
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [mode, setMode] = useState<BookAudioDispositionMode>('leave');
    const [target, setTarget] = useState<BookSearchResult | null>(null);
    const [confirmReplaceTarget, setConfirmReplaceTarget] = useState(false);
    const [replacePrompt, setReplacePrompt] = useState<string | null>(null);
    const [typedCount, setTypedCount] = useState('');

    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setPreflight(null);
        setLoading(true);
        setLoadError(null);
        setMode('leave');
        setTarget(null);
        setConfirmReplaceTarget(false);
        setReplacePrompt(null);
        setTypedCount('');
        setError(null);
    }, []);

    // Relu à chaque ouverture, jamais mis en cache : entre deux ouvertures, une
    // demande a pu naître et un fichier a pu être déposé dans le dossier.
    useEffect(() => {
        if (!isOpen) return;
        const controller = new AbortController();
        fetch(`/api/books/${bookId}/deletion-check`, { signal: controller.signal })
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    throw new Error(data?.error || 'Contrôle de suppression impossible.');
                }
                setPreflight(data as BookDeletionPreflightResponse);
            })
            .catch((e) => {
                if (e instanceof DOMException && e.name === 'AbortError') return;
                setLoadError(e instanceof Error ? e.message : 'Contrôle de suppression impossible.');
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [isOpen, bookId]);

    const audio = preflight?.audio;
    const trackCount = audio?.trackCount ?? 0;
    const hasFolder = trackCount > 0;
    const blocked = preflight?.blocked ?? false;

    /** Les garde-fous propres à chaque option, avant d'autoriser le bouton rouge. */
    const ready =
        preflight !== null &&
        !blocked &&
        (!hasFolder ||
            (mode === 'leave' ||
                (mode === 'transfer' && target !== null) ||
                (mode === 'trash' && typedCount.trim() === String(trackCount))));

    const handleDelete = async () => {
        if (!ready || !preflight) return;
        setIsDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio: {
                        mode: hasFolder ? mode : 'leave',
                        ...(mode === 'transfer' && target
                            ? { targetBookId: target.id, confirmReplaceTarget }
                            : {}),
                        ...(mode === 'trash' ? { confirmTrackCount: trackCount } : {}),
                    },
                }),
            });
            const data: (DeleteFailure & { audio?: Record<string, unknown> }) | null = await res
                .json()
                .catch(() => null);

            if (!res.ok) {
                // Le livre visé porte un chemin dont le dossier est vide : on
                // demande une confirmation plutôt que de l'écraser en silence,
                // exactement comme le rattachement d'un dossier orphelin.
                if (data?.requiresTargetReplaceConfirm) {
                    setReplacePrompt(data.error);
                } else {
                    setError(data?.error || 'La suppression du livre a échoué.');
                }
                return;
            }

            const outcome = (data?.audio ?? {}) as {
                mode?: BookAudioDispositionMode;
                trackCount?: number;
                targetTitle?: string;
                orphanedPrefix?: string;
                targetStateStale?: boolean;
            };
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Fiche supprimée</span>,
                description: <span className="text-xl mt-2">{describeOutcome(outcome)}</span>,
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });
            onOpenChange(false);
            reset();
            onDeleted();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'La suppression du livre a échoué.');
        } finally {
            setIsDeleting(false);
        }
    };

    const title = preflight?.title ?? bookTitle ?? '';

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) reset();
                onOpenChange(open);
            }}
        >
            <DialogContent className="max-w-xl bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Supprimer le livre
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        {title ? `« ${title} »` : `Fiche #${bookId}`}
                        {preflight && !blocked && (
                            <>
                                {' '}
                                — la fiche est supprimée définitivement. Ce qu’elle garde de
                                l’enregistrement audio se décide ci-dessous.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {loading && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Vérification en cours…
                        </p>
                    )}

                    {loadError && (
                        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-900/20 dark:text-red-200">
                            {loadError}
                        </div>
                    )}

                    {/* --- Refus : aucune option n'est proposée ------------------ */}
                    {preflight?.usageRefusal && (
                        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-900/20 dark:text-red-200">
                            <p>{preflight.usageRefusal}</p>
                            <BookUsageLinks bookId={bookId} className="mt-2" />
                        </div>
                    )}

                    {preflight?.audio.sharedRefusal && (
                        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-900/20 dark:text-red-200">
                            <p>{preflight.audio.sharedRefusal}</p>
                            <ul className="mt-2 space-y-1">
                                {preflight.audio.sharedWith.map((b) => (
                                    <li key={b.id}>
                                        <Link
                                            href={`/admin/books/${b.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                                        >
                                            « {b.title} » (#{b.id})
                                            <ExternalLink className="h-3 w-3" aria-hidden />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* --- Le dossier audio, et ce qu'il faut en faire ----------- */}
                    {preflight && !blocked && hasFolder && (
                        <>
                            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                                <p className="text-foreground">
                                    Dossier audio : {folderSummary(trackCount, audio!.sizeBytes)}
                                </p>
                                <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                                    {audio!.prefix}
                                </p>
                            </div>

                            <fieldset className="space-y-3" aria-describedby="audio-disposition-hint">
                                <legend
                                    id="audio-disposition-hint"
                                    className="text-sm font-medium text-foreground"
                                >
                                    Que faire de l’enregistrement ?
                                </legend>

                                <label className="flex gap-3 rounded-md border border-border bg-field p-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="audio-disposition"
                                        value="leave"
                                        checked={mode === 'leave'}
                                        onChange={() => setMode('leave')}
                                        // Le libellé est imbriqué dans le <label>, mais l'arbre
                                        // d'accessibilité rendait « leave » — la valeur — plutôt
                                        // que la phrase. Nommé explicitement : cette fenêtre décide
                                        // du sort d'un enregistrement, elle doit s'annoncer.
                                        aria-label="Laisser le dossier dans le stockage (conseillé)"
                                        className="mt-1 flex-shrink-0"
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium text-foreground">
                                            Laisser le dossier dans le stockage{' '}
                                            <span className="text-muted-foreground">(conseillé)</span>
                                        </span>
                                        <span className="block text-muted-foreground mt-0.5">
                                            Rien n’est copié ni supprimé. Le dossier n’appartient plus
                                            à aucune fiche et apparaît aussitôt dans{' '}
                                            <Link
                                                href="/admin/audio-orphelins"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline underline-offset-2"
                                            >
                                                Audio orphelins
                                            </Link>
                                            , où il peut être rattaché à un livre ou écarté.
                                        </span>
                                    </span>
                                </label>

                                <label className="flex gap-3 rounded-md border border-border bg-field p-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="audio-disposition"
                                        value="transfer"
                                        checked={mode === 'transfer'}
                                        onChange={() => setMode('transfer')}
                                        aria-label="Transférer le dossier vers un autre livre"
                                        className="mt-1 flex-shrink-0"
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium text-foreground">
                                            Transférer vers un autre livre
                                        </span>
                                        <span className="block text-muted-foreground mt-0.5">
                                            L’autre fiche pointe sur ce dossier à la place. Refusé si
                                            elle possède déjà des pistes : un dossier n’appartient qu’à
                                            un seul livre.
                                        </span>
                                    </span>
                                </label>

                                {mode === 'transfer' && (
                                    <div className="ml-7 space-y-2">
                                        <BookSearchCombobox<BookSearchResult>
                                            value={target}
                                            onSelect={(book) => {
                                                if (book.id === bookId) {
                                                    setError(
                                                        'Le dossier ne peut pas être transféré au livre qu’on supprime.',
                                                    );
                                                    return false;
                                                }
                                                setError(null);
                                                setReplacePrompt(null);
                                                setConfirmReplaceTarget(false);
                                                setTarget(book);
                                            }}
                                            placeholder="Choisir le livre qui hérite du dossier…"
                                        />
                                        {replacePrompt && (
                                            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-100">
                                                <p>{replacePrompt}</p>
                                                <label className="mt-2 flex items-center gap-2">
                                                    <Checkbox
                                                        checked={confirmReplaceTarget}
                                                        onCheckedChange={(v) =>
                                                            setConfirmReplaceTarget(v === true)
                                                        }
                                                    />
                                                    <span>Remplacer son chemin audio</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <label className="flex gap-3 rounded-md border border-border bg-field p-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="audio-disposition"
                                        value="trash"
                                        checked={mode === 'trash'}
                                        onChange={() => setMode('trash')}
                                        aria-label="Envoyer les pistes à la corbeille"
                                        className="mt-1 flex-shrink-0"
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium text-foreground">
                                            Envoyer les pistes à la corbeille
                                        </span>
                                        <span className="block text-muted-foreground mt-0.5">
                                            Chaque fichier est copié dans la corbeille, vérifié, puis
                                            retiré du dossier. Restaurable 14 jours depuis{' '}
                                            <Link
                                                href="/admin/audio-corbeille"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline underline-offset-2"
                                            >
                                                Corbeille audio
                                            </Link>
                                            , puis supprimé définitivement du stockage. Un gros dossier
                                            peut demander plusieurs tentatives : relancez, les fichiers
                                            déjà déplacés ne le sont pas deux fois.
                                        </span>
                                    </span>
                                </label>

                                {mode === 'trash' && (
                                    <div className="ml-7">
                                        <label
                                            htmlFor="confirm-track-count"
                                            className="text-sm text-foreground"
                                        >
                                            Pour confirmer, tapez le nombre de pistes à envoyer à la
                                            corbeille : <span className="font-semibold">{trackCount}</span>
                                        </label>
                                        <Input
                                            id="confirm-track-count"
                                            value={typedCount}
                                            onChange={(e) => setTypedCount(e.target.value)}
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder={String(trackCount)}
                                            className="mt-1 bg-field border-border text-foreground"
                                        />
                                    </div>
                                )}
                            </fieldset>
                        </>
                    )}

                    {/* Le dossier ne contient rien : il n'y a pas de décision à prendre. */}
                    {preflight && !blocked && !hasFolder && (
                        <p className="text-sm text-muted-foreground">
                            {audio?.prefix
                                ? 'Le dossier audio de cette fiche ne contient aucune piste : il n’y a rien à déplacer.'
                                : 'Cette fiche ne porte aucun dossier audio.'}
                        </p>
                    )}

                    {/* Des pistes sont DÉJÀ en corbeille : elles survivent à la fiche. */}
                    {preflight && !blocked && audio!.trashCount > 0 && (
                        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                            <Undo2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>
                                {audio!.trashCount} fichier
                                {audio!.trashCount > 1 ? 's' : ''} de ce livre {audio!.trashCount > 1 ? 'sont' : 'est'}{' '}
                                déjà dans la corbeille. {audio!.trashCount > 1 ? 'Ils resteront' : 'Il restera'}{' '}
                                restaurable{audio!.trashCount > 1 ? 's' : ''} depuis{' '}
                                <Link
                                    href="/admin/audio-corbeille"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline underline-offset-2"
                                >
                                    Corbeille audio
                                </Link>
                                , au nom de cette fiche.
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-900/20 dark:text-red-200">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isDeleting}
                        className="bg-field border-border text-foreground hover:bg-muted"
                    >
                        {blocked ? 'Fermer' : 'Annuler'}
                    </Button>
                    {!blocked && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleDelete()}
                            disabled={isDeleting || !ready}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Suppression…
                                </span>
                            ) : (
                                'Supprimer la fiche'
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Ce qui est arrivé au dossier, dit en une phrase dans le toast de succès. */
function describeOutcome(outcome: {
    mode?: BookAudioDispositionMode;
    trackCount?: number;
    targetTitle?: string;
    orphanedPrefix?: string;
    targetStateStale?: boolean;
}): string {
    const count = outcome.trackCount ?? 0;
    if (!count) return 'La fiche a été supprimée.';
    if (outcome.mode === 'transfer') {
        return (
            `La fiche a été supprimée. Le dossier audio (${tracksLabel(count)}) appartient ` +
            `maintenant à « ${outcome.targetTitle ?? 'l’autre livre'} »` +
            (outcome.targetStateStale
                ? ', dont l’état audio sera relu à la prochaine ouverture de l’éditeur.'
                : '.')
        );
    }
    if (outcome.mode === 'trash') {
        return (
            `La fiche a été supprimée et ses ${tracksLabel(count)} sont dans la corbeille, ` +
            `restaurables pendant 14 jours depuis Corbeille audio.`
        );
    }
    return (
        `La fiche a été supprimée. Son dossier audio (${tracksLabel(count)}) est resté dans le ` +
        `stockage et attend dans Audio orphelins.`
    );
}
