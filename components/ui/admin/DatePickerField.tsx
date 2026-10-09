'use client';

import React, { useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Minuit local, comme toutes les dates que produit le calendrier. */
export function todayLocal(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Date locale -> 'YYYY-MM-DD'. Les champs « jour » se gardent en chaîne et ne
 * passent jamais par toISOString(), qui ramènerait minuit local en UTC et
 * décalerait le jour (un jour choisi à Paris, UTC+2, tomberait la veille).
 */
export function toDayString(date: Date | null | undefined): string {
    if (!date) return '';
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/** 'YYYY-MM-DD' (ou un ISO complet hydraté) -> minuit local, pour le calendrier. */
export function fromDayString(value: string | null | undefined): Date | null {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

const SIDE_BUTTON_CLASS =
    'shrink-0 -ml-px rounded-l-none bg-muted text-muted-foreground hover:text-foreground focus-visible:z-10';

/**
 * Le sélecteur de date de l'administration. « Aujourd'hui » est soudé au champ
 * (une seule commande, pas deux) : le cas courant — la date est celle du jour —
 * reste à un clic. Il disparaît quand la date est déjà celle du jour.
 *
 * `clearable` remplace « Aujourd'hui » par « Effacer » dès qu'une date est
 * saisie, pour un champ facultatif qu'on doit pouvoir vider sans connaître le
 * geste caché du calendrier (recliquer le jour choisi).
 *
 * `onChange(null)` arrive aussi quand on reclique le jour choisi : un champ
 * obligatoire l'ignore de son côté.
 */
export function DatePickerField({
    value,
    onChange,
    placeholder = 'Sélectionner une date',
    disabled = false,
    clearable = false,
    triggerRef,
    id,
    className,
}: {
    value: Date | null | undefined;
    onChange: (date: Date | null) => void;
    /** Ce qu'affiche le champ vide — un texte, ou la date qui vaudra par défaut. */
    placeholder?: React.ReactNode;
    disabled?: boolean;
    clearable?: boolean;
    triggerRef?: React.Ref<HTMLButtonElement>;
    /** Pour un <label htmlFor> extérieur. */
    id?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const date = value ?? undefined;
    const showClear = clearable && !!date;
    const showToday = !showClear && !(date && isSameDay(date, new Date()));

    return (
        <div className={cn('flex items-stretch', className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        ref={triggerRef}
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        className={cn(
                            'min-w-0 flex-1 justify-start text-left font-normal bg-field border-border text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed',
                            (showToday || showClear) && 'rounded-r-none'
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        {date ? (
                            <span className="truncate">{format(date, 'PPP', { locale: fr })}</span>
                        ) : (
                            <span className="truncate text-muted-foreground">{placeholder}</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                    <Calendar
                        mode="single"
                        selected={date}
                        defaultMonth={date}
                        onSelect={(d) => {
                            onChange(d ?? null);
                            setOpen(false);
                        }}
                        initialFocus
                        className="bg-card text-foreground"
                    />
                </PopoverContent>
            </Popover>
            {showClear ? (
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onChange(null)}
                    className={SIDE_BUTTON_CLASS}
                >
                    Effacer
                </Button>
            ) : showToday && (
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onChange(todayLocal())}
                    className={SIDE_BUTTON_CLASS}
                >
                    Aujourd&apos;hui
                </Button>
            )}
        </div>
    );
}
