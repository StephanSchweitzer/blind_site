// DurationInputs.tsx
import React from 'react';

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
}

/**
 * Read-only display: the duration is derived from the book's audio tracks
 * (see refreshBookAudioState) once every track's length is known, and
 * overwritten automatically from then on — an editable field here would just
 * get silently reverted on the next upload. Before any audio exists, this
 * still shows whatever handleBookSelect prefilled from a catalogue search.
 */
const DurationInputs: React.FC<DurationInputsProps> = ({ formData }) => {
    const totalMinutes = formData.readingDurationMinutes ?? 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
                Durée de la lecture
            </label>
            <p className="text-foreground">
                {totalMinutes > 0
                    ? `${hours} h ${minutes.toString().padStart(2, '0')}`
                    : 'Non calculée'}
            </p>
            <p className="text-xs text-muted-foreground">
                Calculée automatiquement à partir des fichiers audio du livre.
            </p>
        </div>
    );
};

export default DurationInputs;
