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
    Download,
    FolderPlus,
    Loader2,
    Pause,
    Play,
    RotateCcw,
    Trash2,
    Upload,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAudioUpload } from '@/hooks/useAudioUpload';
import {
    getAudioLinkStatusColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
    type AudioLinkStatus,
} from '@/lib/audio-enums';
import { DeleteAudioTrackModal, type AudioTrackTarget } from '@/admin/DeleteAudioTrackModal';

interface Track {
    order: number;
    key: string;
    name: string;
    sizeBytes: number;
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
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const { phase, progress, error: uploadError, needsFolder, upload, reset } = useAudioUpload(bookId);

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

    const handleFilesChosen = async (files: File[], createFolder = false) => {
        if (!files.length) return;
        setPendingFiles(files);
        const ok = await upload(files, createFolder);
        if (ok) {
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Envoi terminé</span>,
                description: (
                    <span className="text-xl mt-2">
                        {files.length} fichier{files.length > 1 ? 's' : ''} ajouté
                        {files.length > 1 ? 's' : ''} au dossier.
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

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl max-h-[88dvh] flex flex-col overflow-hidden bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="text-foreground">
                            Fichiers audio {data ? `— ${data.title}` : ''}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {data?.author}
                        </DialogDescription>
                    </DialogHeader>

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
                            onClick={() => setTab('pistes')}
                            className={tab === 'pistes' ? '' : 'bg-field border-border text-foreground hover:bg-muted'}
                        >
                            Pistes {data ? `(${data.trackCount})` : ''}
                        </Button>
                        <Button
                            type="button"
                            variant={tab === 'corbeille' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTab('corbeille')}
                            className={tab === 'corbeille' ? '' : 'bg-field border-border text-foreground hover:bg-muted'}
                        >
                            Corbeille ({activeTrash.length})
                        </Button>
                    </div>

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
                                            void handleFilesChosen(files);
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
                                                    {phase === 'finalising' ? 'Vérification…' : 'Envoi…'}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    <Upload className="h-4 w-4" /> Ajouter des fichiers
                                                </span>
                                            )}
                                        </Button>
                                        <span className="text-xs text-muted-foreground">
                                            Les fichiers sont envoyés directement au stockage. 500 Mo maximum par
                                            fichier.
                                        </span>
                                    </div>

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
                                                                    : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {p.status}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                                                        <div
                                                            className={`h-full ${p.status === 'échec' ? 'bg-red-500' : 'bg-green-500'}`}
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
                                            </div>
                                        </div>
                                        {item.restoredAt ? (
                                            <span className="text-xs text-muted-foreground">Restauré</span>
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
        </>
    );
}
