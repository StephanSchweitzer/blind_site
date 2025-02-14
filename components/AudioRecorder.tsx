// components/AudioRecorder.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Trash2, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AudioRecorderProps {
    onConfirm: (blob: Blob) => void;
    onClear: () => void;
}

interface AudioSegment {
    blob: Blob;
    url: string;
    duration: number;
    isConfirmed?: boolean;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onConfirm, onClear }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [segments, setSegments] = useState<AudioSegment[]>([]);
    const [recordingTime, setRecordingTime] = useState(0);
    const [error, setError] = useState<string>('');
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        audioContextRef.current = new AudioContext();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            segments.forEach(segment => URL.revokeObjectURL(segment.url));
            if (finalAudioUrl) URL.revokeObjectURL(finalAudioUrl);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, [finalAudioUrl, segments]);

    const startRecording = async () => {
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
                const duration = recordingTime;

                setSegments(prev => [...prev, { blob, url, duration }]);
                setRecordingTime(0);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setError('Could not access microphone. Please check permissions.');
        }
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
            setSegments([{ blob: finalBlob, url, duration: 0, isConfirmed: true }]);

            onConfirm(finalBlob);
            setIsConfirmed(true);
        } catch (err) {
            console.error('Error merging audio:', err);
            setError('Failed to merge audio segments');
        }
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

    return (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!isConfirmed && (
                <>
                    <div className="flex items-center gap-4">
                        {!isRecording ? (
                            <Button
                                type="button"
                                onClick={startRecording}
                                className="bg-red-500 hover:bg-red-600"
                            >
                                <Mic className="w-4 h-4 mr-2" />
                                {segments.length > 0 ? 'Continuer l\'enregistrement' : 'Démarrer l\'enregistrement'}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={stopRecording}
                                variant="destructive"
                            >
                                <Square className="w-4 h-4 mr-2" />
                                Arrêter l&apos;enregistrement
                            </Button>
                        )}
                        {isRecording && (
                            <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                        )}
                    </div>

                    {segments.length > 0 && (
                        <div className="space-y-4">
                            {segments.map((segment, index) => (
                                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                                    <audio src={segment.url} controls className="flex-grow" />
                                    {!segment.isConfirmed && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => removeSegment(index)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {segment.isConfirmed && (
                                        <span className="text-sm text-green-600 font-medium">Enregistrement précédent</span>
                                    )}
                                </div>
                            ))}

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    onClick={handleConfirm}
                                    className="flex-grow"
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Confirmer l&apos;enregistrement
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDiscard}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Jeter tout
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {isConfirmed && finalAudioUrl && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-green-600">Enregistrement confirmé</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsConfirmed(false)}
                        >
                            Modifier l&apos;enregistrement
                        </Button>
                    </div>
                    <audio src={finalAudioUrl} controls className="w-full" />
                </div>
            )}
        </div>
    );
};

export default AudioRecorder;