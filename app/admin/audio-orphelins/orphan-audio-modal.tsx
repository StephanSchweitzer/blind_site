'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, Loader2, Pause, Play } from 'lucide-react';
import { formatBytes } from './format';

interface Track {
    order: number;
    key: string;
    name: string;
    sizeBytes: number;
    url: string;
    downloadUrl: string;
}

interface TracksResponse {
    orphanId: number;
    prefix: string;
    title: string;
    folderNum: number | null;
    trackCount: number;
    totalBytes: number;
    tracks: Track[];
}

interface Props {
    orphanId: number | null;
    onOpenChange: (open: boolean) => void;
}

/**
 * Files that are not recordings.
 *
 * A Mac writing to the NAS leaves a zero-byte AppleDouble `._name` beside every
 * file, and a later bulk rename prefixed the whole folder, so they show up as
 * `1000 ._01 titre.mp3` rather than at the start of the name — matching on `._`
 * alone would miss them. Size is the reliable half of the test: a 0-byte audio
 * file is never a track.
 *
 * They carry the .mp3 extension, so the sync job counts them, and that is what
 * makes a duplicated 14-track folder announce itself as 28 pistes — reading as
 * *fuller* than the live folder it copies.
 */
const isSidecar = (t: { name: string; sizeBytes: number }) =>
    t.sizeBytes === 0 || /(^|\s)\._/.test(t.name);

/**
 * Listen to an orphaned folder before deciding what it is.
 *
 * Read-only on purpose: uploading or deleting belongs to a book's audio manager,
 * and until this folder has a book there is nothing to manage it from.
 */
export function OrphanAudioModal({ orphanId, onOpenChange }: Props) {
    const [data, setData] = useState<TracksResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playingKey, setPlayingKey] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const load = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        setData(null);
        try {
            const res = await fetch(`/api/audio-orphans/${id}/tracks`);
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.message || 'Chargement impossible');
            setData(body as TracksResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur inattendue');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch once per folder. Tracked in a ref rather than state: this is
    // bookkeeping about whether a fetch was kicked off, not something rendered,
    // and setting state here trips react-hooks/set-state-in-effect.
    const loadedForRef = useRef<number | null>(null);
    useEffect(() => {
        if (orphanId != null && loadedForRef.current !== orphanId) {
            loadedForRef.current = orphanId;
            void load(orphanId);
        } else if (orphanId == null) {
            loadedForRef.current = null;
            audioRef.current?.pause();
        }
    }, [orphanId, load]);

    const togglePlay = (track: Track) => {
        const el = audioRef.current;
        if (!el) return;
        if (playingKey === track.key && !el.paused) {
            el.pause();
            setPlayingKey(null);
            return;
        }
        el.src = track.url;
        void el.play().catch(() => setError('Lecture impossible.'));
        setPlayingKey(track.key);
    };

    const sidecars = data?.tracks.filter(isSidecar).length ?? 0;

    return (
        <Dialog open={orphanId != null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[88dvh] flex flex-col overflow-hidden bg-card border-border [&>button>svg]:text-white">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="text-foreground">
                        Écouter le dossier {data ? `— ${data.title}` : ''}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground break-all font-mono text-xs">
                        {data?.prefix}
                    </DialogDescription>
                </DialogHeader>

                {data && (
                    <div className="flex-shrink-0 space-y-2 border-b border-border pb-3 text-sm text-muted-foreground">
                        <p>
                            {data.trackCount} fichier{data.trackCount > 1 ? 's' : ''} ·{' '}
                            {formatBytes(data.totalBytes)}
                        </p>
                        {sidecars > 0 && (
                            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>
                                    {sidecars} fichier{sidecars > 1 ? 's' : ''} de 0 octet (résidus
                                    macOS « ._ ») : ce ne sont pas des pistes. Le dossier contient
                                    en réalité {data.trackCount - sidecars} piste
                                    {data.trackCount - sidecars > 1 ? 's' : ''}.
                                </span>
                            </p>
                        )}
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-3">
                    {loading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                        </div>
                    )}

                    {error && !loading && (
                        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {!loading && !error && data?.tracks.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            Ce dossier ne contient aucun fichier audio.
                        </p>
                    )}

                    <div className="space-y-2">
                        {data?.tracks.map((t) => (
                            <div
                                key={t.key}
                                className={`flex items-center gap-3 rounded-md border border-border p-2 ${
                                    isSidecar(t) ? 'bg-muted/40 opacity-60' : 'bg-field'
                                }`}
                            >
                                <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground">
                                    {t.order}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => togglePlay(t)}
                                    disabled={isSidecar(t)}
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
                                        {formatBytes(t.sizeBytes)}
                                    </div>
                                </div>
                                <a
                                    href={t.downloadUrl}
                                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                                    aria-label={`Télécharger ${t.name}`}
                                >
                                    <Download className="h-4 w-4" />
                                </a>
                            </div>
                        ))}
                    </div>
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
    );
}
