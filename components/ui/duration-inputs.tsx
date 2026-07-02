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
    handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const DurationInputs: React.FC<DurationInputsProps> = ({ formData, handleChange }) => {
    // Convert to number for calculations, handling undefined case
    const totalMinutes = formData.readingDurationMinutes !== undefined
        ? (typeof formData.readingDurationMinutes === 'string'
            ? parseInt(formData.readingDurationMinutes) || 0
            : formData.readingDurationMinutes || 0)
        : 0;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numberValue = parseInt(value) || 0;

        let newTotalMinutes: number;
        if (name === 'hours') {
            newTotalMinutes = (numberValue * 60) + (minutes);
        } else { // minutes
            newTotalMinutes = (hours * 60) + numberValue;
        }

        // Create a synthetic event that matches the expected React.ChangeEvent type
        const syntheticEvent = {
            ...e,
            target: {
                ...e.target,
                name: 'readingDurationMinutes',
                value: newTotalMinutes.toString() // Convert to string to match form field type
            }
        };

        handleChange(syntheticEvent as React.ChangeEvent<HTMLInputElement>);
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
                Durée de la lecture
            </label>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="hours" className="block text-sm text-muted-foreground">
                        Heures
                    </label>
                    <input
                        type="number"
                        name="hours"
                        id="hours"
                        value={hours === 0 ? '' : hours}
                        onChange={handleDurationChange}
                        min="0"
                        className="w-full bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                        placeholder="Heures"
                    />
                </div>
                <div className="flex-1">
                    <label htmlFor="minutes" className="block text-sm text-muted-foreground">
                        Minutes
                    </label>
                    <input
                        type="number"
                        name="minutes"
                        id="minutes"
                        value={minutes === 0 ? '' : minutes}
                        onChange={handleDurationChange}
                        min="0"
                        max="59"
                        className="w-full bg-field border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                        placeholder="Minutes"
                    />
                </div>
            </div>
        </div>
    );
};

export default DurationInputs;