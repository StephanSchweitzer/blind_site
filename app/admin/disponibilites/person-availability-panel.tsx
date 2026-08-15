'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    BookOpen,
    CalendarOff,
    CheckCircle2,
    CircleOff,
    ExternalLink,
    History,
    Loader2,
    Moon,
    UserMinus,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
    OFFERED_USER_ACTIVITY_STATUSES,
    getUserActivityStatusColor,
    getUserActivityStatusLabel,
    needsActivityStatusConfirmation,
} from '@/lib/user-activity-enums';
import {
    getMemberTypeColor,
    getMemberTypeLabel,
    LANGUAGE_LABELS,
    type Language,
} from '@/lib/user-enums';
import {
    ActivityStatusConfirmDialog,
    ActivityWindowFields,
    useActivityStatusDraft,
} from '@/admin/ActivityStatusFields';
import { ReaderLanguagesField } from '@/admin/ReaderLanguagesField';
import {
    describeUnavailability,
    isEffectivelyActive,
} from '@/lib/users/activityStatus';
import {
    DORMANT_READER_DAYS,
    addDays,
    daysBetween,
    formatDayKey,
} from '@/lib/users/availability';
import type { AvailabilityAssignment, PersonAvailabilityDetail } from '@/types';

/**
 * The person panel of /admin/disponibilites.
 *
 * The screen used to send a permanent off to the dossier to act on what it had
 * just told them — which lost the planning context (the calendar, the free
 * list, the filters) exactly when it was most useful. This panel keeps them on
 * the page: it reads the person's whole availability situation, lists the
 * attributions behind their charge, and writes the change back.
 *
 * It composes the EXISTING endpoints rather than inventing its own:
 *   - POST /api/user/[id]/activity  — status + indisponibilité window (records
 *     an append-only UserActivityEvent, applies the isAvailable sync guard)
 *   - PATCH /api/user/[id]          — the profile flags (prend des attributions,
 *     plafond, spécialisation, notes)
 * so nothing here can drift from the dossier's own status box.
 *
 * LAYOUT — why the status is a full-width band and not a column:
 * changing the status is the ONE thing this panel is opened for, and it used to
 * sit in the left column at the same visual weight as the langues checkboxes
 * and the notes field, with a dropdown you had to open to discover the four
 * choices. It is now a band of its own above the two columns, with every status
 * visible at once and its dates unfolding underneath. What stays in the columns
 * is what you read (attributions, historique) and what you rarely retouch (the
 * lecteur's own settings).
 */

/** Absence presets — the durations an indisponibilité is actually declared in. */
const ABSENCE_PRESETS = [
    { label: '1 semaine', days: 6 },
    { label: '2 semaines', days: 13 },
    { label: '1 mois', days: 30 },
    { label: '3 mois', days: 91 },
] as const;

/**
 * How each status reads on its card. Keyed by status so the cards are built
 * from OFFERED_USER_ACTIVITY_STATUSES itself — a status added to the enum shows
 * up here on its own rather than being silently missing from the picker.
 */
const STATUS_CARD: Record<
    string,
    { icon: React.ComponentType<{ size?: number; className?: string }>; hint: string }
> = {
    ACTIVE: { icon: CheckCircle2, hint: 'Peut recevoir des attributions' },
    UNAVAILABLE: { icon: CalendarOff, hint: 'Absence temporaire, avec dates' },
    RADIATION: { icon: UserMinus, hint: "Ne fait plus partie de l'effectif" },
    DECEASED: { icon: CircleOff, hint: 'Demande une confirmation' },
};

