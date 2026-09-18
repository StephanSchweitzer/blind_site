// components/AudioRecorder.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Trash2, Check, CheckCircle2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface AudioRecorderProps {
    onConfirm: (blob: Blob) => void;
    onClear: () => void;
    /** Le titre de l'état vide — « Nouvelle présentation audio » quand on remplace. */
    idleTitle?: string;
    className?: string;
}

interface AudioSegment {
    blob: Blob;
    url: string;
    duration: number;
    isConfirmed?: boolean;
}

// Kept in sync with app/api/upload-audio/route.ts's own MAX_BYTES so a
// too-large file is rejected here instead of after a slow upload.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const AudioRecorder: React.FC<AudioRecorderProps> = ({
    onConfirm,
    onClear,
    idleTitle = 'Aucune présentation audio',
    className,
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [segments, setSegments] = useState<AudioSegment[]>([]);
    const [recordingTime, setRecordingTime] = useState(0);
    const [error, setError] = useState<string>('');
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);
    // Only affects wording in the confirmed panel (imported file vs merged
    // recording) — both are handed to onConfirm the same way.
    const [source, setSource] = useState<'recording' | 'import' | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    // The take's length is measured from its start, not read from
    // `recordingTime`: `onstop` is created with the state of the click that
    // started the take, where the counter is still 0 — every take was saved
    // as lasting 0 seconds.
    const startedAtRef = useRef(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // The object URLs still alive, revoked on unmount only. The cleanup used to
    // depend on `segments`, so it ran on every change and revoked the URLs of
    // the takes still on screen: recording a second take broke the first one's
    // player.
    const liveUrlsRef = useRef<{ segments: AudioSegment[]; finalAudioUrl: string | null }>({ segments: [], finalAudioUrl: null });
    useEffect(() => {
        liveUrlsRef.current = { segments, finalAudioUrl };
    }, [segments, finalAudioUrl]);

    useEffect(() => {
        audioContextRef.current = new AudioContext();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
            const live = liveUrlsRef.current;
            live.segments.forEach(segment => URL.revokeObjectURL(segment.url));
            if (live.finalAudioUrl) URL.revokeObjectURL(live.finalAudioUrl);
            audioContextRef.current?.close();
        };
    }, []);

    /** Resolves false when the mic could not be opened (error already shown). */
    const startRecording = async (): Promise<boolean> => {
        try {
            setError('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                const duration = Math.round((Date.now() - startedAtRef.current) / 1000);

                setSegments(prev => [...prev, { blob, url, duration }]);
                setRecordingTime(0);
            };

            mediaRecorderRef.current.start();
            startedAtRef.current = Date.now();
            setRecordingTime(0);
            setIsRecording(true);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setError("Impossible d'accéder au micro. Vérifiez que le navigateur est autorisé à l'utiliser.");
            return false;
        }
    };

    /**
     * « Ajouter une prise au micro » on an imported file: reopen the takes
     * list with the file as its first entry and start recording straight
     * away, so the admin doesn't have to find « Continuer l'enregistrement »
     * first. If the mic can't be opened, the file stays confirmed as it was.
     */
    const addTakeAfterImport = async () => {
        setIsConfirmed(false);
        if (!(await startRecording())) setIsConfirmed(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const mergeAudioBuffers = async (audioBuffers: AudioBuffer[]): Promise<AudioBuffer> => {
        const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
        const context = audioContextRef.current!;
        const mergedBuffer = context.createBuffer(
            1,
            totalLength,
            audioBuffers[0].sampleRate
        );

        let offset = 0;
        for (const buffer of audioBuffers) {
            mergedBuffer.copyToChannel(buffer.getChannelData(0), 0, offset);
            offset += buffer.length;
        }

        return mergedBuffer;
    };

    const handleConfirm = async () => {
        if (segments.length === 0) return;

        try {
            const audioBuffers = await Promise.all(
                segments.map(async segment => {
                    const arrayBuffer = await segment.blob.arrayBuffer();
                    return audioContextRef.current!.decodeAudioData(arrayBuffer);
                })
            );

            const mergedBuffer = await mergeAudioBuffers(audioBuffers);
            const mergedWav = bufferToWav(mergedBuffer);
            const finalBlob = new Blob([mergedWav], { type: 'audio/wav' });

            if (finalAudioUrl) URL.revokeObjectURL(finalAudioUrl);
            const url = URL.createObjectURL(finalBlob);
            setFinalAudioUrl(url);

            // Keep only the merged recording
            segments.forEach(segment => {
                if (!segment.isConfirmed) URL.revokeObjectURL(segment.url);
            });

            // Set the merged recording as the only confirmed segment
            setSegments([{ blob: finalBlob, url, duration: Math.round(mergedBuffer.duration), isConfirmed: true }]);

            onConfirm(finalBlob);
            setSource('recording');
            setIsConfirmed(true);
        } catch (err) {
            console.error('Error merging audio:', err);
            setError("Échec de l'assemblage des prises. Réessayez, ou jetez-les et recommencez.");
        }
    };

    /**
     * A file picked from disk is treated exactly like the result of
     * `handleConfirm`: it becomes the one confirmed segment and is handed
     * straight to `onConfirm`, with no re-encoding — unlike a recording,
     * which is always merged down to WAV, an imported file keeps whatever
     * format (mp3, m4a, wav…) the admin produced it in. « Remplacer le
     * fichier » comes back here through the same hidden input. It can still
     * be extended afterwards: « Ajouter une prise au micro » records a mic
     * segment behind it, and « Confirmer l'enregistrement » merges both
     * through the same WAV path as any other multi-segment recording.
     */
    const handleFileSelected = (file: File) => {
        setError('');

        if (!file.type.startsWith('audio/')) {
            setError('Le fichier doit être un fichier audio.');
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setError('Fichier trop volumineux (max 25 Mo).');
            return;
        }

        if (finalAudioUrl) URL.revokeObjectURL(finalAudioUrl);
        const url = URL.createObjectURL(file);
        setFinalAudioUrl(url);
        setSegments([{ blob: file, url, duration: 0, isConfirmed: true }]);

        onConfirm(file);
        setSource('import');
        setIsConfirmed(true);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset so picking the same file again still fires onChange.
        e.target.value = '';
        if (file) handleFileSelected(file);
    };

    // WAV conversion utilities remain the same
    const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
        const numChannels = 1;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const dataLength = buffer.length * numChannels * (bitDepth / 8);
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const wav = new ArrayBuffer(totalLength);
        const view = new DataView(wav);

        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
        view.setUint16(32, numChannels * (bitDepth / 8), true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        // Write audio data
        const data = buffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < data.length; i++) {
            const sample = Math.max(-1, Math.min(1, data[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }

        return wav;
    };

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    const handleDiscard = () => {
        segments.forEach(segment => URL.revokeObjectURL(segment.url));
        setSegments([]);
        if (finalAudioUrl) {
            URL.revokeObjectURL(finalAudioUrl);
            setFinalAudioUrl(null);
        }
        setIsConfirmed(false);
        setSource(null);
        onClear();
    };

    const removeSegment = (index: number) => {
        const segment = segments[index];
        if (!segment.isConfirmed) {  // Don't allow removing the confirmed segment
            URL.revokeObjectURL(segment.url);
            setSegments(prev => prev.filter((_, i) => i !== index));
        }
    };

    const formatTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const fileInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileInputChange}
        />
    );

    const isIdle = !isConfirmed && !isRecording && segments.length === 0;

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            {/* Mounted in every state: « Importer un fichier » (idle) and
                « Remplacer le fichier » (imported) both open it. */}
            {fileInput}

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* ── rien encore : les deux façons de commencer ─────────── */}
            {isIdle && (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        <Mic className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">{idleTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Enregistrez-la au micro, ou importez un fichier déjà prêt (25 Mo maximum).
                        </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button type="button" onClick={startRecording} className="bg-red-600 text-white hover:bg-red-700">
                            <Mic /> Démarrer l&apos;enregistrement
                        </Button>
                        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                            <Upload /> Importer un fichier
                        </Button>
                    </div>
                </div>
            )}

            {/* ── prise en cours ──────────────────────────────────────── */}
            {isRecording && (
                <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
                    role="status"
                >
                    <div className="flex items-center gap-3">
                        <span className="relative flex h-3 w-3" aria-hidden="true">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                        </span>
                        <div>
                            <div className="text-xs font-medium text-red-700 dark:text-red-400">
                                Enregistrement en cours
                                {segments.length > 0 && ` · prise ${segments.filter(s => !s.isConfirmed).length + 1}`}
                            </div>
                            <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                                {formatTime(recordingTime)}
                            </div>
                        </div>
                    </div>
                    <Button type="button" onClick={stopRecording} variant="destructive">
                        <Square className="fill-current" /> Arrêter l&apos;enregistrement
                    </Button>
                </div>
            )}

            {/* ── les prises, avant assemblage ────────────────────────── */}
            {!isConfirmed && segments.length > 0 && (
                <>
                    <ol className="space-y-2">
                        {segments.map((segment, index) => {
                            const label = segment.isConfirmed
                                ? source === 'import' ? 'Fichier importé' : 'Enregistrement précédent'
                                : `Prise ${segments.slice(0, index + 1).filter(s => !s.isConfirmed).length}`;
                            return (
                                <li key={segment.url} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 py-1.5 pl-3 pr-1.5">
                                    <div className="w-20 shrink-0 leading-tight">
                                        <div className="text-xs font-medium text-foreground">{label}</div>
                                        {segment.duration > 0 && (
                                            <div className="text-xs tabular-nums text-muted-foreground">{formatTime(segment.duration)}</div>
                                        )}
                                    </div>
                                    <audio src={segment.url} controls className="h-9 min-w-0 flex-1" />
                                    {segment.isConfirmed ? (
                                        <span className="w-8 shrink-0" aria-hidden="true" />
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                            onClick={() => removeSegment(index)}
                                            disabled={isRecording}
                                            title="Supprimer cette prise"
                                            aria-label={`Supprimer ${label.toLowerCase()}`}
                                        >
                                            <Trash2 />
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    {!isRecording && (
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={handleConfirm}>
                                <Check /> Confirmer l&apos;enregistrement
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                                <Mic /> Continuer l&apos;enregistrement
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                onClick={handleDiscard}
                            >
                                <Trash2 /> Jeter tout
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* ── prêt à être envoyé ──────────────────────────────────── */}
            {isConfirmed && finalAudioUrl && (
                <div className="flex flex-1 flex-col justify-center gap-3 rounded-lg border border-green-600/30 bg-green-500/5 p-4">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {source === 'import' ? 'Fichier importé' : 'Enregistrement confirmé'}
                    </span>
                    <audio src={finalAudioUrl} controls className="w-full" />
                    <div className="flex flex-wrap gap-2">
                        {source === 'import' ? (
                            <>
                                {/* Straight to the file picker; cancelling it keeps the current file. */}
                                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                    <Upload /> Remplacer le fichier
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={addTakeAfterImport}>
                                    <Mic /> Ajouter une prise au micro
                                </Button>
                            </>
                        ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirmed(false)}>
                                Modifier l&apos;enregistrement
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Il sera envoyé avec la liste, lorsque vous l&apos;enregistrerez.
                    </p>
                </div>
            )}
        </div>
    );
};

export default AudioRecorder;
