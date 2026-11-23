'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
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
    Loader2,
    Lock,
    Pause,
    Pencil,
    Play,
    RefreshCw,
    Replace,
    RotateCcw,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { requestDurationMeasure } from '@/lib/audio/duration-request';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useWarnIfUnsavedChanges } from '@/components/userWarnIfUnsavedChanges';
import { useAudioUpload, type FileProgress, type UploadPhase } from '@/hooks/useAudioUpload';
import { safeZipName, useAudioFolderZip, type ZipEntry } from '@/hooks/useAudioFolderZip';
import {
    missingInMiddle,
    REJECT_LABELS,
    selectFolderAudio,
    type FolderSelection,
    type RejectReason,
} from '@/lib/audio/folder-selection';
import {
    alreadyUploadedFinder,
    cdOrderConflict,
    isAllowedAudioExtension,
    isAppleDoubleName,
    predictUploadNames,
} from '@/lib/audio/naming';
import { isCloudFinalising } from '@/lib/audio/upload-plan';
import { bytesToKb, cdCount } from '@/lib/pricing';
import { archiveLayout, type ArchiveLayout } from '@/lib/audio/download-names';
import { CD_BURN_CAPACITY_BYTES, splitIntoCds } from '@/lib/audio/cd-split';
import {
    getAudioLinkStatusColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
    AudioLinkStatus,
} from '@/lib/audio-enums';
import { DeleteAudioTrackModal, type AudioTrackTarget } from '@/admin/DeleteAudioTrackModal';
import { DeleteAllAudioTracksModal } from '@/admin/DeleteAllAudioTracksModal';
import { RenameAudioTrackModal, type AudioTrackRenameTarget } from '@/admin/RenameAudioTrackModal';
import { MissingDemandeNotice } from '@/admin/MissingDemandeNotice';
import { InProgressReadingNotice } from '@/admin/InProgressReadingNotice';
import { parisDate } from '@/lib/paris-day';
import { ApiErrorMessage, apiErrorToast } from '@/admin/ApiErrorMessage';
import { toUserFacingError, userErrorFromResponse, type UserFacingError } from '@/lib/user-error';
import { getUserNameOnly, type UserNameParts } from '@/lib/users/displayName';

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
    /** Lifetime of every `url` / `downloadUrl` below, in seconds — see freshTrack. */
    expiresIn: number;
    /** Demandes / attributions nommant ce livre — voir MissingDemandeNotice. */
    orderCount: number;
    assignmentCount: number;
    /** Attribution « En cours » sur ce livre — voir InProgressReadingNotice. */
    inProgressReading: { contactName: string | null } | null;
    /** Attribution encore ouverte dont l'audio vient d'être déposé — voir InProgressReadingNotice. */
    assignmentToFinish: { assignmentId: number } | null;
    tracks: Track[];
}

interface TrashItem {
    id: number;
    filename: string;
    originalKey: string;
    sizeBytes: number;
    deletedAt: string;
    restoredAt: string | null;
    retainForever: boolean;
    /** null when retainForever — otherwise deletedAt + the retention window. */
    purgeEligibleAt: string | null;
    deletedBy: { id: number; firstName: string | null; lastName: string | null; email: string | null } | null;
    restoredBy: { id: number; firstName: string | null; lastName: string | null; email: string | null } | null;
}

interface BookAudioModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    /** Fires after any change, so a parent list can refresh its cached counters. */
    onChanged?: () => void;
    /**
     * Start « Tout télécharger (ZIP) » on « Un dossier par CD ». Set by the
     * demande form when the demande is on CD; the book alone cannot decide, since
     * one book can have a demande on CD and another sent by internet. The admin
     * can always switch, and nothing is remembered.
     */
    defaultSplitByCd?: boolean;
}

const formatSize = (bytes: number) =>
    bytes >= 1e9
        ? `${(bytes / 1e9).toFixed(2)} Go`
        : bytes >= 1e6
          ? `${(bytes / 1e6).toFixed(1)} Mo`
          : // Nothing sent yet is « 0 Ko », not « 1 Ko » — the floor is for tiny files.
            bytes <= 0
            ? '0 Ko'
            : `${Math.max(1, Math.round(bytes / 1e3))} Ko`;

/** A whole recording's length: « 4 h 05 », « 47 min ». */
const formatTotalDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/**
 * Re-sign a little before the hour is up, not on the dot: the player asks the
 * storage for a track piece by piece as it plays, and the pieces asked for
 * after the link has expired are refused.
 */
const LINK_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Has the time links signed at `signedAt` for `expiresIn` seconds (nearly) run out? */
const linkExpired = (signedAt: number, expiresIn: number) =>
    Date.now() > signedAt + expiresIn * 1000 - LINK_EXPIRY_MARGIN_MS;

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
};

const formatDate = (iso: string) =>
    parisDate(iso, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const personLabel = (p: UserNameParts | null) =>
    getUserNameOnly(p) || p?.email || 'inconnu';

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

            <div
                className="mt-2 h-2 w-full overflow-hidden rounded bg-muted"
                role="progressbar"
                aria-label="Envoi"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
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
                        <span className="text-red-600 dark:text-red-400">
                            {failed} en échec pour l’instant
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}

/**
 * Archive entries for a folder, in playback order, and the layout they follow.
 * The names are the bucket names unless a CD burned from them would play out of
 * order, or Windows could not create them — see downloadEntryNames. The listing
 * never holds a track in a sub-folder (toOrderedTracks leaves them out), so a
 * path's only folder is the CD one, when the archive is split.
 *
 * The one function for both the first build and the re-signing (`resign` below):
 * the archive finds each refreshed link by its path, CD folder included, so the
 * two must never compute it apart.
 */
const toZipEntries = (d: ManageResponse, splitByCd: boolean): { entries: ZipEntry[]; layout: ArchiveLayout } => {
    const layout = archiveLayout(d.tracks, splitByCd);
    return {
        entries: d.tracks.map((t, i) => ({ path: layout.paths[i], url: t.url, sizeBytes: t.sizeBytes })),
        layout,
    };
};

