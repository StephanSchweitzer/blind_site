'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    AlertTriangle,
    CloudUpload,
    Download,
    FolderArchive,
    FolderOpen,
    FolderPlus,
    Loader2,
    Lock,
    Pause,
    Pencil,
    Play,
    RefreshCw,
    RotateCcw,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAudioUpload, type FileProgress, type UploadPhase } from '@/hooks/useAudioUpload';
import { safeZipName, useAudioFolderZip, type ZipEntry } from '@/hooks/useAudioFolderZip';
import {
    REJECT_LABELS,
    selectFolderAudio,
    type FolderSelection,
    type RejectReason,
} from '@/lib/audio/folder-selection';
import {
    getAudioLinkStatusColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
    type AudioLinkStatus,
} from '@/lib/audio-enums';
import { DeleteAudioTrackModal, type AudioTrackTarget } from '@/admin/DeleteAudioTrackModal';
import { DeleteAllAudioTracksModal } from '@/admin/DeleteAllAudioTracksModal';
import { RenameAudioTrackModal, type AudioTrackRenameTarget } from '@/admin/RenameAudioTrackModal';

interface Track {
    order: number;
    key: string;
    name: string;
    sizeBytes: number;
    durationSeconds: number | null;
    url: string;
    downloadUrl: string;
}

interface ManageResponse {
    bookId: number;
    title: string;
    author: string;
    prefix: string;
    hasFolder: boolean;
    status: AudioLinkStatus;
    trackCount: number;
    totalBytes: number;
    trashCount: number;
    tracks: Track[];
}

interface TrashItem {
    id: number;
    filename: string;
    originalKey: string;
    sizeBytes: number;
    deletedAt: string;
    restoredAt: string | null;
    purgedAt: string | null;
    retainForever: boolean;
    /** null when retainForever — otherwise deletedAt + the retention window. */
    purgeEligibleAt: string | null;
    deletedBy: { id: number; name: string | null; email: string | null } | null;
    restoredBy: { id: number; name: string | null; email: string | null } | null;
}

interface BookAudioModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    /** Fires after any change, so a parent list can refresh its cached counters. */
    onChanged?: () => void;
}

const formatSize = (bytes: number) =>
    bytes >= 1e9
        ? `${(bytes / 1e9).toFixed(2)} Go`
        : bytes >= 1e6
          ? `${(bytes / 1e6).toFixed(1)} Mo`
          : `${Math.max(1, Math.round(bytes / 1e3))} Ko`;

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const personLabel = (p: { name: string | null; email: string | null } | null) =>
    p?.name || p?.email || 'inconnu';

/** Retention line for an active (not restored, not purged) corbeille row. */
const retentionLabel = (item: TrashItem): string => {
    if (item.retainForever || !item.purgeEligibleAt) {
        return 'conservé indéfiniment (supprimé avant la mise en place de la purge automatique)';
    }
    const daysLeft = Math.ceil(
        (new Date(item.purgeEligibleAt).getTime() - Date.now()) / 86_400_000,
    );
    if (daysLeft <= 0) return 'purge automatique imminente';
    return `purge automatique dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} (${formatDate(item.purgeEligibleAt)})`;
};

/** Seconds since this component mounted, ticking once a second. */
function useElapsedSeconds(): number {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const started = Date.now();
        const id = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(id);
    }, []);
    return seconds;
}

const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The second half of an upload, which used to be invisible.
 *
 * The green bars measure bytes leaving the machine and nothing else. Once the
 * last one is sent there is a second wait — B2 acknowledging the object, then
 * the server verifying it — that is silent, unbounded, and on a large track far
 * longer than the transfer itself. Left unexplained it reads as a freeze, and a
 * permanent closes the tab in the middle of it.
 *
 * So it gets its own indicator. The part that can be counted (files the storage
 * has acknowledged) is a real bar; the verification round-trip that follows is
 * an indeterminate one, because inventing a percentage for it would be a lie.
 * The elapsed clock is there purely so a long wait still looks alive.
 */
