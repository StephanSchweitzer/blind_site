'use client';

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { getLanguageLabel, LANGUAGE_VALUES } from '@/lib/user-enums';
import { withCurrentValues } from '@/lib/select-options';

/**
 * The reader-languages checkbox grid — one shared implementation so the
 * dossier form (UserFormBackendBase) and the /admin/disponibilites availability
 * popup (PersonAvailabilityPanel) can't drift apart on this again. A retired
 * language already recorded on the reader keeps its box (via withCurrentValues)
 * so it stays visible and isn't dropped by a replace-all save — unchecking it
 * is the only way to remove it.
 */
export function ReaderLanguagesField({
    value,
    onChange,
    currentValue,
    labelClassName = 'text-sm text-foreground',
    gridClassName = 'grid grid-cols-2 sm:grid-cols-3 gap-2',
}: {
    value: string[];
    onChange: (languages: string[]) => void;
    /** The reader's currently stored languages, to keep retired values visible. Defaults to `value`. */
    currentValue?: readonly string[];
    labelClassName?: string;
    gridClassName?: string;
}) {
    return (
        <div className={gridClassName}>
            {withCurrentValues(LANGUAGE_VALUES, currentValue ?? value).map((lang) => (
                <label key={lang} className={`flex items-center gap-2 ${labelClassName}`}>
                    <Checkbox
                        checked={value.includes(lang)}
                        onCheckedChange={(checked) =>
                            onChange(
                                checked === true
                                    ? [...value, lang]
                                    : value.filter((l) => l !== lang)
                            )
                        }
                        className="border-border data-[state=checked]:bg-primary"
                    />
                    {getLanguageLabel(lang)}
                </label>
            ))}
        </div>
    );
}