export function BookAudioModal({
    isOpen,
    onOpenChange,
    bookId,
    onChanged,
    defaultSplitByCd,
}: BookAudioModalProps) {
    const { toast } = useToast();
    const [tab, setTab] = useState<'pistes' | 'corbeille'>('pistes');
    const [data, setData] = useState<ManageResponse | null>(null);
    const [trash, setTrash] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<UserFacingError | null>(null);
    /**
     * La corbeille n'a pas pu être lue. Distinct de `loadError` : les pistes,
     * elles, sont là. Avant, un échec ici s'affichait « Aucun fichier supprimé
     * pour ce livre » — une corbeille vide mensongère, précisément quand on la
     * cherche après une suppression qui a mal tourné.
     */
    const [trashError, setTrashError] = useState<UserFacingError | null>(null);
    const [playingKey, setPlayingKey] = useState<string | null>(null);
    const [target, setTarget] = useState<AudioTrackTarget | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<AudioTrackRenameTarget | null>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    /** A picked folder, awaiting the admin's confirmation. See the panel below. */
    const [selection, setSelection] = useState<FolderSelection | null>(null);
    /** The reading-time measurement that follows an upload — see measureAfterUpload. */
    const [durationCheck, setDurationCheck] = useState<'running' | { failed: string } | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    /** The track whose link the player holds, playing or paused — see stopPlaybackOf. */
    const loadedKeyRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    /** « Remplacer » : the picker for the one new take, and the track it replaces. */
    const replaceInputRef = useRef<HTMLInputElement | null>(null);
    const replaceTargetRef = useRef<Track | null>(null);
    /**
     * The key a « Remplacer » upload is filling, kept for « Renvoyer » : a retry
     * that lost it would be named after the last track — exactly the
     * out-of-order chapter « Remplacer » exists to avoid.
     */
    const replaceKeyRef = useRef<string | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);

    const {
        phase,
        progress,
        error: uploadError,
        folderConflict,
        failedFiles,
        upload,
        reset,
        forgetLandedKey,
    } = useAudioUpload(bookId);
    const zip = useAudioFolderZip();
    /** « Un seul dossier » / « Un dossier par CD » — a choice made at download time, never stored. */
    const [splitByCd, setSplitByCd] = useState(defaultSplitByCd ?? false);
    /** What the archive in progress (or just finished) looks like — said once it is done. */
    const [zipLayout, setZipLayout] = useState<{ numbered: boolean; folders: number; oversized: string[] } | null>(
        null,
    );
    const confirm = useConfirm();

    const notifyError = useCallback(
        (message: string) => {
            toast({
                variant: 'destructive',
                title: "Action impossible",
                description: message
            });
        },
        [toast],
    );

    /** When the links currently in `data` were signed, on this machine's clock. */
    const signedAtRef = useRef(0);

    const readManage = useCallback(async (): Promise<ManageResponse> => {
        const res = await fetch(`/api/books/${bookId}/audio/manage`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw userErrorFromResponse(res, body);
        signedAtRef.current = Date.now();
        return body as ManageResponse;
    }, [bookId]);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        setTrashError(null);
        try {
            const [mData, tRes] = await Promise.all([
                readManage(),
                fetch(`/api/books/${bookId}/audio/trash`),
            ]);
            setData(mData);

            const tData = await tRes.json().catch(() => null);
            if (tRes.ok) {
                setTrash((tData?.items ?? []) as TrashItem[]);
            } else {
                setTrash([]);
                setTrashError(userErrorFromResponse(tRes, tData));
            }
        } catch (e) {
            setLoadError(toUserFacingError(e));
        } finally {
            setLoading(false);
        }
    }, [bookId, readManage]);

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

    const linksExpired = () => linkExpired(signedAtRef.current, data?.expiresIn ?? 3600);

    /**
     * The track with links that still work.
     *
     * The listing's links are signed for an hour. A dialogue left open longer
     * used to answer « Lecture impossible. », or open a storage error page for a
     * download, with nothing saying that « Actualiser » was the way out. So an
     * old link is re-signed first, by re-reading the folder — quietly, without
     * the « Chargement… » that would throw the list and its scroll position away.
     */
    const freshTrack = async (track: Track): Promise<Track | null> => {
        if (!linksExpired()) return track;
        try {
            const d = await readManage();
            setData(d);
            const fresh = d.tracks.find((t) => t.key === track.key) ?? null;
            if (!fresh) notifyError(`« ${track.name} » n’est plus dans le dossier.`);
            return fresh;
        } catch (e) {
            toast(
                apiErrorToast(e, {
                    title: 'Lien expiré',
                    action: `Renouveler les liens audio du livre #${bookId}`,
                }),
            );
            return null;
        }
    };

    const togglePlay = async (track: Track) => {
        const el = audioRef.current;
        if (!el) return;
        if (playingKey === track.key && !el.paused) {
            el.pause();
            setPlayingKey(null);
            return;
        }
        const fresh = await freshTrack(track);
        if (!fresh) return;
        el.src = fresh.url;
        loadedKeyRef.current = fresh.key;
        setPlayingKey(fresh.key);
        // A source that won't load is reported by the player's onError below;
        // only a refusal to start (the browser's autoplay rule) lands here.
        void el.play().catch((e: unknown) => {
            if (e instanceof DOMException && e.name === 'NotAllowedError') notifyError('Lecture impossible.');
        });
    };

    /**
     * Unload the player when the track it holds leaves its key — moved to the
     * corbeille, renamed, replaced. It used to keep playing a link to an object
     * that no longer existed (until the next range request failed, with a
     * « Lecture impossible » about a track nobody was asking for), and its
     * controls could resume it. `null`: whatever it holds.
     */
    const stopPlaybackOf = (key: string | null) => {
        const el = audioRef.current;
        if (!el || !loadedKeyRef.current || (key !== null && key !== loadedKeyRef.current)) return;
        el.pause();
        // No src, then load(): the element empties without firing onError.
        el.removeAttribute('src');
        el.load();
        loadedKeyRef.current = null;
        setPlayingKey(null);
    };

    /** A download link past its hour leads to a storage error page: re-sign it first. */
    const handleDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>, track: Track) => {
        if (!linksExpired()) return;
        e.preventDefault();
        void freshTrack(track).then((fresh) => {
            if (fresh) window.location.assign(fresh.downloadUrl);
        });
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
        replaceKeyRef.current = null;
        setSelection(chosen);
    };

    /**
     * Measure the reading time once an upload is committed.
     *
     * This used to happen inside the commit call, before it refreshed the
     * book: a slow storage moment pushed it past its time limit, and the
     * track count, the status and « Disponible » were never written. Now the
     * commit answers first and this runs after it, through the same route as
     * « Recalculer ». A failure here leaves the upload intact — it is only the
     * figure that waits for the button.
     */
    const measureAfterUpload = useCallback(async () => {
        setDurationCheck('running');
        try {
            // Plusieurs appels pour un gros dossier — voir requestDurationMeasure.
            const answer = await requestDurationMeasure(bookId);
            if (!answer.ok) throw new Error(answer.message);
            // Every track was tried, and some could not be read: the figure
            // stays « Non calculée ». This used to end silently, the dialogue
            // looking exactly as it does after a measurement that worked.
            const unreadable = answer.data.problems.map((p) => p.filename);
            if (answer.data.failed > 0) {
                const n = answer.data.failed;
                setDurationCheck({
                    failed:
                        `${n} piste${n > 1 ? 's' : ''} n’${n > 1 ? 'ont' : 'a'} pas pu être lue${n > 1 ? 's' : ''}` +
                        (unreadable.length ? ` : ${unreadable.map((f) => `« ${f} »`).join(', ')}.` : '.'),
                });
            } else {
                setDurationCheck(null);
            }
            await refreshAll();
        } catch (e) {
            // Shown as the server wrote it: lowercasing a whole message to fit it
            // inside parentheses turned « … mesurées. Réessayez » into « réessayez ».
            setDurationCheck({ failed: e instanceof Error ? e.message : 'La mesure a échoué.' });
        }
    }, [bookId, refreshAll]);

    const handleFilesChosen = async (files: File[]) => {
        if (!files.length) return;
        setSelection(null);
        setDurationCheck(null);
        const { ok, becameAvailable, recovered, repriced, alreadyPresent, committed } =
            await upload(files, replaceKeyRef.current ? { replaceKey: replaceKeyRef.current } : {});
        const added = files.length - alreadyPresent;
        const replacing = replaceKeyRef.current !== null;
        if (ok) {
            replaceKeyRef.current = null;
            toast({
                title: replacing ? 'Piste remplacée' : 'Envoi terminé',
                description: (
                    <span>
                        {replacing
                            ? `La nouvelle version a pris la place de l’ancienne dans l’ordre de lecture. ` +
                              `L’ancienne est dans la corbeille du livre.`
                            : added > 0
                            ? `${added} fichier${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au dossier.`
                            : 'Aucun fichier ajouté.'}
                        {/* Only reachable when the folder changed between the
                            confirmation panel and the send: the panel already
                            leaves out what it can see is there. */}
                        {alreadyPresent > 0 &&
                            ` ${alreadyPresent} ${alreadyPresent > 1 ? 'étaient' : 'était'} déjà dans le dossier ` +
                                `et n’${alreadyPresent > 1 ? 'ont' : 'a'} pas été renvoyé${alreadyPresent > 1 ? 's' : ''}.`}
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
                className: 'bg-green-100 border-green-500 text-green-900',
            });
            reset();
            await refreshAll();
        } else {
            // Counters may still have moved if part of the batch landed.
            await refreshAll();
        }
        // Not awaited: the upload is finished and the dialogue is free again;
        // the figure follows when the measurement does.
        if (committed > 0) void measureAfterUpload();
    };

    /**
     * « Remplacer » : a new take of one track, in that track's place.
     *
     * Deleting the old take and sending the new one used to put the new one at
     * the END of the book — every new file is named after the last track — so a
     * re-recorded chapter 5 played last. Here the server gives the new file the
     * old one's name, after moving the old take to the corbeille (see replaceOne
     * in the upload-url route).
     */
    const handleReplaceChosen = async (file: File | undefined) => {
        const target = replaceTargetRef.current;
        replaceTargetRef.current = null;
        if (!file || !target) return;
        if (!isAllowedAudioExtension(file.name) || isAppleDoubleName(file.name)) {
            notifyError(`« ${file.name} » n’est pas un fichier audio accepté.`);
            return;
        }
        const ok = await confirm({
            title: 'Remplacer cette piste ?',
            description:
                `« ${target.name} » sera remplacée par « ${file.name} » (${formatSize(file.size)}), ` +
                'à la même place dans l’ordre de lecture.\n\n' +
                'L’ancienne version part dans la corbeille du livre, d’où elle peut être restaurée.',
            confirmLabel: 'Remplacer',
        });
        if (!ok) return;
        stopPlaybackOf(target.key);
        reset();
        replaceKeyRef.current = target.key;
        await handleFilesChosen([file]);
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
            if (!res.ok) throw userErrorFromResponse(res, d);
            toast({
                title: "Restauré",
                description: `« ${item.filename} » est de retour dans le dossier.`,
                className: 'bg-green-100 border-green-500 text-green-900',
            });
            await refreshAll();
        } catch (e) {
            toast(
                apiErrorToast(e, {
                    title: 'Restauration impossible',
                    action: `Restaurer « ${item.filename} » depuis la corbeille (livre #${bookId})`,
                }),
            );
            // Issue inconnue : le fichier a pu revenir malgré l'erreur — relire
            // montre l'état réel plutôt que la ligne d'avant.
            if (toUserFacingError(e).kind !== 'known') await refreshAll();
        } finally {
            setRestoringId(null);
        }
    };

    const busy = phase === 'preparing' || phase === 'uploading' || phase === 'finalising';

    /**
     * The picked files the folder already holds (same title, same size), left
     * out of the send. Re-picking a folder used to append a whole second copy
     * after the first — see alreadyUploadedFinder. The upload route applies the
     * same rule, so this is the warning and that is the guard.
     */
    const findAlreadyUploaded = useMemo(() => alreadyUploadedFinder(data?.tracks ?? []), [data]);
    const selectionPresent = useMemo(
        () =>
            (selection?.files ?? []).flatMap((file) => {
                const existingName = findAlreadyUploaded(file);
                return existingName ? [{ file, existingName }] : [];
            }),
        [selection, findAlreadyUploaded],
    );
    const selectionToSend = useMemo(() => {
        const present = new Set(selectionPresent.map((p) => p.file));
        return (selection?.files ?? []).filter((f) => !present.has(f));
    }, [selection, selectionPresent]);
    const selectionToSendBytes = selectionToSend.reduce((sum, f) => sum + f.size, 0);
    const existingTrackCount = data?.tracks.length ?? 0;
    /**
     * Missing files that belong between tracks already online — a re-pick after
     * an interrupted upload. They will play last; see missingInMiddle.
     */
    const selectionMisplaced = useMemo(() => {
        const present = new Map(selectionPresent.map((p) => [p.file, p.existingName]));
        return missingInMiddle(selection?.files ?? [], (f) => present.get(f) ?? null);
    }, [selection, selectionPresent]);
    /**
     * The upload that would leave this folder out of order on a CD — see
     * cdOrderConflict. Said before the send, not prevented: the portal order
     * stays right, and the fix (renaming the tracks already there) is the
     * permanent's to make. 58 live folders were in that position in November 2026.
     */
    const cdConflict = useMemo(
        () =>
            selectionToSend.length && data?.tracks.length
                ? cdOrderConflict(
                      data.tracks.map((t) => t.name),
                      selectionToSend.map((f) => f.name),
                  )
                : null,
        [data, selectionToSend],
    );
    /**
     * The name each file will take in the folder, in send order — shown in the
     * confirmation panel. « dans l’ordre de lecture » used to be all it said:
     * nobody could check, before sending, that « 10 » came after « 9 » or what
     * the files would be called in the folder (and so on a CD).
     */
    const predictedNames = useMemo(
        () =>
            selectionToSend.length
                ? predictUploadNames(
                      (data?.tracks ?? []).map((t) => t.name),
                      selectionToSend.map((f) => f.name),
                  )
                : null,
        [data, selectionToSend],
    );
    /**
     * The recording's length from its tracks, or null while one of them is
     * unmeasured — the same all-or-nothing rule as readingDurationMinutes: a
     * partial sum would understate it.
     */
    const totalSeconds = useMemo(() => {
        if (!data?.tracks.length) return null;
        let sum = 0;
        for (const t of data.tracks) {
            if (t.durationSeconds == null) return null;
            sum += t.durationSeconds;
        }
        return sum;
    }, [data]);
    const activeTrash = trash.filter((t) => !t.restoredAt);
    /**
     * Keys the folder holds today. A corbeille row whose original key is among
     * them cannot come back — the restore refuses to overwrite — and the usual
     * reason is « Remplacer »: the new take took the old one's name. The button
     * used to be offered anyway, and only the refusal said why.
     */
    const liveKeys = useMemo(() => new Set((data?.tracks ?? []).map((t) => t.key)), [data]);
    const playingTrackName = data?.tracks.find((t) => t.key === playingKey)?.name ?? null;
    const zipping = zip.phase === 'running';

    /**
     * The bytes go browser → B2 directly, so leaving the page IS the abort:
     * there is no server-side job to pick the transfer back up. The dialogue is
     * sealed below (no Escape, no click-outside, no close button); this covers
     * the other exits — Précédent through our dialogue, reload and closing the
     * tab through the browser's prompt.
     */
    useWarnIfUnsavedChanges({
        unsaved: busy,
        prompt: {
            title: 'Envoi en cours',
            description:
                'Des fichiers sont en cours d’envoi. Si vous quittez la page, l’envoi sera interrompu ' +
                'et le dossier restera incomplet.',
            confirmLabel: 'Quitter quand même',
            cancelLabel: 'Continuer l’envoi',
        },
    });

    /**
     * Second phase: every byte of the batch sent, storage not done. See
     * CloudFinalisingPanel — and isCloudFinalising for why a single file
     * waiting on the storage is not enough.
     */
    const finalising = useMemo(
        () => isCloudFinalising(phase, progress.map((p) => p.status)),
        [phase, progress],
    );

    /**
     * How the folder would cut into CDs — null when it fits on one, and then the
     * choice is not offered at all. Computed ahead so the option can say how
     * many CDs it means.
     */
    const cdSplit = useMemo(() => {
        if (!data || data.totalBytes <= CD_BURN_CAPACITY_BYTES) return null;
        const split = splitIntoCds(data.tracks.map((t) => t.sizeBytes));
        return split.groups.length > 1 ? split : null;
    }, [data]);

    /**
     * Zip the whole folder. Nobody wants to click Download forty times.
     *
     * The archive is built in the browser from the same presigned URLs the
     * player uses, so the bytes go straight from the bucket — see
     * useAudioFolderZip.
     */
    const handleDownloadFolder = async () => {
        if (!data || !data.tracks.length) return;

        // No streaming sink here: the whole archive has to sit in memory first.
        if (zip.bufferedFallback) {
            const proceed = await confirm({
                title: 'Archive préparée en mémoire',
                description:
                    `Ce navigateur doit préparer l’archive entièrement en mémoire (${formatSize(data.totalBytes)}).\n\n` +
                    'Sur un dossier volumineux, Chrome ou Edge écrivent directement sur le disque et sont préférables.',
                confirmLabel: 'Télécharger quand même',
            });
            if (!proceed) return;
        }

        // Taken now, not read again later: a re-signing an hour into the archive
        // must lay the folder out exactly as the first build did.
        const split = cdSplit !== null && splitByCd;
        const resign = async (): Promise<ZipEntry[]> => {
            const res = await fetch(`/api/books/${bookId}/audio/manage`);
            if (!res.ok) return [];
            return toZipEntries((await res.json()) as ManageResponse, split).entries;
        };

        const { entries, layout } = toZipEntries(data, split);
        setZipLayout({
            numbered: layout.numbered,
            folders: layout.folders,
            oversized: layout.oversized.map((i) => layout.paths[i].split('/').pop() ?? ''),
        });
        void zip.start(entries, safeZipName(`${data.title} - ${data.author}`), resign, layout.playlists);
    };


    /**
     * Closing mid-archive would leave the download running with nothing left to
     * show its progress or stop it — the dialogue owns that state. So make the
     * choice explicit rather than silent.
     *
     * An upload in flight is not offered that choice at all: it cannot be
     * resumed, and a half-written folder is worse than a slow one.
     */
    const handleOpenChange = async (open: boolean) => {
        if (!open && busy) {
            notifyError(
                'Un envoi est en cours. Attendez la fin de la préparation dans le cloud avant de fermer cette fenêtre.',
            );
            return;
        }
        if (!open && zipping) {
            const stop = await confirm({
                title: 'Annuler le téléchargement ?',
                description: 'Une archive est en cours de préparation. La fermeture annulera le téléchargement.',
                confirmLabel: 'Fermer quand même',
                cancelLabel: 'Continuer le téléchargement',
                destructive: true,
            });
            if (!stop) return;
            zip.cancel();
        }
        // The editor is unmounted on close, and the « Renvoyer » list with it:
        // closing used to drop the files that did not make it without a word,
        // leaving a folder with holes that nobody had been told about.
        if (!open && failedFiles.length > 0) {
            const n = failedFiles.length;
            const leave = await confirm({
                title: `${n} fichier${n > 1 ? 's' : ''} non envoyé${n > 1 ? 's' : ''}`,
                description:
                    `${n > 1 ? 'Ces fichiers ne sont' : 'Ce fichier n’est'} pas dans le dossier. En fermant, la liste ` +
                    'des fichiers à renvoyer est perdue.\n\n' +
                    // « Remplacer » has moved the old take out before sending
                    // the new one: its slot may be empty now.
                    (replaceKeyRef.current
                        ? 'Si la piste remplacée ne figure plus dans la liste, l’ancienne version est dans la ' +
                          'corbeille du livre : restaurez-la, puis cliquez de nouveau sur « Remplacer » sur sa ligne.'
                        : 'Pour les envoyer plus tard, choisissez de nouveau le même dossier : les fichiers déjà ' +
                          'en ligne seront écartés d’office.'),
                confirmLabel: 'Fermer quand même',
                cancelLabel: 'Rester',
            });
            if (!leave) return;
        }
        // An unconfirmed folder selection is scoped to the session that picked
        // it — reopening on another book must not inherit it.
        if (!open) {
            setSelection(null);
            replaceKeyRef.current = null;
        }
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
                    className={`max-w-4xl max-h-[88dvh] flex flex-col overflow-hidden bg-card border-border ${
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
                                {/* Le nombre de pistes est sur l'onglet « Pistes (6) », la taille
                                    une seule fois, ici. */}
                                {data.trackCount > 0 && (
                                    <span className="text-sm text-muted-foreground">
                                        {formatSize(data.totalBytes)}
                                        {/* What a burn needs to know first, and what the
                                            demande is billed on (lib/pricing.ts). */}
                                        {' · '}
                                        {cdCount(bytesToKb(data.totalBytes))} CD
                                        {totalSeconds !== null && <> · {formatTotalDuration(totalSeconds)}</>}
                                    </span>
                                )}
                                {/* A track shows « — » and nothing in this dialogue could fix
                                    it: the only « Recalculer » was on the book form. */}
                                {data.trackCount > 0 && totalSeconds === null && (
                                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                        · Durée non calculée
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={busy || durationCheck === 'running'}
                                            onClick={() => void measureAfterUpload()}
                                            className="h-7 bg-field border-border text-foreground hover:bg-muted"
                                        >
                                            <RefreshCw
                                                className={`h-3 w-3 ${durationCheck === 'running' ? 'animate-spin' : ''}`}
                                            />
                                            {durationCheck === 'running' ? 'Mesure…' : 'Recalculer'}
                                        </Button>
                                    </span>
                                )}
                            </div>
                            {/* « Audio disponible » se suffit ; les autres états gardent
                                leur explication (dossier vide, introuvable…). */}
                            {data.status !== AudioLinkStatus.OK && (
                                <p className="text-xs text-muted-foreground">
                                    {getAudioLinkStatusHint(data.status)}
                                </p>
                            )}
                            {data.prefix && (
                                <p className="font-mono text-xs text-muted-foreground break-all">
                                    {data.prefix}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Même principe que MissingDemandeNotice ci-dessous : monté sans condition. */}
                    <InProgressReadingNotice
                        reading={data?.inProgressReading}
                        toFinish={data?.assignmentToFinish}
                        trackCount={data?.trackCount}
                        disabled={busy}
                    />

                    {/* Monté sans condition : c'est le composant qui décide de se
                        taire (compteurs non nuls, ou pas encore chargés). Voir
                        .claude/rules/order-recording-warnings.md — une condition
                        posée ici est une condition qu'un nettoyage emporte. */}
                    <MissingDemandeNotice
                        bookId={bookId}
                        bookTitle={data?.title}
                        orderCount={data?.orderCount}
                        assignmentCount={data?.assignmentCount}
                        disabled={busy}
                        onCreated={() => void refreshAll()}
                    />

                    {/* --- Tabs -------------------------------------------------------- */}
                    <div className="flex-shrink-0 flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant={tab === 'pistes' ? 'default' : 'outline'}
                            size="sm"
                            disabled={busy}
                            onClick={() => setTab('pistes')}
                            aria-pressed={tab === 'pistes'}
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
                            aria-pressed={tab === 'corbeille'}
                            className={tab === 'corbeille' ? '' : 'bg-field border-border text-foreground hover:bg-muted'}
                        >
                            {/* No count before the first read: « (0) » while loading
                                said the corbeille was empty before anyone had looked. */}
                            Corbeille {data ? `(${trashError ? '?' : activeTrash.length})` : ''}
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
                                disabled={busy || zipping}
                                onClick={() => setDeleteAllOpen(true)}
                                className="border-red-500/50 bg-card text-red-600 dark:text-red-400 hover:bg-red-500/10"
                            >
                                <span className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" /> Tout supprimer
                                </span>
                            </Button>
                        )}
                    </div>

                    {/* --- Zip layout ---------------------------------------------------- */}
                    {/* Only for a folder that does not fit one CD. A demande on CD opens
                        on « Un dossier par CD » (defaultSplitByCd); the admin decides. */}
                    {tab === 'pistes' && cdSplit && (
                        <div
                            role="radiogroup"
                            aria-labelledby="zip-layout-label"
                            className="flex flex-shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm"
                        >
                            <span id="zip-layout-label" className="text-muted-foreground">
                                Archive ZIP :
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-foreground">
                                <input
                                    type="radio"
                                    name="zip-layout"
                                    checked={!splitByCd}
                                    disabled={zipping}
                                    onChange={() => setSplitByCd(false)}
                                />
                                Un seul dossier
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-foreground">
                                <input
                                    type="radio"
                                    name="zip-layout"
                                    checked={splitByCd}
                                    disabled={zipping}
                                    onChange={() => setSplitByCd(true)}
                                />
                                Un dossier par CD ({cdSplit.groups.length} CD)
                            </label>
                        </div>
                    )}

                    {/* --- Zip progress ------------------------------------------------ */}
                    {/* Mounted at all times: a live region that appears together with its
                        text is not announced. Says the start and the end, not every file. */}
                    <p className="sr-only" role="status" aria-live="polite">
                        {zipping
                            ? 'Archivage en cours.'
                            : zip.phase === 'done'
                              ? 'Archive téléchargée.'
                              : zip.phase === 'error'
                                ? zip.error
                                : ''}
                    </p>
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
                                    {/* Two fills, one bar: the pale one is what has come
                                        down from le stockage, the green one what is
                                        actually in the archive. Since the tracks are
                                        fetched ahead of the writer (see useAudioFolderZip)
                                        the green bar pauses between files while the
                                        download never does — showing only the green one
                                        would read as a stall. */}
                                    <div
                                        className="relative mt-2 h-1.5 w-full overflow-hidden rounded bg-muted"
                                        role="progressbar"
                                        aria-label="Archivage"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={
                                            zip.total ? Math.min(100, Math.round((zip.written / zip.total) * 100)) : 0
                                        }
                                    >
                                        <div
                                            className="absolute inset-y-0 left-0 bg-green-500/30"
                                            style={{
                                                width: `${zip.total ? Math.min(100, Math.round((zip.fetched / zip.total) * 100)) : 0}%`,
                                            }}
                                        />
                                        <div
                                            className="absolute inset-y-0 left-0 bg-green-500"
                                            style={{
                                                width: `${zip.total ? Math.min(100, Math.round((zip.written / zip.total) * 100)) : 0}%`,
                                            }}
                                        />
                                    </div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        Téléchargé depuis le stockage : {formatSize(zip.fetched)} /{' '}
                                        {formatSize(zip.total)}
                                    </div>
                                </>
                            )}
                            {zip.phase === 'done' && (
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-foreground">
                                        Archive téléchargée.
                                        {zipLayout && zipLayout.folders > 0 &&
                                            ` ${zipLayout.folders} dossiers, un par CD.`}
                                        {zipLayout?.numbered &&
                                            ' Les pistes sont numérotées pour garder l’ordre d’Arbre Rose.'}
                                        {zipLayout && zipLayout.oversized.length > 0 && (
                                            <span className="block">
                                                {zipLayout.oversized.length === 1
                                                    ? `La piste « ${zipLayout.oversized[0]} » dépasse la capacité d’un CD : elle est seule dans son dossier.`
                                                    : `${zipLayout.oversized.length} pistes dépassent la capacité d’un CD (${zipLayout.oversized.map((n) => `« ${n} »`).join(', ')}) : chacune est seule dans son dossier.`}
                                            </span>
                                        )}
                                    </span>
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
                                    <span className="text-red-600 dark:text-red-400">
                                        {zip.error?.replace(/\.\s*$/, '')}. L’archive n’est pas
                                        utilisable : recommencez le téléchargement.
                                    </span>
                                    <span className="flex flex-shrink-0 items-center gap-3">
                                        {/* The links are re-signed on the way (handleDownloadFolder
                                            starts from the listing, and expired ones are
                                            re-signed by the archive itself). */}
                                        <button
                                            type="button"
                                            onClick={() => void handleDownloadFolder()}
                                            className="font-medium text-foreground underline underline-offset-2"
                                        >
                                            Réessayer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={zip.reset}
                                            className="text-muted-foreground underline underline-offset-2"
                                        >
                                            Masquer
                                        </button>
                                    </span>
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
                                <ApiErrorMessage
                                    error={loadError}
                                    action={`Ouvrir l’éditeur audio du livre #${bookId}`}
                                />
                            </div>
                        )}

                        {/* --- Tracks -------------------------------------------------- */}
                        {!loading && !loadError && tab === 'pistes' && data && (
                            <div className="space-y-3">
                                {/* --- Upload ---------------------------------------------- */}
                                {/* Above the list, not below it: on a 228-track book, adding a
                                    chapter meant scrolling past every row (and, with a screen
                                    reader, some 700 buttons) to reach these two. */}
                                <div className="rounded-md border border-dashed border-border p-4">
                                    {/* « Remplacer » : one file, for the track whose button opened it. */}
                                    <input
                                        ref={replaceInputRef}
                                        type="file"
                                        accept="audio/*,.mp3,.m4a,.m4b,.wav,.ogg,.opus,.flac,.aac,.wma,.aiff,.aif"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            void handleReplaceChosen(file);
                                        }}
                                    />
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
                                            500 Mo maximum par fichier. Les sous-dossiers ne sont pas envoyés.
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
                                                {selectionToSend.length > 0 ? (
                                                    <>
                                                        <strong>
                                                            {selectionToSend.length} fichier
                                                            {selectionToSend.length > 1 ? 's' : ''} audio
                                                        </strong>{' '}
                                                        ({formatSize(selectionToSendBytes)}){' '}
                                                        {selectionToSend.length > 1 ? 'seront envoyés' : 'sera envoyé'}{' '}
                                                        dans l’ordre de lecture.
                                                    </>
                                                ) : (
                                                    <strong>
                                                        tous ces fichiers sont déjà dans le dossier, rien à
                                                        envoyer.
                                                    </strong>
                                                )}
                                            </p>

                                            {/* The order and the names, checkable before anything
                                                leaves: the folder's names are what a CD is burned
                                                from, and the number is the place in the book. */}
                                            {selectionToSend.length > 0 && (
                                                <details className="mt-1">
                                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                                        Voir l’ordre d’envoi
                                                        {predictedNames ? ' et les noms dans le dossier' : ''}
                                                    </summary>
                                                    <ol className="mt-1 space-y-0.5">
                                                        {selectionToSend.map((f, i) => (
                                                            <li
                                                                key={f.name}
                                                                className="font-mono text-xs break-all text-muted-foreground"
                                                            >
                                                                <span className="text-foreground">
                                                                    {existingTrackCount + i + 1}.
                                                                </span>{' '}
                                                                {f.name}
                                                                {predictedNames && predictedNames[i] !== f.name && (
                                                                    <> → {predictedNames[i]}</>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </details>
                                            )}

                                            {existingTrackCount > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-amber-700 dark:text-amber-300">
                                                        {selectionToSend.length > 0 &&
                                                            `Ce dossier contient déjà ${existingTrackCount} piste${existingTrackCount > 1 ? 's' : ''} ; ` +
                                                                `les fichiers seront ajoutés après ${existingTrackCount > 1 ? 'elles' : 'elle'}. `}
                                                        {selectionPresent.length > 0 &&
                                                            `${selectionPresent.length} fichier${selectionPresent.length > 1 ? 's' : ''} ` +
                                                                `${selectionPresent.length > 1 ? 'semblent' : 'semble'} déjà présent${selectionPresent.length > 1 ? 's' : ''} ` +
                                                                `(même nom, même taille) et ne ${selectionPresent.length > 1 ? 'seront' : 'sera'} pas ` +
                                                                `renvoyé${selectionPresent.length > 1 ? 's' : ''}. Pour remplacer une piste, ` +
                                                                'utilisez « Remplacer » sur sa ligne.'}
                                                    </p>
                                                    {selectionMisplaced.length > 0 && (
                                                        <div className="mt-1">
                                                            <p className="text-amber-700 dark:text-amber-300">
                                                                {selectionMisplaced.length === 1 ? (
                                                                    <>
                                                                        «{' '}
                                                                        <span className="font-mono break-all">
                                                                            {selectionMisplaced[0].file.name}
                                                                        </span>{' '}
                                                                        » manque au milieu du dossier, avant «{' '}
                                                                        <span className="font-mono break-all">
                                                                            {selectionMisplaced[0].before}
                                                                        </span>{' '}
                                                                        » : il sera ajouté après la dernière piste et joué en
                                                                        dernier. Pour le remettre à sa place, renommez-le après
                                                                        l’envoi.
                                                                    </>
                                                                ) : (
                                                                    `${selectionMisplaced.length} fichiers manquent au milieu du dossier : ` +
                                                                    'ils seront ajoutés après la dernière piste et joués en dernier. ' +
                                                                    'Pour les remettre à leur place, renommez-les après l’envoi.'
                                                                )}
                                                            </p>
                                                            {selectionMisplaced.length > 1 && (
                                                                <details className="mt-1">
                                                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                                                        Voir où ils manquent
                                                                    </summary>
                                                                    <ul className="mt-1 space-y-0.5">
                                                                        {selectionMisplaced.map((m) => (
                                                                            <li
                                                                                key={m.file.name}
                                                                                className="font-mono text-xs break-all text-muted-foreground"
                                                                            >
                                                                                {m.file.name} — avant « {m.before} »
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </details>
                                                            )}
                                                        </div>
                                                    )}
                                                    {cdConflict && (
                                                        <p className="mt-1 text-amber-700 dark:text-amber-300">
                                                            Sur un CD gravé depuis ce dossier, «{' '}
                                                            <span className="font-mono break-all">{cdConflict.newName}</span> »
                                                            passera avant «{' '}
                                                            <span className="font-mono break-all">{cdConflict.playsBefore}</span> » :
                                                            un graveur range les noms caractère par caractère, et après cet envoi
                                                            les numéros de ce dossier n’auront pas tous le même nombre de chiffres.
                                                            {/* Not true when a file is about to land at the end out of
                                                                place — the paragraph above says so. */}
                                                            {selectionMisplaced.length === 0 &&
                                                                ' Dans le portail, l’ordre de lecture reste juste.'}{' '}
                                                            Pour un CD dans l’ordre, renommez les pistes pour que leurs numéros
                                                            aient le même nombre de chiffres (« 01 » plutôt que « 1 »).
                                                        </p>
                                                    )}
                                                    {selectionPresent.length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-xs text-muted-foreground">
                                                                Voir les fichiers déjà présents
                                                            </summary>
                                                            <ul className="mt-1 space-y-0.5">
                                                                {selectionPresent.map((p) => (
                                                                    <li
                                                                        key={p.file.name}
                                                                        className="font-mono text-xs break-all text-muted-foreground"
                                                                    >
                                                                        {p.file.name} — déjà en ligne sous « {p.existingName} »
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </details>
                                                    )}
                                                </div>
                                            )}

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
                                                {selectionToSend.length > 0 && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => void handleFilesChosen(selectionToSend)}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Upload className="h-4 w-4" /> Envoyer{' '}
                                                            {selectionToSend.length} fichier
                                                            {selectionToSend.length > 1 ? 's' : ''}
                                                        </span>
                                                    </Button>
                                                )}
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

                                    {/* The book has no folder and the number the corpus would give it is
                                        already taken — the one case that isn't safe to resolve by itself,
                                        since writing there could land in another book's recordings. */}
                                    {folderConflict && (
                                        <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
                                            <p className="text-foreground">{folderConflict.message}</p>
                                            <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                                                {folderConflict.proposedPrefix}
                                            </p>
                                            <IntentLink
                                                href="/admin/audio-orphelins"
                                                target="_blank"
                                                className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-2"
                                            >
                                                <FolderOpen className="h-4 w-4" /> Ouvrir Audio orphelin
                                            </IntentLink>
                                        </div>
                                    )}

                                    {/* Mounted at all times, like the archive's status above: a
                                        live region that appears together with its text is not
                                        announced, and these are the outcome of an upload — its
                                        failure, or another upload holding the book. */}
                                    <div role="alert">
                                        {uploadError && (
                                            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{uploadError}</p>
                                        )}
                                    </div>
                                    <p className="sr-only" role="status" aria-live="polite">
                                        {busy ? 'Envoi en cours.' : ''}
                                    </p>

                                    <div role="status" aria-live="polite">
                                        {durationCheck === 'running' && (
                                            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Calcul de la durée de lecture…
                                            </p>
                                        )}
                                        {durationCheck && durationCheck !== 'running' && (
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                                                <span>
                                                    Les fichiers sont bien en ligne, mais la durée de lecture n’a pas
                                                    pu être calculée. {durationCheck.failed}
                                                </span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void measureAfterUpload()}
                                                    className="h-7 bg-field border-border text-foreground hover:bg-muted"
                                                >
                                                    <RefreshCw className="h-3 w-3" /> Recalculer la durée
                                                </Button>
                                            </div>
                                        )}
                                    </div>

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
                                                {/* Only true when some of them did land: said after a
                                                    batch that failed whole, it claimed files online
                                                    that were not. */}
                                                {progress.some((p) => p.status === 'terminé')
                                                    ? 'Les autres fichiers sont bien en ligne : ce bouton ne renvoie que ceux qui manquent, sans créer de doublon.'
                                                    : 'Ce bouton les renvoie sans créer de doublon.'}
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
                                                                <span className="text-red-600 dark:text-red-400">
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
                                            {/* Once the upload is over, a failed file is in the
                                                « à renvoyer » panel above with what to do about it;
                                                its row here only repeated it. */}
                                            {(busy ? progress : progress.filter((p) => p.status !== 'échec')).map((p) => (
                                                <div key={p.name} className="text-xs">
                                                    <div className="flex justify-between gap-2">
                                                        <span className="truncate text-foreground">
                                                            {p.assignedName ?? p.name}
                                                        </span>
                                                        <span
                                                            className={
                                                                p.status === 'échec'
                                                                    ? 'text-red-600 dark:text-red-400'
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
                                                                  : p.alreadyPresent
                                                                    ? 'déjà présent, non renvoyé'
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
                                                    <div
                                                        className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted"
                                                        role="progressbar"
                                                        aria-label={`Envoi de ${p.assignedName ?? p.name}`}
                                                        aria-valuemin={0}
                                                        aria-valuemax={100}
                                                        aria-valuenow={p.total ? Math.round((p.loaded / p.total) * 100) : 0}
                                                    >
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
                                                    {p.error && <p className="mt-1 text-red-600 dark:text-red-400">{p.error}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {data.tracks.length === 0 &&
                                    // « Dossier introuvable » just above, then « ce dossier ne
                                    // contient aucun fichier » read as two different diagnoses.
                                    // A folder that is gone is an anomaly (see audio-enums): the
                                    // recording often still exists under another name, and
                                    // sending it again would make a second copy.
                                    (data.status === AudioLinkStatus.FOLDER_MISSING ? (
                                        <p className="text-sm text-muted-foreground">
                                            Aucune piste à cet emplacement. Si l’enregistrement existe sous un
                                            autre nom, rattachez-le depuis{' '}
                                            <IntentLink
                                                href="/admin/audio-orphelins"
                                                target="_blank"
                                                className="font-medium text-primary underline underline-offset-2"
                                            >
                                                Audio orphelin
                                            </IntentLink>{' '}
                                            plutôt que de l’envoyer à nouveau.
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            {data.hasFolder
                                                ? 'Ce dossier ne contient aucun fichier audio.'
                                                : 'Ce livre n’a pas encore de dossier audio. Envoyez un fichier pour en créer un.'}
                                        </p>
                                    ))}

                                {data.tracks.map((t) => (
                                    <div
                                        key={t.key}
                                        // The player sits below the list: the row is where the
                                        // eye is when asking « which one is playing? ».
                                        className={`flex items-center gap-3 rounded-md border p-2 ${
                                            playingKey === t.key
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border bg-field'
                                        }`}
                                    >
                                        <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground">
                                            {t.order}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => void togglePlay(t)}
                                            title={playingKey === t.key ? 'Mettre en pause' : 'Écouter'}
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
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <span>{formatSize(t.sizeBytes)}</span>
                                                <span aria-hidden="true">·</span>
                                                {/* Text for screen readers rather than an aria-label:
                                                    many ignore one on a plain span, and read « tiret ». */}
                                                <span className="font-mono tabular-nums" aria-hidden="true">
                                                    {t.durationSeconds != null
                                                        ? formatDuration(t.durationSeconds)
                                                        : '—'}
                                                </span>
                                                <span className="sr-only">
                                                    {t.durationSeconds != null
                                                        ? `Durée : ${formatDuration(t.durationSeconds)}`
                                                        : 'Durée non mesurée'}
                                                </span>
                                            </div>
                                        </div>
                                        <a
                                            href={t.downloadUrl}
                                            onClick={(e) => handleDownloadClick(e, t)}
                                            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                                            aria-label={`Télécharger ${t.name}`}
                                            title="Télécharger cette piste"
                                        >
                                            <Download className="h-4 w-4" />
                                        </a>
                                        {/* Locked during an archive too: the archive reads the
                                            tracks it listed at the start, and one moved or renamed
                                            meanwhile failed it halfway through. */}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={busy || zipping}
                                            onClick={() => {
                                                replaceTargetRef.current = t;
                                                replaceInputRef.current?.click();
                                            }}
                                            aria-label={`Remplacer ${t.name} par une nouvelle version`}
                                            title="Remplacer par une nouvelle version"
                                            className="h-8 w-8 flex-shrink-0 bg-card border-border text-foreground hover:bg-muted"
                                        >
                                            <Replace className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={busy || zipping}
                                            onClick={() => {
                                                setRenameTarget(t);
                                                setRenameOpen(true);
                                            }}
                                            aria-label={`Renommer ${t.name}`}
                                            title="Renommer (change la place dans l’ordre de lecture)"
                                            className="h-8 w-8 flex-shrink-0 bg-card border-border text-foreground hover:bg-muted"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={busy || zipping}
                                            onClick={() => {
                                                setTarget(t);
                                                setDeleteOpen(true);
                                            }}
                                            aria-label={`Supprimer ${t.name}`}
                                            title="Supprimer (vers la corbeille)"
                                            className="h-8 w-8 flex-shrink-0 border-red-500/50 bg-card text-red-500 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}

                            </div>
                        )}

                        {/* --- Trash --------------------------------------------------- */}
                        {!loading && !loadError && tab === 'corbeille' && (
                            <div className="space-y-2">
                                {trashError && (
                                    <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                            <span className="block font-medium">
                                                La corbeille n’a pas pu être lue — elle n’est pas
                                                forcément vide.
                                            </span>
                                            <ApiErrorMessage
                                                error={trashError}
                                                action={`Lire la corbeille du livre #${bookId}`}
                                            />
                                        </span>
                                    </div>
                                )}
                                {trash.length === 0 && !trashError && (
                                    <p className="text-sm text-muted-foreground">
                                        Aucun fichier supprimé pour ce livre.
                                    </p>
                                )}
                                {trash.map((item) => {
                                    const slotTaken = !item.restoredAt && liveKeys.has(item.originalKey);
                                    return (
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
                                                {!item.restoredAt && (
                                                    <> · {retentionLabel(item)}</>
                                                )}
                                            </div>
                                            {slotTaken && (
                                                <div
                                                    id={`trash-slot-${item.id}`}
                                                    className="mt-1 text-xs text-amber-700 dark:text-amber-300"
                                                >
                                                    Une piste du dossier porte aujourd’hui ce nom — souvent la nouvelle
                                                    version qui l’a remplacée. Pour restaurer celle-ci, renommez ou
                                                    supprimez d’abord la piste actuelle.
                                                </div>
                                            )}
                                        </div>
                                        {item.restoredAt ? (
                                            <span className="text-xs text-muted-foreground">Restauré</span>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void handleRestore(item)}
                                                disabled={restoringId === item.id || slotTaken}
                                                aria-describedby={slotTaken ? `trash-slot-${item.id}` : undefined}
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
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Single shared player: only one track plays at a time. */}
                    <audio
                        ref={audioRef}
                        aria-label={
                            playingTrackName ? `Lecteur audio : ${playingTrackName}` : 'Lecteur audio'
                        }
                        onEnded={() => setPlayingKey(null)}
                        onPause={() => setPlayingKey(null)}
                        // A source the storage refused (a link past its hour, when the
                        // player's own button restarts it) or a format this browser
                        // can't play. « Écouter » re-signs an old link; see freshTrack.
                        onError={() => {
                            setPlayingKey(null);
                            notifyError(
                                'Lecture impossible. Cliquez à nouveau sur « Écouter » ; si l’erreur revient, ' +
                                    'ce format n’est peut-être pas lu par ce navigateur : téléchargez la piste.',
                            );
                        }}
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
                onDeleted={() => {
                    if (target) stopPlaybackOf(target.key);
                    void refreshAll();
                }}
            />

            <DeleteAllAudioTracksModal
                isOpen={deleteAllOpen}
                onOpenChange={setDeleteAllOpen}
                bookId={bookId}
                trackCount={data?.trackCount ?? 0}
                onDeleted={() => {
                    stopPlaybackOf(null);
                    void refreshAll();
                }}
            />

            <RenameAudioTrackModal
                isOpen={renameOpen}
                onOpenChange={setRenameOpen}
                bookId={bookId}
                track={renameTarget}
                folderNames={data?.tracks.map((t) => t.name) ?? []}
                onRenamed={() => {
                    if (renameTarget) {
                        stopPlaybackOf(renameTarget.key);
                        forgetLandedKey(renameTarget.key);
                    }
                    void refreshAll();
                }}
            />
        </>
    );
}