function CloudFinalisingPanel({ phase, progress }: { phase: UploadPhase; progress: FileProgress[] }) {
    const elapsed = useElapsedSeconds();
    const total = progress.length;
    const acknowledged = progress.filter(
        (p) => p.status === 'terminé' || p.status === 'échec',
    ).length;
    const verifying = phase === 'finalising';
    const percent = total ? Math.round((acknowledged / total) * 100) : 0;

    return (
        <div
            className="flex-shrink-0 rounded-md border border-blue-500/40 bg-blue-500/10 p-3"
            role="status"
            aria-live="polite"
        >
            <div className="flex items-start gap-2">
                <CloudUpload className="mt-0.5 h-4 w-4 flex-shrink-0 animate-pulse text-blue-600 dark:text-blue-300" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                        Préparation de l’audio dans le cloud…
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Vos fichiers ont quitté votre ordinateur. Le stockage termine maintenant de
                        les enregistrer : cette étape est silencieuse et peut durer plusieurs
                        minutes pour un fichier volumineux. Merci de patienter sans fermer cette
                        fenêtre ni quitter la page.
                    </p>

                    <div className="mt-2 flex justify-between gap-2 text-xs">
                        <span className="text-foreground">
                            {verifying
                                ? 'Vérification des fichiers enregistrés…'
                                : `${acknowledged} / ${total} fichier${total > 1 ? 's' : ''} enregistré${acknowledged > 1 ? 's' : ''} par le stockage`}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">
                            {formatElapsed(elapsed)}
                        </span>
                    </div>

                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                        {verifying ? (
                            <div className="h-full w-1/4 animate-indeterminate-bar rounded bg-blue-500" />
                        ) : (
                            <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${percent}%` }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Where the batch as a whole has got to.
 *
 * The per-file rows answer "what is this file doing"; on a sixty-track folder
 * nobody can answer "how far along am I" from sixty bars. This is the one line
 * that says it, and it counts bytes rather than files so a folder of mixed sizes
 * doesn't jump from 10 % to 80 % on one large track.
 */
function BatchProgressPanel({ phase, progress }: { phase: UploadPhase; progress: FileProgress[] }) {
    const total = progress.length;
    const done = progress.filter((p) => p.status === 'terminé').length;
    const failed = progress.filter((p) => p.status === 'échec').length;
    const retrying = progress.filter(
        (p) => p.status === 'nouvelle tentative' || p.attempts > 1,
    ).length;

    const bytesTotal = progress.reduce((s, p) => s + p.total, 0);
    const bytesSent = progress.reduce(
        (s, p) => s + (p.status === 'terminé' ? p.total : p.loaded),
        0,
    );
    const percent = bytesTotal ? Math.round((bytesSent / bytesTotal) * 100) : 0;

    return (
        <div
            className="flex-shrink-0 rounded-md border border-border bg-field p-3"
            role="status"
            aria-live="polite"
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                    {phase === 'preparing'
                        ? 'Préparation…'
                        : phase === 'finalising'
                          ? 'Vérification des fichiers enregistrés…'
                          : `Envoi en cours — ${done} / ${total} fichier${total > 1 ? 's' : ''}`}
                </span>
                <span className="text-xs text-muted-foreground">
                    {formatSize(bytesSent)} / {formatSize(bytesTotal)} · {percent} %
                </span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${percent}%` }}
                />
            </div>

            {/* Retries are normal here, so they are reported as routine rather
                than as alarm — but never hidden. */}
            {(retrying > 0 || failed > 0) && (
                <p className="mt-2 text-xs">
                    {retrying > 0 && (
                        <span className="text-amber-700 dark:text-amber-300">
                            {retrying} fichier{retrying > 1 ? 's' : ''} en nouvelle tentative
                            (incident passager du stockage, repris automatiquement)
                        </span>
                    )}
                    {retrying > 0 && failed > 0 && ' · '}
                    {failed > 0 && (
                        <span className="text-red-500">
                            {failed} en échec pour l’instant
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}

/**
 * Archive entries for a folder. The path is the key relative to the book
 * folder, which keeps any sub-folder structure and guarantees unique entry
 * names even if two sub-folders happen to share a filename.
 */
const toZipEntries = (d: ManageResponse): ZipEntry[] =>
    d.tracks.map((t) => ({
        path: (d.prefix && t.key.startsWith(d.prefix) ? t.key.slice(d.prefix.length) : t.name) || t.name,
        url: t.url,
        sizeBytes: t.sizeBytes,
    }));

export function BookAudioModal({ isOpen, onOpenChange, bookId, onChanged }: BookAudioModalProps) {
    const { toast } = useToast();
    const [tab, setTab] = useState<'pistes' | 'corbeille'>('pistes');
    const [data, setData] = useState<ManageResponse | null>(null);
    const [trash, setTrash] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [playingKey, setPlayingKey] = useState<string | null>(null);
    const [target, setTarget] = useState<AudioTrackTarget | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<AudioTrackRenameTarget | null>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    /** A picked folder, awaiting the admin's confirmation. See the panel below. */
    const [selection, setSelection] = useState<FolderSelection | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);

    const {
        phase,
        progress,
        error: uploadError,
        needsFolder,
        failedFiles,
        upload,
        reset,
    } = useAudioUpload(bookId);
    const zip = useAudioFolderZip();

    const notifyError = useCallback(
        (message: string) => {
            toast({
                variant: 'destructive',
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{message}</span>,
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
        },
        [toast],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [mRes, tRes] = await Promise.all([
                fetch(`/api/books/${bookId}/audio/manage`),
                fetch(`/api/books/${bookId}/audio/trash`),
            ]);
            const mData = await mRes.json().catch(() => null);
            if (!mRes.ok) throw new Error(mData?.message || 'Chargement impossible');
            setData(mData as ManageResponse);

            const tData = await tRes.json().catch(() => null);
            setTrash(tRes.ok ? ((tData?.items ?? []) as TrashItem[]) : []);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Erreur inattendue');
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    // Load on open, once per book. Tracked in a ref rather than state: this is
    // bookkeeping about whether a fetch has been kicked off, not something the
    // UI renders, and setting state here would trigger the cascading re-render
    // that react-hooks/set-state-in-effect exists to prevent.
    const loadedForRef = useRef<number | null>(null);
    useEffect(() => {
        if (isOpen && loadedForRef.current !== bookId) {
            loadedForRef.current = bookId;
            void load();
        } else if (!isOpen) {
            loadedForRef.current = null;
        }
    }, [isOpen, bookId, load]);

    // Stop playback whenever the dialogue closes; an invisible player that keeps
    // going is disorienting, especially for screen-reader users.
    useEffect(() => {
        if (!isOpen && audioRef.current) {
            audioRef.current.pause();
        }
    }, [isOpen]);

    const refreshAll = useCallback(async () => {
        await load();
        onChanged?.();
    }, [load, onChanged]);

    const togglePlay = (track: Track) => {
        const el = audioRef.current;
        if (!el) return;
        if (playingKey === track.key && !el.paused) {
            el.pause();
            setPlayingKey(null);
            return;
        }
        el.src = track.url;
        void el.play().catch(() => notifyError('Lecture impossible.'));
        setPlayingKey(track.key);
    };

    /**
     * A folder was picked. Nothing is sent yet.
     *
     * The browser has handed over its whole recursive walk of that folder, so
     * the batch is narrowed down first (`selectFolderAudio`) and then shown for
     * confirmation. Picking a container is not the same act as picking files:
     * the admin has to see what is actually going to be uploaded, and what was
     * left out, before any of it is signed.
     */
    const handleFolderChosen = (raw: File[]) => {
        if (!raw.length) return;
        const chosen = selectFolderAudio(raw);
        if (!chosen.files.length) {
            notifyError(
                chosen.rootName
                    ? 'Aucun fichier audio directement dans ce dossier. ' +
                          'Les sous-dossiers ne sont pas parcourus.'
                    : 'Aucun fichier audio valide dans cette sélection.',
            );
            return;
        }
        reset();
        setSelection(chosen);
    };

    const handleFilesChosen = async (files: File[], createFolder = false) => {
        if (!files.length) return;
        setSelection(null);
        setPendingFiles(files);
        const { ok, becameAvailable, recovered, repriced } = await upload(files, createFolder);
        if (ok) {
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Envoi terminé</span>,
                description: (
                    <span className="text-xl mt-2">
                        {files.length} fichier{files.length > 1 ? 's' : ''} ajouté
                        {files.length > 1 ? 's' : ''} au dossier.
                        {/* Say it out loud: the admin saw bars restart and
                            deserves to know it was handled, not glossed over. */}
                        {recovered > 0 &&
                            ` ${recovered} ${recovered > 1 ? 'ont' : 'a'} nécessité une nouvelle tentative, ` +
                                'automatiquement résolue.'}
                        {becameAvailable && ' Le livre est désormais marqué « Disponible ».'}
                        {/* Money moved: say so here rather than let it be
                            discovered sur une facture. Seules les demandes non
                            facturées ou en brouillon sont concernées. */}
                        {repriced > 0 &&
                            ` Le tarif de ${repriced} demande${repriced > 1 ? 's' : ''} non facturée${repriced > 1 ? 's' : ''} ` +
                                `a été recalculé d'après le poids de l'enregistrement.`}
                    </span>
                ),
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });
            setPendingFiles([]);
            reset();
            await refreshAll();
        } else {
            // Counters may still have moved if part of the batch landed.
            await refreshAll();
        }
    };

    const handleRestore = async (item: TrashItem) => {
        setRestoringId(item.id);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/trash`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashId: item.id }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok) throw new Error(d?.message || 'Restauration impossible');
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Restauré</span>,
                description: <span className="text-xl mt-2">« {item.filename} » est de retour dans le dossier.</span>,
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });
            await refreshAll();
        } catch (e) {
            notifyError(e instanceof Error ? e.message : 'Erreur inattendue');
        } finally {
            setRestoringId(null);
        }
    };

    const busy = phase === 'preparing' || phase === 'uploading' || phase === 'finalising';
    const activeTrash = trash.filter((t) => !t.restoredAt);
    const zipping = zip.phase === 'running';

    /**
     * The bytes go browser → B2 directly, so leaving the page IS the abort:
     * there is no server-side job to pick the transfer back up. The dialogue is
     * sealed below (no Escape, no click-outside, no close button); this covers
     * the exits the app doesn't own — reload, back, closing the tab.
     */
    useEffect(() => {
        if (!busy) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [busy]);

    /** Second phase: bytes sent, storage not done. See CloudFinalisingPanel. */
    const finalising =
        phase === 'finalising' || progress.some((p) => p.status === 'finalisation');

    /**
     * Zip the whole folder. Nobody wants to click Download forty times.
     *
     * The archive is built in the browser from the same presigned URLs the
     * player uses, so the bytes go straight from the bucket — see
     * useAudioFolderZip.
     */
    const handleDownloadFolder = () => {
        if (!data || !data.tracks.length) return;

        // No streaming sink here: the whole archive has to sit in memory first.
        if (zip.bufferedFallback) {
            const proceed = window.confirm(
                `Ce navigateur doit préparer l’archive entièrement en mémoire (${formatSize(data.totalBytes)}).\n\n` +
                    'Sur un dossier volumineux, Chrome ou Edge écrivent directement sur le disque et sont préférables.\n\n' +
                    'Continuer quand même ?',
            );
            if (!proceed) return;
        }

        const resign = async (): Promise<ZipEntry[]> => {
            const res = await fetch(`/api/books/${bookId}/audio/manage`);
            if (!res.ok) return [];
            return toZipEntries((await res.json()) as ManageResponse);
        };

        void zip.start(toZipEntries(data), safeZipName(`${data.title} - ${data.author}`), resign);
    };

    /**
     * Closing mid-archive would leave the download running with nothing left to
     * show its progress or stop it — the dialogue owns that state. So make the
     * choice explicit rather than silent.
     *
     * An upload in flight is not offered that choice at all: it cannot be
     * resumed, and a half-written folder is worse than a slow one.
     */
    const handleOpenChange = (open: boolean) => {
        if (!open && busy) {
            notifyError(
                'Un envoi est en cours. Attendez la fin de la préparation dans le cloud avant de fermer cette fenêtre.',
            );
            return;
        }
        if (!open && zipping) {
            const stop = window.confirm(
                'Une archive est en cours de préparation. La fermeture annulera le téléchargement.\n\nFermer quand même ?',
            );
            if (!stop) return;
            zip.cancel();
        }
        // An unconfirmed folder selection is scoped to the session that picked
        // it — reopening on another book must not inherit it.
        if (!open) setSelection(null);
        onOpenChange(open);
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogContent
                    aria-busy={busy}
                    // While an upload is in flight the dialogue is sealed: the
                    // close button is hidden and both escape hatches Radix
                    // offers are refused. The modal overlay already blocks the
                    // page behind it, so this is what "locked" means here.
                    onEscapeKeyDown={(e) => busy && e.preventDefault()}
                    onPointerDownOutside={(e) => busy && e.preventDefault()}
                    onInteractOutside={(e) => busy && e.preventDefault()}
                    className={`max-w-4xl max-h-[88dvh] flex flex-col overflow-hidden bg-card border-border [&>button>svg]:text-white ${
                        busy ? '[&>button]:hidden' : ''
                    }`}
                >
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="text-foreground">
                            Fichiers audio {data ? `— ${data.title}` : ''}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {data?.author}
                        </DialogDescription>
                    </DialogHeader>

                    {busy && (
                        <div className="flex-shrink-0 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                            <Lock className="h-4 w-4 flex-shrink-0" />
                            <span>
                                Envoi en cours — cette fenêtre reste verrouillée jusqu’à la fin.
                                Ne quittez pas la page.
                            </span>
                        </div>
                    )}

                    {/* --- Folder state ------------------------------------------------ */}
                    {data && (
                        <div className="flex-shrink-0 space-y-2 border-b border-border pb-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    className={`rounded px-2 py-0.5 text-xs font-medium ${getAudioLinkStatusColor(data.status)}`}
                                >
                                    {getAudioLinkStatusLabel(data.status)}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {data.trackCount} piste{data.trackCount > 1 ? 's' : ''}
                                    {data.trackCount > 0 && ` · ${formatSize(data.totalBytes)}`}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {getAudioLinkStatusHint(data.status)}
                            </p>
                            {data.prefix && (
                                <p className="font-mono text-xs text-muted-foreground break-all">
                                    {data.prefix}
                                </p>
                            )}
                        </div>
                    )}

                    {/* --- Tabs -------------------------------------------------------- */}
                    <div className="flex-shrink-0 flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant={tab === 'pistes' ? 'default' : 'outline'}
                            size="sm"
                            disabled={busy}
                            onClick={() => setTab('pistes')}
                            className={tab === 'pistes' ? '' : 'bg-field border-border text-foreground hover:bg-muted'}
                        >
                            Pistes {data ? `(${data.trackCount})` : ''}
                        </Button>
                        <Button
                            type="button"
                            variant={tab === 'corbeille' ? 'default' : 'outline'}
                            size="sm"
                            disabled={busy}
                            onClick={() => setTab('corbeille')}
                            className={tab === 'corbeille' ? '' : 'bg-field border-border text-foreground hover:bg-muted'}
                        >
                            Corbeille ({activeTrash.length})
                        </Button>

                        {/* Re-fetches the folder listing. Order itself is never cached —
                            it's recomputed from the current filenames on every load — so
                            this can't reorder anything; it exists for admins who want to
                            confirm the list in front of them is the bucket's current state. */}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || loading}
                            onClick={() => void load()}
                            className="bg-field border-border text-foreground hover:bg-muted"
                        >
                            <span className="flex items-center gap-2">
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Actualiser
                            </span>
                        </Button>

                        {/* Whole-folder download — the alternative is one click per chapter. */}
                        {tab === 'pistes' && (data?.trackCount ?? 0) > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={zipping ? zip.cancel : handleDownloadFolder}
                                className="ml-auto bg-field border-border text-foreground hover:bg-muted"
                            >
                                {zipping ? (
                                    <span className="flex items-center gap-2">
                                        <X className="h-4 w-4" /> Annuler
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <FolderArchive className="h-4 w-4" />
                                        Tout télécharger (ZIP)
                                        {data && (
                                            <span className="text-muted-foreground">
                                                · {formatSize(data.totalBytes)}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </Button>
                        )}

                        {/* Bulk delete — a loop over the same reversible corbeille
                            path as a single delete, see the /audio/tracks route. */}
                        {tab === 'pistes' && (data?.trackCount ?? 0) > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setDeleteAllOpen(true)}
                                className="border-red-500/50 bg-card text-red-500 hover:bg-red-500/10"
                            >
                                <span className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" /> Tout supprimer
                                </span>
                            </Button>
                        )}
                    </div>

                    {/* --- Zip progress ------------------------------------------------ */}
                    {(zipping || zip.phase === 'done' || zip.phase === 'error') && (
                        <div className="flex-shrink-0 rounded-md border border-border bg-field p-3">
                            {zipping && (
                                <>
                                    <div className="flex justify-between gap-2 text-xs">
                                        <span className="truncate text-foreground">
                                            Archivage… {zip.currentName ?? ''}
                                        </span>
                                        <span className="whitespace-nowrap text-muted-foreground">
                                            {formatSize(zip.written)} / {formatSize(zip.total)}
                                        </span>
                                    </div>
                                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                                        <div
                                            className="h-full bg-green-500"
                                            style={{
                                                width: `${zip.total ? Math.min(100, Math.round((zip.written / zip.total) * 100)) : 0}%`,
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                            {zip.phase === 'done' && (
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-foreground">Archive téléchargée.</span>
                                    <button
                                        type="button"
                                        onClick={zip.reset}
                                        className="text-muted-foreground underline underline-offset-2"
                                    >
                                        Masquer
                                    </button>
                                </div>
                            )}
                            {zip.phase === 'error' && (
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-red-500">{zip.error}</span>
                                    <button
                                        type="button"
                                        onClick={zip.reset}
                                        className="text-muted-foreground underline underline-offset-2"
                                    >
                                        Masquer
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- Cloud finalisation ------------------------------------------ */}
                    {finalising && <CloudFinalisingPanel phase={phase} progress={progress} />}

                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-3">
                        {loading && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                            </div>
                        )}

                        {loadError && !loading && (
                            <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{loadError}</span>
                            </div>
                        )}

                        {/* --- Tracks -------------------------------------------------- */}
                        {!loading && !loadError && tab === 'pistes' && data && (
                            <div className="space-y-3">
                                {data.tracks.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        {data.hasFolder
                                            ? 'Ce dossier ne contient aucun fichier audio.'
                                            : 'Ce livre n’a pas encore de dossier audio. Envoyez un fichier pour en créer un.'}
                                    </p>
                                )}

                                {data.tracks.map((t) => (
                                    <div
                                        key={t.key}
                                        className="flex items-center gap-3 rounded-md border border-border bg-field p-2"
                                    >
                                        <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground">
                                            {t.order}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => togglePlay(t)}
                                            aria-label={
                                                playingKey === t.key ? `Mettre en pause ${t.name}` : `Écouter ${t.name}`
                                            }
                                            className="h-8 w-8 flex-shrink-0 bg-card border-border text-foreground hover:bg-muted"
                                        >
                                            {playingKey === t.key ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-sm text-foreground break-all whitespace-pre-wrap">
                                                {t.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatSize(t.sizeBytes)}
                                            </div>
                                        </div>
                                        <span
                                            className="w-16 flex-shrink-0 text-right font-mono text-sm tabular-nums text-foreground"
                                            aria-label={
                                                t.durationSeconds != null
                                                    ? `Durée : ${formatDuration(t.durationSeconds)}`
                                                    : 'Durée non mesurée'
                                            }
                                        >
                                            {t.durationSeconds != null ? formatDuration(t.durationSeconds) : '—'}
                                        </span>
                                        <a
                                            href={t.downloadUrl}
                                            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                                            aria-label={`Télécharger ${t.name}`}
                                        >
                                            <Download className="h-4 w-4" />
                                        </a>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={busy}
                                            onClick={() => {
                                                setRenameTarget(t);
                                                setRenameOpen(true);
                                            }}
                                            aria-label={`Renommer ${t.name}`}
                                            className="h-8 w-8 flex-shrink-0 bg-card border-border text-foreground hover:bg-muted"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={busy}
                                            onClick={() => {
                                                setTarget(t);
                                                setDeleteOpen(true);
                                            }}
                                            aria-label={`Supprimer ${t.name}`}
                                            className="h-8 w-8 flex-shrink-0 border-red-500/50 bg-card text-red-500 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}

                                {/* --- Upload ---------------------------------------------- */}
                                <div className="mt-4 rounded-md border border-dashed border-border p-4">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="audio/*,.mp3,.m4a,.m4b,.wav,.ogg,.opus,.flac,.aac,.wma,.aiff,.aif"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files ?? []);
                                            e.target.value = '';
                                            handleFolderChosen(files);
                                        }}
                                    />
                                    {/* Folder picker. `webkitdirectory` has no React
                                        typing and `accept` is ignored in directory
                                        mode, so the attribute is set on the node and
                                        the filtering happens in JS — see
                                        lib/audio/folder-selection.ts. */}
                                    <input
                                        ref={(el) => {
                                            folderInputRef.current = el;
                                            el?.setAttribute('webkitdirectory', '');
                                            el?.setAttribute('directory', '');
                                        }}
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files ?? []);
                                            e.target.value = '';
                                            handleFolderChosen(files);
                                        }}
                                    />
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={busy}
                                            className="bg-field border-border text-foreground hover:bg-muted"
                                        >
                                            {busy ? (
                                                <span className="flex items-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    {phase === 'finalising'
                                                        ? 'Vérification…'
                                                        : finalising
                                                          ? 'Enregistrement…'
                                                          : 'Envoi…'}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    <Upload className="h-4 w-4" /> Ajouter des fichiers
                                                </span>
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => folderInputRef.current?.click()}
                                            disabled={busy}
                                            className="bg-field border-border text-foreground hover:bg-muted"
                                        >
                                            <span className="flex items-center gap-2">
                                                <FolderOpen className="h-4 w-4" /> Ajouter un dossier
                                            </span>
                                        </Button>
                                        <span className="text-xs text-muted-foreground">
                                            Les fichiers sont envoyés directement au stockage, autant que
                                            nécessaire en un seul envoi : au-delà de 50 fichiers, ils partent
                                            automatiquement par lots, dans l’ordre. 500 Mo maximum par fichier. Un
                                            dossier n’envoie que les fichiers audio qu’il contient directement,
                                            jamais ses sous-dossiers.
                                        </span>
                                    </div>

                                    {/* A folder was picked — show the batch before signing anything. */}
                                    {selection && !busy && (
                                        <div className="mt-3 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm">
                                            <p className="text-foreground">
                                                {selection.rootName ? (
                                                    <>
                                                        Dossier{' '}
                                                        <span className="font-mono break-all">
                                                            {selection.rootName}
                                                        </span>{' '}
                                                        :{' '}
                                                    </>
                                                ) : (
                                                    'Sélection : '
                                                )}
                                                <strong>
                                                    {selection.files.length} fichier
                                                    {selection.files.length > 1 ? 's' : ''} audio
                                                </strong>{' '}
                                                ({formatSize(selection.totalBytes)}) seront envoyés dans
                                                l’ordre de lecture.
                                            </p>

                                            {selection.rejected.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-amber-700 dark:text-amber-300">
                                                        {selection.rejected.length} fichier
                                                        {selection.rejected.length > 1 ? 's' : ''} ignoré
                                                        {selection.rejected.length > 1 ? 's' : ''} :{' '}
                                                        {(Object.keys(REJECT_LABELS) as RejectReason[])
                                                            .map((reason) => ({
                                                                reason,
                                                                count: selection.rejected.filter(
                                                                    (r) => r.reason === reason,
                                                                ).length,
                                                            }))
                                                            .filter((g) => g.count > 0)
                                                            .map(
                                                                (g) =>
                                                                    `${g.count} ${REJECT_LABELS[g.reason]}`,
                                                            )
                                                            .join(', ')}
                                                    </p>
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-xs text-muted-foreground">
                                                            Voir le détail
                                                        </summary>
                                                        <ul className="mt-1 space-y-0.5">
                                                            {selection.rejected.map((r) => (
                                                                <li
                                                                    key={r.path}
                                                                    className="font-mono text-xs break-all text-muted-foreground"
                                                                >
                                                                    {r.path} — {REJECT_LABELS[r.reason]}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </details>
                                                </div>
                                            )}

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() =>
                                                        void handleFilesChosen(selection.files)
                                                    }
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Upload className="h-4 w-4" /> Envoyer{' '}
                                                        {selection.files.length} fichier
                                                        {selection.files.length > 1 ? 's' : ''}
                                                    </span>
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setSelection(null)}
                                                    className="bg-field border-border text-foreground hover:bg-muted"
                                                >
                                                    Annuler
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* The book has no folder — creating one is an explicit decision. */}
                                    {needsFolder !== null && (
                                        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                                            <p className="text-foreground">
                                                Ce livre n’a pas de dossier audio. Un nouveau dossier sera créé :
                                            </p>
                                            <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                                                {needsFolder}
                                            </p>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => void handleFilesChosen(pendingFiles, true)}
                                                disabled={busy || !pendingFiles.length}
                                                className="mt-2"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <FolderPlus className="h-4 w-4" /> Créer le dossier et envoyer
                                                </span>
                                            </Button>
                                        </div>
                                    )}

                                    {uploadError && (
                                        <p className="mt-3 text-sm text-red-500">{uploadError}</p>
                                    )}

                                    {/* The one-click way out of a partial failure.
                                        Re-picking the folder would re-send every file
                                        that already landed; this sends only what is
                                        missing, and the naming logic slots them into
                                        the gaps left behind. */}
                                    {!busy && failedFiles.length > 0 && (
                                        <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-3">
                                            <p className="text-sm font-medium text-foreground">
                                                {failedFiles.length} fichier
                                                {failedFiles.length > 1 ? 's' : ''} à renvoyer
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Les autres fichiers sont bien en ligne : ce bouton ne
                                                renvoie que ceux qui manquent, sans créer de doublon.
                                            </p>
                                            <ul className="mt-2 space-y-1">
                                                {progress
                                                    .filter((p) => p.status === 'échec')
                                                    .map((p) => (
                                                        <li key={p.name} className="text-xs">
                                                            {/* The name on their disk — that is what
                                                                they have to go and find. */}
                                                            <span className="font-mono break-all text-foreground">
                                                                {p.name}
                                                            </span>
                                                            {p.error && (
                                                                <span className="text-red-500">
                                                                    {' '}
                                                                    — {p.error}
                                                                </span>
                                                            )}
                                                            {p.hint && (
                                                                <span className="block text-muted-foreground">
                                                                    → {p.hint}
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                            </ul>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => void handleFilesChosen(failedFiles)}
                                                className="mt-3"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <RotateCcw className="h-4 w-4" />
                                                    {failedFiles.length > 1
                                                        ? `Renvoyer ces ${failedFiles.length} fichiers`
                                                        : 'Renvoyer ce fichier'}
                                                </span>
                                            </Button>
                                        </div>
                                    )}

                                    {busy && progress.length > 0 && (
                                        <div className="mt-3">
                                            <BatchProgressPanel phase={phase} progress={progress} />
                                        </div>
                                    )}

                                    {progress.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {progress.map((p) => (
                                                <div key={p.name} className="text-xs">
                                                    <div className="flex justify-between gap-2">
                                                        <span className="truncate text-foreground">
                                                            {p.assignedName ?? p.name}
                                                        </span>
                                                        <span
                                                            className={
                                                                p.status === 'échec'
                                                                    ? 'text-red-500'
                                                                    : p.status === 'finalisation'
                                                                      ? 'text-blue-600 dark:text-blue-300'
                                                                      : p.status === 'nouvelle tentative'
                                                                        ? 'text-amber-700 dark:text-amber-300'
                                                                        : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {/* The green bar is full at this point but
                                                                nothing has been stored yet — say which. */}
                                                            {p.status === 'finalisation'
                                                                ? 'envoyé, enregistrement en cours…'
                                                                : p.status === 'nouvelle tentative'
                                                                  ? 'incident du stockage, nouvel essai…'
                                                                  : p.status}
                                                            {/* A retry is not a failure, but it is not
                                                                nothing either: say it happened rather
                                                                than let the bar restart unexplained. */}
                                                            {p.attempts > 1 && (
                                                                <span className="ml-1 text-amber-700 dark:text-amber-300">
                                                                    · tentative {p.attempts}/3
                                                                </span>
                                                            )}
                                                            {p.pass > 1 && (
                                                                <span className="ml-1 text-amber-700 dark:text-amber-300">
                                                                    · {p.pass}ᵉ passe
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                                                        <div
                                                            className={`h-full ${
                                                                p.status === 'échec'
                                                                    ? 'bg-red-500'
                                                                    : p.status === 'finalisation'
                                                                      ? 'bg-blue-500'
                                                                      : p.status === 'nouvelle tentative'
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-green-500'
                                                            }`}
                                                            style={{
                                                                width: `${p.total ? Math.round((p.loaded / p.total) * 100) : 0}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    {p.error && <p className="mt-1 text-red-500">{p.error}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- Trash --------------------------------------------------- */}
                        {!loading && !loadError && tab === 'corbeille' && (
                            <div className="space-y-2">
                                {trash.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Aucun fichier supprimé pour ce livre.
                                    </p>
                                )}
                                {trash.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-3 rounded-md border border-border bg-field p-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-sm text-foreground break-all whitespace-pre-wrap">
                                                {item.filename}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatSize(item.sizeBytes)} · supprimé le{' '}
                                                {formatDate(item.deletedAt)} par {personLabel(item.deletedBy)}
                                                {item.restoredAt && (
                                                    <>
                                                        {' '}
                                                        · restauré le {formatDate(item.restoredAt)} par{' '}
                                                        {personLabel(item.restoredBy)}
                                                    </>
                                                )}
                                                {item.purgedAt && (
                                                    <> · supprimé définitivement du stockage le {formatDate(item.purgedAt)}</>
                                                )}
                                                {!item.restoredAt && !item.purgedAt && (
                                                    <> · {retentionLabel(item)}</>
                                                )}
                                            </div>
                                        </div>
                                        {item.restoredAt ? (
                                            <span className="text-xs text-muted-foreground">Restauré</span>
                                        ) : item.purgedAt ? (
                                            <span className="text-xs text-red-500">Purgé</span>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void handleRestore(item)}
                                                disabled={restoringId === item.id}
                                                className="bg-card border-border text-foreground hover:bg-muted"
                                            >
                                                {restoringId === item.id ? (
                                                    <span className="flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" /> Restauration…
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-2">
                                                        <RotateCcw className="h-4 w-4" /> Restaurer
                                                    </span>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Single shared player: only one track plays at a time. */}
                    <audio
                        ref={audioRef}
                        onEnded={() => setPlayingKey(null)}
                        onPause={() => setPlayingKey(null)}
                        className="w-full flex-shrink-0"
                        controls
                    />
                </DialogContent>
            </Dialog>

            <DeleteAudioTrackModal
                isOpen={deleteOpen}
                onOpenChange={setDeleteOpen}
                bookId={bookId}
                track={target}
                onDeleted={() => void refreshAll()}
            />

            <DeleteAllAudioTracksModal
                isOpen={deleteAllOpen}
                onOpenChange={setDeleteAllOpen}
                bookId={bookId}
                trackCount={data?.trackCount ?? 0}
                onDeleted={() => void refreshAll()}
            />

            <RenameAudioTrackModal
                isOpen={renameOpen}
                onOpenChange={setRenameOpen}
                bookId={bookId}
                track={renameTarget}
                onRenamed={() => void refreshAll()}
            />
        </>
    );
}
