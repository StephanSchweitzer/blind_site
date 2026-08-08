'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    OFFERED_USER_ACTIVITY_STATUSES,
    getUserActivityStatusLabel,
    isDatedActivityStatus,
} from '@/lib/user-activity-enums';
import { withCurrentValue } from '@/lib/select-options';

/**
 * The one place a status change is composed, shared by the profile's
 * "Changer le statut" box and the reactivation dialog of the order/attribution
 * forms — so both offer the same four statuses, ask for the same dates, and
 * ask the same confirmation.
 */

/** Local Date -> 'YYYY-MM-DD' (calendar days are local, never UTC-shifted). */
function toInputDay(date: Date | null): string {
    if (!date) return '';
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/** 'YYYY-MM-DD' -> local Date, for the calendar's selected day. */
function fromInputDay(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

export interface ActivityStatusDraft {
    status: string;
    setStatus: (status: string) => void;
    from: string;
    setFrom: (day: string) => void;
    until: string;
    setUntil: (day: string) => void;
    /** Does the chosen status carry a start/end window? */
    needsWindow: boolean;
    /** Blocking problem with the window, if any. */
    error: string | null;
    /** Ready to be submitted (a status is chosen and its window is valid). */
    isComplete: boolean;
    /** Body to POST to /api/user/[id]/activity. */
    payload: () => Record<string, unknown>;
    reset: (status?: string) => void;
}

/**
 * State for one status change. The start date defaults to today and may be
 * pushed into the future — the change is recorded immediately either way, and
 * the effective status flips on its own when the window opens.
 */
export function useActivityStatusDraft(initial?: {
    status?: string;
    from?: string | null;
    until?: string | null;
}): ActivityStatusDraft {
    const today = toInputDay(new Date());
    const [status, setStatus] = useState(initial?.status ?? '');
    const [from, setFrom] = useState(initial?.from || today);
    const [until, setUntil] = useState(initial?.until || '');

    const needsWindow = isDatedActivityStatus(status);

    const error = useMemo(() => {
        if (!needsWindow) return null;
        if (!from || !until) return 'Indiquez une date de début et une date de fin.';
        if (until < from) return 'La date de fin doit être postérieure à la date de début.';
        return null;
    }, [needsWindow, from, until]);

    const reset = useCallback(
        (next = '') => {
            setStatus(next);
            setFrom(toInputDay(new Date()));
            setUntil('');
        },
        []
    );

    const payload = useCallback(
        () => ({
            toStatus: status,
            ...(isDatedActivityStatus(status)
                ? { unavailableFrom: from, unavailableUntil: until }
                : {}),
        }),
        [status, from, until]
    );

    return {
        status,
        setStatus,
        from,
        setFrom,
        until,
        setUntil,
        needsWindow,
        error,
        isComplete: !!status && !error,
        payload,
        reset,
    };
}

function DayField({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (day: string) => void;
    placeholder: string;
}) {
    const selected = fromInputDay(value);
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">{label}</label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left bg-field border-border text-foreground hover:bg-muted"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selected ? (
                            format(selected, 'PPP', { locale: fr })
                        ) : (
                            <span className="text-muted-foreground">{placeholder}</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                    <Calendar
                        mode="single"
                        selected={selected ?? undefined}
                        defaultMonth={selected ?? undefined}
                        onSelect={(d) => onChange(toInputDay(d ?? null))}
                        locale={fr}
                        initialFocus
                        className="bg-card text-foreground"
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

/**
 * The Du/Au pair an indisponibilité carries, on its own. Exported because
 * /admin/disponibilites composes the same window under its own status control
 * (a segmented one, since choosing a status IS what that screen is for) and
 * must not grow a second copy of the date handling.
 */
export function ActivityWindowFields({
    draft,
    hint = true,
}: {
    draft: ActivityStatusDraft;
    /** Set false when the surrounding form already explains the window. */
    hint?: boolean;
}) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <DayField
                    label="Du"
                    value={draft.from}
                    onChange={draft.setFrom}
                    placeholder="Date de début"
                />
                <DayField
                    label="Au"
                    value={draft.until}
                    onChange={draft.setUntil}
                    placeholder="Date de fin"
                />
            </div>
            {hint && (
                <p className="text-xs text-muted-foreground">
                    La personne redevient automatiquement active après cette date. Une date
                    de début future est possible : elle reste active jusque-là.
                </p>
            )}
        </div>
    );
}

/**
 * Status select + the unavailability window it requires. `currentStatus` keeps
 * a person's own status visible even when it is a legacy one no longer
 * offered; `lockCurrent` additionally greys it out (nothing to change).
 */
export function ActivityStatusFields({
    draft,
    currentStatus,
    lockCurrent = false,
    placeholder = 'Nouveau statut',
    triggerClassName = 'bg-card border-border text-foreground',
}: {
    draft: ActivityStatusDraft;
    currentStatus?: string | null;
    lockCurrent?: boolean;
    placeholder?: string;
    triggerClassName?: string;
}) {
    return (
        <div className="space-y-2">
            <Select value={draft.status} onValueChange={draft.setStatus}>
                <SelectTrigger className={triggerClassName}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                    {/* Retired statuses are never offered, but the one a person
                        still carries stays listed rather than vanishing. */}
                    {withCurrentValue(OFFERED_USER_ACTIVITY_STATUSES, currentStatus).map((s) => (
                        <SelectItem
                            key={s}
                            value={s}
                            className="text-foreground"
                            disabled={
                                lockCurrent
                                    ? s === currentStatus
                                    : !(OFFERED_USER_ACTIVITY_STATUSES as readonly string[]).includes(s)
                            }
                        >
                            {getUserActivityStatusLabel(s)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {draft.needsWindow && (
                <div className="rounded-md border border-border bg-field/40 p-2">
                    <ActivityWindowFields draft={draft} />
                </div>
            )}

            {draft.error && <p className="text-sm text-red-500">{draft.error}</p>}
        </div>
    );
}

/**
 * Confirmation asked before applying a grave status (DECEASED). It is a
 * confirmation, not a lock: the status stays reversible afterwards.
 */
export function ActivityStatusConfirmDialog({
    status,
    personName,
    onConfirm,
    onCancel,
}: {
    status: string | null;
    personName?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!status) return null;
    const label = getUserActivityStatusLabel(status);

    return (
        <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
            <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">
                        Confirmer le statut « {label} »
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {personName ? <strong>{personName}</strong> : 'Cette personne'} sera
                        enregistrée comme « {label} » et ne pourra plus recevoir de nouvelles
                        attributions. Le statut reste modifiable ensuite si c&apos;est une erreur.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Confirmer</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
