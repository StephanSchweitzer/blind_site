// DurationInputs.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export interface FormData {
    title: string;
    author: string;
    publisher: string | undefined;
    publishedYear: string;
    genres: string[] | { genre: { id: number; name: string; description?: string; } }[];
    isbn?: string | undefined;
    description?: string | undefined;
    available: boolean;
    readingDurationMinutes?: number | undefined;
}

export interface DurationInputsProps {
    formData: FormData;
    /** Present only when the book exists — a new book has no folder to measure. */
    bookId?: number;
    /** Hand the freshly measured value back to the form's state. */
    onMeasured?: (readingDurationMinutes: number | null) => void;
}

interface Problem {
    filename: string;
    problem: string | null;
}

/**
 * Read-only display with a « Recalculer » action.
 *
 * The field stays locked because the duration is a fact about the audio files,
 * not an opinion: it is derived from them and overwritten from them, so a typed
 * value would either be reverted on the next upload or — worse, if it were
 * protected from that — quietly outlive the recording it describes while being
 * printed in the Coup de cœur PDF and shown in the public catalogue.
 *
 * The button exists because "derived" used to mean "derived from an upload made
 * through this portal", which no imported book ever had. It measures the files
 * where they sit, so a permanent no longer has to download a recording and send
 * it back up purely to make the number appear.
 *
 * A failure names the files that could not be read, because that is the only
 * part anybody can act on — and an unreadable track is worth knowing about for
 * its own sake.
 */
const DurationInputs: React.FC<DurationInputsProps> = ({ formData, bookId, onMeasured }) => {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [problems, setProblems] = useState<Problem[]>([]);

    const totalMinutes = formData.readingDurationMinutes ?? 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const recalculate = async () => {
        if (!bookId) return;
        setBusy(true);
        setMessage(null);
        setProblems([]);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/duration`, { method: 'POST' });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMessage(data?.message ?? 'La mesure a échoué.');
                return;
            }

            setProblems(data?.problems ?? []);
            onMeasured?.(data?.readingDurationMinutes ?? null);

            if (data?.readingDurationMinutes != null) {
                setMessage(
                    `${data.measured} piste${data.measured > 1 ? 's' : ''} mesurée${
                        data.measured > 1 ? 's' : ''
                    }.`,
                );
            } else {
                setMessage(
                    `Durée non calculée : ${data?.failed ?? 0} piste(s) illisible(s) sur ` +
                        `${(data?.measured ?? 0) + (data?.failed ?? 0)}. La durée n’est écrite ` +
                        'que si toutes les pistes ont pu être mesurées.',
                );
            }
        } catch {
            setMessage('Le serveur est injoignable.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
                Durée de la lecture
            </label>
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-foreground">
                    {totalMinutes > 0
                        ? `${hours} h ${minutes.toString().padStart(2, '0')}`
                        : 'Non calculée'}
                </p>
                {bookId != null && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={recalculate}
                        title="Relire les fichiers audio du livre et recalculer la durée"
                    >
                        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                        {busy ? 'Mesure en cours…' : 'Recalculer'}
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Calculée automatiquement à partir des fichiers audio du livre.
            </p>
            {message && <p className="text-xs text-foreground">{message}</p>}
            {problems.length > 0 && (
                <div className="rounded-md border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-2 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Pistes non mesurables
                    </div>
                    <ul className="mt-1 space-y-0.5">
                        {problems.map((p) => (
                            <li key={p.filename}>
                                {p.filename}
                                {p.problem ? ` — ${p.problem}` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default DurationInputs;