/** Today as 'YYYY-MM-DD' on the local calendar, like ActivityStatusFields. */
function todayInputDay(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getUserActivityStatusColor(status)}`}
        >
            {getUserActivityStatusLabel(status)}
        </span>
    );
}

/** One of the four status cards. */
function StatusCard({
    status,
    selected,
    isCurrent,
    disabled,
    onSelect,
}: {
    status: string;
    selected: boolean;
    isCurrent: boolean;
    disabled: boolean;
    onSelect: (status: string) => void;
}) {
    const Icon = STATUS_CARD[status]?.icon ?? CheckCircle2;
    const hint = STATUS_CARD[status]?.hint ?? '';

    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(status)}
            className={`rounded-lg border p-2.5 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-sm'
                    : 'border-border bg-field hover:border-primary/50 hover:bg-muted'
            }`}
        >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon size={14} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                {getUserActivityStatusLabel(status)}
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                {isCurrent ? 'Statut actuel' : hint}
            </span>
        </button>
    );
}

/** A compact "situation" tile of the strip at the top of the panel. */
function SituationTile({
    icon,
    label,
    value,
    hint,
    tone = 'neutral',
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string | null;
    tone?: 'neutral' | 'warn';
}) {
    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {icon} {label}
            </div>
            <div
                className={`mt-1 text-base font-semibold ${
                    tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                }`}
            >
                {value}
            </div>
            {hint && (
                <p
                    className={`text-[11px] truncate ${
                        tone === 'warn'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                    }`}
                >
                    {hint}
                </p>
            )}
        </div>
    );
}

/** One attribution row: what it is, where it stands, and when it moved. */
function AssignmentRow({ assignment }: { assignment: AvailabilityAssignment }) {
    const dates = [
        assignment.assignedDate ? `attribuée le ${formatDayKey(assignment.assignedDate)}` : null,
        assignment.sentToReaderDate ? `envoyée le ${formatDayKey(assignment.sentToReaderDate)}` : null,
        assignment.returnedToECADate ? `rendue le ${formatDayKey(assignment.returnedToECADate)}` : null,
    ].filter(Boolean);

    return (
        <li
            className={`rounded-md border p-2.5 text-sm ${
                assignment.open
                    ? 'border-border bg-card'
                    : 'border-border/60 bg-muted/30 text-muted-foreground'
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{assignment.bookTitle}</p>
                    {assignment.bookAuthor && (
                        <p className="text-xs text-muted-foreground truncate">{assignment.bookAuthor}</p>
                    )}
                </div>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        assignment.open
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-muted text-muted-foreground'
                    }`}
                >
                    {assignment.statusName}
                </span>
            </div>
            {dates.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{dates.join(' · ')}</p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs">
                {/* New tab: this popup sits on top of in-progress filter/search
                    state on the disponibilités page, and navigating away in the
                    same tab would lose it. The `assignment`/`order` params are
                    the tables' own deep-link params — they open the edit modal
                    directly instead of just landing on the page with a search
                    term typed in. */}
                <Link
                    href={`/admin/assignments?assignment=${assignment.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                >
                    Attribution n°{assignment.id} <ExternalLink size={11} />
                </Link>
                {assignment.orderId && (
                    <Link
                        href={`/admin/orders?order=${assignment.orderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                    >
                        Demande n°{assignment.orderId} <ExternalLink size={11} />
                    </Link>
                )}
            </div>
        </li>
    );
}

export default function PersonAvailabilityPanel({
    personId,
    onClose,
    onSaved,
}: {
    /** Null closes the panel. */
    personId: number | null;
    onClose: () => void;
    /** Called after a successful write, so the page behind can refresh. */
    onSaved: (personId: number) => void;
}) {
    const [detail, setDetail] = useState<PersonAvailabilityDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ── the editable draft ──────────────────────────────────────────────────
    const draft = useActivityStatusDraft();
    const [comment, setComment] = useState('');
    const [isAvailable, setIsAvailable] = useState(true);
    const [notes, setNotes] = useState('');
    const [maxConcurrent, setMaxConcurrent] = useState('');
    const [languages, setLanguages] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const applyDetail = useCallback(
        (data: PersonAvailabilityDetail) => {
            setDetail(data);
            const { person } = data;
            // Prefill with what the person carries today, window included: an
            // indisponibilité is far more often EXTENDED or cut short than
            // replaced, and retyping both dates to move one of them is exactly
            // the friction that sent permanents to the dossier.
            draft.setStatus(person.activityStatus);
            draft.setFrom(person.unavailableFrom ?? todayInputDay());
            draft.setUntil(person.unavailableUntil ?? '');
            setIsAvailable(person.isAvailable);
            setNotes(person.availabilityNotes ?? '');
            setMaxConcurrent(
                person.maxConcurrentAssignments === null ? '' : String(person.maxConcurrentAssignments)
            );
            setLanguages(person.languages);
            setComment('');
            setSaveError(null);
        },
        // draft setters are stable useState setters behind a fresh object each
        // render; depending on the whole draft would re-create this every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const fetchDetail = useCallback(async (id: number): Promise<PersonAvailabilityDetail> => {
        const res = await fetch(`/api/availability/${id}`);
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || 'Chargement impossible');
        }
        return res.json();
    }, []);

    // Opening on somebody else (or closing) resets the panel during render
    // rather than in an effect — same "adjust state when a prop changes"
    // pattern as usePagedRows, and what react-hooks/set-state-in-effect wants.
    const [syncedPersonId, setSyncedPersonId] = useState<number | null>(personId);
    if (personId !== syncedPersonId) {
        setSyncedPersonId(personId);
        // Only on OPEN. Radix keeps the dialog mounted through its exit
        // animation, so wiping the detail on close would blank the panel out
        // mid-fade instead of letting it close on what the user was reading.
        if (personId !== null) {
            setDetail(null);
            setLoadError(null);
            setShowHistory(false);
            setLoading(true);
        }
    }

    useEffect(() => {
        if (personId === null) return;
        let cancelled = false;
        fetchDetail(personId)
            .then((data) => {
                if (!cancelled) applyDetail(data);
            })
            .catch((err: unknown) => {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erreur');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [personId, fetchDetail, applyDetail]);

    const person = detail?.person ?? null;

    // What the chosen status will READ as once saved — a window booked for next
    // month leaves the person active today, so the flags below must not be
    // greyed out for it.
    const willBeActive = isEffectivelyActive({
        activityStatus: draft.status || 'ACTIVE',
        unavailableFrom: draft.from || null,
        unavailableUntil: draft.until || null,
    });

    const statusDirty =
        !!person &&
        (draft.status !== person.activityStatus ||
            (draft.needsWindow &&
                (draft.from !== (person.unavailableFrom ?? '') ||
                    draft.until !== (person.unavailableUntil ?? ''))));

    const languagesDirty =
        !!person &&
        (languages.length !== person.languages.length ||
            [...languages].sort().join() !== [...person.languages].sort().join());

    const profileDirty =
        !!person &&
        (isAvailable !== person.isAvailable ||
            notes !== (person.availabilityNotes ?? '') ||
            languagesDirty ||
            maxConcurrent !==
                (person.maxConcurrentAssignments === null
                    ? ''
                    : String(person.maxConcurrentAssignments)));

    const dirty = statusDirty || profileDirty;

    /** Prefill an indisponibilité starting today for a preset duration. */
    const applyPreset = (days: number) => {
        const from = todayInputDay();
        draft.setStatus('UNAVAILABLE');
        draft.setFrom(from);
        draft.setUntil(addDays(from, days));
    };

    /** The preset the current window matches exactly, if any. */
    const activePreset =
        draft.needsWindow && draft.from === todayInputDay()
            ? ABSENCE_PRESETS.find((p) => draft.until === addDays(draft.from, p.days))?.label ?? null
            : null;

    // Said in full under the dates, because "du 10/08 au 09/09" alone does not
    // tell you how long that is, nor that it closes itself.
    const windowSummary =
        draft.needsWindow && draft.from && draft.until && draft.until >= draft.from
            ? {
                  days: daysBetween(draft.from, draft.until) + 1,
                  startsLater: draft.from > todayInputDay(),
                  backOn: addDays(draft.until, 1),
              }
            : null;

    const save = async () => {
        if (!person || !draft.isComplete) return;
        setPendingStatus(null);
        setSaving(true);
        setSaveError(null);
        try {
            // Status first: it is the write that can force isAvailable off, so
            // the flags below always have the last word on an active person.
            if (statusDirty) {
                const res = await fetch(`/api/user/${person.id}/activity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...draft.payload(), comment }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'Le changement de statut a échoué.');
                }
            }

            if (profileDirty) {
                const res = await fetch(`/api/user/${person.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        // Skipped when the person ends up inactive: the activity
                        // route already cleared the flag, and re-sending `true`
                        // would undo that guard.
                        ...(willBeActive ? { isAvailable } : {}),
                        availabilityNotes: notes,
                        languages,
                        maxConcurrentAssignments: maxConcurrent ? parseInt(maxConcurrent, 10) : null,
                    }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'La mise à jour de la fiche a échoué.');
                }
            }

            toast({
                title: 'Disponibilité enregistrée',
                description: `${person.name} a été mis à jour.`,
            });
            // Re-read rather than patch locally: the activity route can clear
            // isAvailable on its own, and the panel must show what was stored.
            applyDetail(await fetchDetail(person.id));
            onSaved(person.id);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Erreur');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => {
        if (!dirty || !draft.isComplete) return;
        // Décédé asks first, exactly like the dossier's status box.
        if (statusDirty && needsActivityStatusConfirmation(draft.status)) {
            setPendingStatus(draft.status);
            return;
        }
        void save();
    };

    const openAssignments = detail?.assignments.filter((a) => a.open) ?? [];
    const closedAssignments = detail?.assignments.filter((a) => !a.open) ?? [];
    const max = person?.maxConcurrentAssignments ?? 3;
    const saturated = !!person && person.activeAssignments >= max;
    const idleDays =
        person?.lastAssignedAt && detail
            ? daysBetween(person.lastAssignedAt, detail.today)
            : null;
    const windowDetail = person ? describeUnavailability(person) : null;

    // Legacy statuses are never offered again, but the one a person still
    // carries has to stay visible — shown as a locked card rather than dropped.
    const legacyCurrent =
        person &&
        !(OFFERED_USER_ACTIVITY_STATUSES as readonly string[]).includes(person.activityStatus)
            ? person.activityStatus
            : null;

    return (
        <Dialog open={personId !== null} onOpenChange={(open) => !open && onClose()}>
            {/* Three bands, not one scrolling box: the dialog itself no longer
                scrolls (`overflow-y-hidden` replaces the primitive's own
                `overflow-y-auto`), only the middle one does. A `sticky` action
                bar inside a scrolling dialog sticks to the SCROLLPORT, which
                leaves the rest of the form running on underneath and past it —
                which is exactly what it looked like. */}
            <DialogContent className="bg-card border-border max-w-5xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-y-hidden">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2 pr-8">
                        {person?.name ?? 'Disponibilité'}
                        {person && (
                            <>
                                <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getMemberTypeColor(person.memberType)}`}
                                >
                                    {getMemberTypeLabel(person.memberType)}
                                </span>
                                <StatusBadge status={person.effectiveStatus} />
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        {person ? (
                            <>
                                {[person.email, windowDetail].filter(Boolean).join(' — ') ||
                                    'Situation et disponibilité de cette personne.'}
                            </>
                        ) : (
                            'Chargement…'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* the only scrolling band */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                            <Loader2 size={18} className="animate-spin" /> Chargement…
                        </div>
                    )}

                    {loadError && !loading && (
                        <p className="py-8 text-center text-sm text-red-500">{loadError}</p>
                    )}

                    {person && detail && !loading && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                        {/* ── situation en un coup d'œil ──────────────────── */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <SituationTile
                                icon={<BookOpen size={13} />}
                                label="Attributions en cours"
                                value={`${person.activeAssignments} / ${max}`}
                                hint={saturated ? 'Plafond atteint' : null}
                                tone={saturated ? 'warn' : 'neutral'}
                            />
                            <SituationTile
                                icon={<Moon size={13} />}
                                label="Dernière attribution"
                                value={
                                    person.lastAssignedAt
                                        ? formatDayKey(person.lastAssignedAt)
                                        : 'Jamais'
                                }
                                hint={idleDays !== null ? `il y a ${idleDays} jours` : null}
                                tone={
                                    idleDays !== null && idleDays >= DORMANT_READER_DAYS
                                        ? 'warn'
                                        : 'neutral'
                                }
                            />
                            <SituationTile
                                icon={<CalendarOff size={13} />}
                                label="Prend des attributions"
                                value={person.isAvailable ? 'Oui' : 'Non'}
                                hint={
                                    person.languages.length > 0
                                        ? person.languages
                                              .map((l) => LANGUAGE_LABELS[l as Language] ?? l)
                                              .join(', ')
                                        : null
                                }
                            />
                        </div>

                        {/* Away while still holding books — the one combination
                            that always needs a decision, so it is said here too. */}
                        {!isEffectivelyActive(person) && person.activeAssignments > 0 && (
                            <div className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-foreground flex items-start gap-2">
                                <AlertTriangle size={15} className="mt-0.5 text-red-600 dark:text-red-400" />
                                {/* Constat, pas consigne : la page signale la
                                    situation, elle ne dit pas au permanent quoi
                                    faire d'un bénévole. */}
                                <span>
                                    {person.activeAssignments} attribution(s) sont encore chez cette
                                    personne alors qu&apos;elle n&apos;est pas disponible.
                                </span>
                            </div>
                        )}

                        {/* ── the status band: what the panel is opened for ── */}
                        <section className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Statut de disponibilité
                                </h3>
                                {statusDirty && (
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in duration-200">
                                        {getUserActivityStatusLabel(person.activityStatus)}
                                        <ArrowRight size={12} />
                                        <span className="font-medium text-foreground">
                                            {getUserActivityStatusLabel(draft.status)}
                                        </span>
                                    </p>
                                )}
                            </div>

                            <div
                                role="radiogroup"
                                aria-label="Statut de disponibilité"
                                className="grid grid-cols-2 lg:grid-cols-4 gap-2"
                            >
                                {OFFERED_USER_ACTIVITY_STATUSES.map((status) => (
                                    <StatusCard
                                        key={status}
                                        status={status}
                                        selected={draft.status === status}
                                        isCurrent={person.activityStatus === status}
                                        disabled={saving}
                                        onSelect={draft.setStatus}
                                    />
                                ))}
                                {legacyCurrent && (
                                    <StatusCard
                                        status={legacyCurrent}
                                        selected={draft.status === legacyCurrent}
                                        isCurrent
                                        disabled
                                        onSelect={draft.setStatus}
                                    />
                                )}
                            </div>

                            {draft.needsWindow && (
                                <div className="rounded-lg border border-border bg-card p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs text-muted-foreground mr-1">
                                            Durée depuis aujourd&apos;hui :
                                        </span>
                                        {ABSENCE_PRESETS.map((preset) => (
                                            <Button
                                                key={preset.label}
                                                type="button"
                                                variant={
                                                    activePreset === preset.label
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => applyPreset(preset.days)}
                                            >
                                                {preset.label}
                                            </Button>
                                        ))}
                                    </div>

                                    <ActivityWindowFields draft={draft} hint={false} />

                                    {draft.error ? (
                                        <p className="text-sm text-red-500">{draft.error}</p>
                                    ) : (
                                        windowSummary && (
                                            <p className="text-xs text-foreground">
                                                <strong>{windowSummary.days} jours</strong>{' '}
                                                d&apos;indisponibilité.
                                                {windowSummary.startsLater &&
                                                    ` Reste attribuable jusqu'au ${formatDayKey(addDays(draft.from, -1))}.`}{' '}
                                                Retour automatique au statut « Actif » le{' '}
                                                {formatDayKey(windowSummary.backOn)}.
                                            </p>
                                        )
                                    )}
                                </div>
                            )}

                            {statusDirty && (
                                <Textarea
                                    placeholder="Commentaire sur ce changement (optionnel) — il est conservé dans l'historique"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    rows={2}
                                    className="bg-field border-border text-foreground placeholder:text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200"
                                />
                            )}
                        </section>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* ── the lecteur's own settings ─────────────── */}
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Réglages du lecteur
                                </h3>

                                <div className="rounded-md border border-border bg-field/40 p-3 space-y-3">
                                    <label className="flex items-start gap-2 cursor-pointer">
                                        <Checkbox
                                            checked={willBeActive && isAvailable}
                                            disabled={!willBeActive}
                                            onCheckedChange={(checked) => setIsAvailable(checked === true)}
                                            className="mt-0.5"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">
                                                Prend des attributions
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {willBeActive
                                                    ? "Décoché, la personne reste active mais n'apparaît plus dans les sélecteurs de lecteur."
                                                    : 'Un statut non actif retire automatiquement la personne des sélecteurs.'}
                                            </span>
                                        </span>
                                    </label>

                                    {/* Returning from an indisponibilité restores the
                                        status but never the flag — on purpose, it is
                                        not the same decision. Said out loud here, or
                                        the lecteur silently stays out of the pickers. */}
                                    {willBeActive && !isAvailable && (
                                        <p className="rounded border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300 animate-in fade-in duration-200">
                                            Actif mais hors des sélecteurs : cochez la case pour le
                                            rendre à nouveau attribuable.
                                        </p>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="dispo-max"
                                                className="text-xs font-medium text-foreground"
                                            >
                                                Attributions simultanées max
                                            </label>
                                            <Input
                                                id="dispo-max"
                                                type="number"
                                                min={0}
                                                value={maxConcurrent}
                                                onChange={(e) => setMaxConcurrent(e.target.value)}
                                                placeholder="3 par défaut"
                                                className="bg-field border-border text-foreground"
                                            />
                                        </div>
                                        <div className="space-y-1 sm:col-span-2">
                                            <label className="text-xs font-medium text-foreground">
                                                Langues
                                            </label>
                                            <ReaderLanguagesField
                                                value={languages}
                                                onChange={setLanguages}
                                                currentValue={person.languages}
                                                labelClassName="text-xs text-foreground"
                                                gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label
                                            htmlFor="dispo-notes"
                                            className="text-xs font-medium text-foreground"
                                        >
                                            Notes de disponibilité
                                        </label>
                                        <Textarea
                                            id="dispo-notes"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={2}
                                            placeholder="Ex. ne lit que le matin, pas de livres longs…"
                                            className="bg-field border-border text-foreground placeholder:text-muted-foreground"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* ── attributions ───────────────────────────── */}
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Attributions
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        ({openAssignments.length} en cours)
                                    </span>
                                </h3>

                                {openAssignments.length === 0 ? (
                                    <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                                        Aucune attribution en cours.
                                        {person.memberType === 'lecteur' &&
                                            ' Ce lecteur peut recevoir un livre dès maintenant.'}
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {openAssignments.map((assignment) => (
                                            <AssignmentRow key={assignment.id} assignment={assignment} />
                                        ))}
                                    </ul>
                                )}

                                {closedAssignments.length > 0 && (
                                    <details className="group">
                                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                            {closedAssignments.length} attribution(s) terminée(s)
                                        </summary>
                                        <ul className="space-y-2 mt-2">
                                            {closedAssignments.map((assignment) => (
                                                <AssignmentRow key={assignment.id} assignment={assignment} />
                                            ))}
                                        </ul>
                                    </details>
                                )}

                                {/* ── history ────────────────────────────── */}
                                <div className="border-t border-border pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowHistory((v) => !v)}
                                        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:underline"
                                    >
                                        <History size={14} />
                                        Historique de statut
                                        <span className="text-xs font-normal text-muted-foreground">
                                            ({detail.events.length})
                                        </span>
                                    </button>

                                    {showHistory && (
                                        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                            {detail.events.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Aucun changement de statut enregistré.
                                                </p>
                                            ) : (
                                                <ol className="space-y-2">
                                                    {detail.events.map((event) => (
                                                        <li
                                                            key={event.id}
                                                            className="rounded border border-border bg-card p-2 text-xs"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-medium text-foreground">
                                                                    {event.fromStatus
                                                                        ? `${getUserActivityStatusLabel(event.fromStatus)} → ${getUserActivityStatusLabel(event.toStatus)}`
                                                                        : getUserActivityStatusLabel(event.toStatus)}
                                                                </span>
                                                                <span className="text-muted-foreground whitespace-nowrap">
                                                                    {new Date(event.changedAt).toLocaleDateString(
                                                                        'fr-FR',
                                                                        {
                                                                            day: '2-digit',
                                                                            month: 'short',
                                                                            year: 'numeric',
                                                                        }
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {event.unavailableFrom && (
                                                                <p className="mt-0.5 text-foreground">
                                                                    Du {formatDayKey(event.unavailableFrom)}
                                                                    {event.unavailableUntil
                                                                        ? ` au ${formatDayKey(event.unavailableUntil)}`
                                                                        : ''}
                                                                </p>
                                                            )}
                                                            {event.reason && (
                                                                <p className="mt-0.5 text-foreground">
                                                                    Motif : {event.reason}
                                                                </p>
                                                            )}
                                                            {event.comment && (
                                                                <p className="mt-0.5 text-muted-foreground">
                                                                    {event.comment}
                                                                </p>
                                                            )}
                                                            <p className="mt-0.5 text-muted-foreground">
                                                                Par {event.changedBy ?? 'Système'}
                                                            </p>
                                                        </li>
                                                    ))}
                                                </ol>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                            {saveError && (
                                <p className="text-sm text-red-500">{saveError}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* the action bar — a band of the dialog, never part of what
                    scrolls, so nothing can run past it */}
                {person && detail && !loading && (
                    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-6 py-3">
                        <div className="flex items-center gap-3">
                            <Link
                                href={`/admin/users/dossier/${person.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                            >
                                Ouvrir le dossier complet <ExternalLink size={11} />
                            </Link>
                            {dirty && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 animate-in fade-in duration-200">
                                    Modifications non enregistrées
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => applyDetail(detail)}
                                disabled={!dirty || saving}
                            >
                                Réinitialiser
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSave}
                                disabled={!dirty || !draft.isComplete || saving}
                            >
                                {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
                                Enregistrer
                            </Button>
                        </div>
                    </div>
                )}

                <ActivityStatusConfirmDialog
                    status={pendingStatus}
                    personName={person?.name}
                    onConfirm={() => void save()}
                    onCancel={() => setPendingStatus(null)}
                />
            </DialogContent>
        </Dialog>
    );
}
