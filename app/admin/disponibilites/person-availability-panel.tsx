'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import {
    AlertTriangle,
    ArrowRight,
    BookOpen,
    CalendarClock,
    CalendarOff,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleOff,
    ExternalLink,
    History,
    Loader2,
    Pencil,
    SlidersHorizontal,
    UserMinus,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
    OFFERED_USER_ACTIVITY_STATUSES,
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
import { CopyableId } from '@/admin/CopyableId';
import { isEffectivelyActive } from '@/lib/users/activityStatus';
import {
    DORMANT_READER_DAYS,
    addDays,
    daysBetween,
    formatDayKey,
} from '@/lib/users/availability';
import type { AvailabilityAssignment, PersonAvailabilityDetail } from '@/types';
import { parisDate } from '@/lib/paris-day';

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
 * LAYOUT — one column, each fact said once:
 * the panel used to open on three summary tiles, a status band, then two
 * columns — and said the same things several times over (the load in a tile,
 * in the attributions heading and in the plafond field; « prend des
 * attributions » in a tile, a checkbox and a warning). Worst of all, a person
 * already indisponible opened with the whole date editor unfolded, presets and
 * all, before anything was being changed — and those are precisely the people
 * the panel is opened for, usually with books still out.
 *
 * So, top to bottom, in the order the questions are asked:
 *   1. the header line — load, last attribution, email;
 *   2. « Disponibilité » — the status, its window AS A SENTENCE until you ask
 *      to change it, and the « prend des attributions » switch, which answers
 *      the same question (can this person get a book?) and carries its own
 *      warning instead of a separate banner;
 *   3. the open attributions, as rows rather than cards;
 *   4. the lecteur's settings and the history, folded — read on their summary
 *      line, unfolded only to edit. The notes stay readable folded: they are
 *      what you check before handing someone a book.
 */

/**
 * A preset's length. Months are CALENDAR months, not 30 days: « +1 mois » on
 * an absence ending the 28/10 is expected to end the 28/11, not the 27/11.
 */
type Span = { days: number } | { months: number };

/**
 * Durations a NEW indisponibilité is declared in, counted from today. The
 * person is back on the same weekday / the same day of the month — so the
 * last day away is the day before.
 */
const ABSENCE_PRESETS: { label: string; span: Span }[] = [
    { label: '1 semaine', span: { days: 7 } },
    { label: '2 semaines', span: { days: 14 } },
    { label: '1 mois', span: { months: 1 } },
    { label: '3 mois', span: { months: 3 } },
];

/**
 * How far an EXISTING indisponibilité is pushed back. An absence already under
 * way is far more often extended than replaced, and "from today" presets would
 * silently move its start date.
 */
const EXTEND_PRESETS: { label: string; span: Span }[] = [
    { label: '+1 semaine', span: { days: 7 } },
    { label: '+2 semaines', span: { days: 14 } },
    { label: '+1 mois', span: { months: 1 } },
];

/**
 * 'YYYY-MM-DD' moved by whole calendar months, through UTC like the rest of
 * the day arithmetic. A day the target month lacks is clamped to its last
 * day: 31/01 + 1 mois → 28/02 (or 29/02), never 03/03.
 */
function addMonths(key: string, months: number): string {
    const [year, month, day] = key.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
    ).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
}

function shift(key: string, span: Span): string {
    return 'months' in span ? addMonths(key, span.months) : addDays(key, span.days);
}

/** Last day away for an absence of `span` starting on `from`. */
function absenceUntil(from: string, span: Span): string {
    return addDays(shift(from, span), -1);
}

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

/** One of the four status choices. */
function StatusCard({
    status,
    selected,
    isCurrent,
    disabled,
    tabbable,
    onSelect,
}: {
    status: string;
    selected: boolean;
    isCurrent: boolean;
    disabled: boolean;
    /** The group's single Tab stop (roving tabindex). */
    tabbable: boolean;
    onSelect: (status: string) => void;
}) {
    const Icon = STATUS_CARD[status]?.icon ?? CheckCircle2;
    const hint = STATUS_CARD[status]?.hint ?? '';

    // One line per choice. The two-line hints under all four cards were eight
    // lines of small print on every opening, for labels that explain
    // themselves; the hint stays as the tooltip.
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={tabbable ? 0 : -1}
            data-status={status}
            title={hint}
            onClick={() => onSelect(status)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border bg-field hover:border-primary/50 hover:bg-muted'
            }`}
        >
            <Icon size={14} className={selected ? 'text-primary' : 'text-muted-foreground'} />
            {getUserActivityStatusLabel(status)}
            {/* A dot, not a word: the « Actif → Indisponible » line above
                spells it out as soon as anything changes. */}
            {isCurrent && (
                <>
                    <span
                        aria-hidden="true"
                        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
                    />
                    <span className="sr-only">(statut actuel)</span>
                </>
            )}
        </button>
    );
}

/**
 * Secondary text inside the panel. In the back office's dark theme
 * `muted-foreground` sits at 72 % lightness — nearly as bright as the body
 * text — so every summary line read as loud as a heading and the panel
 * turned into one block of white. Dimmed a step there (still above 6:1 on
 * the card); the light theme already had the contrast step.
 */
const META = 'text-muted-foreground dark:text-muted-foreground/80';

/** Warning tone. Amber-400 glares on the night blue; a touch of alpha calms it. */
const AMBER = 'text-amber-600 dark:text-amber-400/90';

/**
 * A folded section of the right-hand column: a card whose heading row
 * carries its own summary, so the panel reads without unfolding anything.
 * Unfolded only to edit or to dig. Every section is the same card with the
 * same heading, so they read as separate blocks rather than one long list.
 */
function FoldSection({
    icon: Icon,
    title,
    summary,
    open,
    onToggle,
    children,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    title: string;
    summary?: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    const contentId = useId();
    return (
        <section className="rounded-xl border border-border bg-muted/30 dark:bg-muted/40">
            <h3>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={contentId}
                    onClick={onToggle}
                    className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{title}</span>
                        {summary && !open && (
                            <span className={`mt-0.5 block text-xs ${META}`}>{summary}</span>
                        )}
                    </span>
                    <ChevronDown
                        size={16}
                        className={`mt-0.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
                            open ? 'rotate-180' : ''
                        }`}
                    />
                </button>
            </h3>
            {/* `hidden` rather than unmounted, so `aria-controls` always
                points at something. */}
            <div
                id={contentId}
                hidden={!open}
                className="border-t border-border px-4 pb-4 pt-3 animate-in fade-in duration-200"
            >
                {children}
            </div>
        </section>
    );
}

/** The day an attribution last moved, worded — the full dates live on its own page. */
function lastMove(assignment: AvailabilityAssignment): string | null {
    if (assignment.returnedToECADate) return `rendue le ${formatDayKey(assignment.returnedToECADate)}`;
    if (assignment.sentToReaderDate) return `envoyée le ${formatDayKey(assignment.sentToReaderDate)}`;
    if (assignment.assignedDate) return `attribuée le ${formatDayKey(assignment.assignedDate)}`;
    return null;
}

/**
 * An open attribution out this long is flagged on its row. Same six months as
 * the « lecteur inactif » threshold (DORMANT_READER_DAYS), but its own
 * constant: one is about a book that has not come back, the other about a
 * reader who has not been given one, and they need not move together.
 */
const LONG_OUT_DAYS = 180;

/** One attribution row: what it is, where it stands, and when it last moved. */
function AssignmentRow({
    assignment,
    today,
}: {
    assignment: AvailabilityAssignment;
    /** The French calendar day the panel was read on. */
    today: string;
}) {
    const moved = lastMove(assignment);
    // Counted from when the book left (sent, else handed over). The date alone,
    // in amber — no « depuis plus de N ans »: the permanents asked for it
    // gone, the wording read as a reproach and the date already says it.
    const outSince = assignment.sentToReaderDate ?? assignment.assignedDate;
    const outDays =
        assignment.open && !assignment.returnedToECADate && outSince
            ? daysBetween(outSince, today)
            : null;
    const longOut = outDays !== null && outDays >= LONG_OUT_DAYS;

    return (
        <li className={`py-2 text-sm ${assignment.open ? '' : META}`}>
            {/* New tab: this popup sits on top of in-progress filter/search
                state on the disponibilités page, and navigating away in the
                same tab would lose it. The `assignment`/`order` params are
                the tables' own deep-link params — they open the edit modal
                directly instead of just landing on the page with a search
                term typed in. */}
            <IntentLink
                href={`/admin/assignments?assignment=${assignment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-baseline gap-1.5 min-w-0"
                title={`Ouvrir l'attribution n°${assignment.id}`}
            >
                <span
                    className={`truncate font-medium group-hover:underline ${
                        assignment.open ? 'text-foreground' : META
                    }`}
                >
                    {assignment.bookTitle}
                </span>
                <ExternalLink size={11} className="shrink-0 text-muted-foreground" />
            </IntentLink>
            <p className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs ${META}`}>
                {[assignment.bookAuthor, assignment.statusName, longOut ? null : moved]
                    .filter(Boolean)
                    .join(' · ')}
                {longOut && (
                    <>
                        <span aria-hidden="true">·</span>
                        <span className={`font-medium ${AMBER}`}>
                            {moved}
                        </span>
                    </>
                )}
                {assignment.orderId && (
                    <>
                        <span aria-hidden="true">·</span>
                        <IntentLink
                            href={`/admin/orders?order=${assignment.orderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground hover:underline"
                        >
                            Demande n°{assignment.orderId}
                        </IntentLink>
                    </>
                )}
            </p>
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

    // ── what is unfolded ────────────────────────────────────────────────────
    const [editingWindow, setEditingWindow] = useState(false);
    const [showComment, setShowComment] = useState(false);
    const [showAssignments, setShowAssignments] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showClosed, setShowClosed] = useState(false);
    /** "Missing date" is only an error once Enregistrer has been tried. */
    const [showErrors, setShowErrors] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

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
            setEditingWindow(false);
            setShowComment(false);
            setShowErrors(false);
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
            setShowAssignments(false);
            setShowSettings(false);
            setShowHistory(false);
            setShowClosed(false);
            setConfirmDiscard(false);
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
    // month leaves the person active today, so the switch must not be greyed
    // out for it.
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

    // The window the person ALREADY carries, kept as a sentence until someone
    // asks to change it: opening on an indisponible person is the common case,
    // and an unfolded editor there is a form nobody asked for.
    const changingStatus = !!person && draft.status !== person.activityStatus;
    const hasStoredWindow = !!person?.unavailableFrom && !!person?.unavailableUntil;
    const showWindowEditor =
        draft.needsWindow && (changingStatus || editingWindow || !hasStoredWindow);

    /** Prefill an indisponibilité starting today for a preset duration. */
    const applyPreset = (span: Span) => {
        const from = todayInputDay();
        draft.setStatus('UNAVAILABLE');
        draft.setFrom(from);
        draft.setUntil(absenceUntil(from, span));
    };

    /** The preset the current window matches exactly, if any. */
    const activePreset =
        draft.needsWindow && draft.from === todayInputDay()
            ? ABSENCE_PRESETS.find((p) => draft.until === absenceUntil(draft.from, p.span))?.label ?? null
            : null;

    const storedUntil = person?.unavailableUntil ?? null;
    const activeExtension =
        storedUntil && draft.from === person?.unavailableFrom
            ? EXTEND_PRESETS.find((p) => draft.until === shift(storedUntil, p.span))?.label ?? null
            : null;

    /** Put the stored window back and fold the editor again. */
    const cancelWindowEdit = () => {
        if (!person) return;
        draft.setFrom(person.unavailableFrom ?? todayInputDay());
        draft.setUntil(person.unavailableUntil ?? '');
        setEditingWindow(false);
    };

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

    // A half-typed window is not an error yet; an inverted one already is.
    const windowError =
        draft.error && (showErrors || (draft.from && draft.until)) ? draft.error : null;

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
                description: person.name,
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
        if (!dirty) return;
        // Enabled even when the window is incomplete, so the click can say
        // WHY rather than leaving a greyed-out button to puzzle over.
        if (!draft.isComplete) {
            setShowErrors(true);
            return;
        }
        // Décédé asks first, exactly like the dossier's status box.
        if (statusDirty && needsActivityStatusConfirmation(draft.status)) {
            setPendingStatus(draft.status);
            return;
        }
        void save();
    };

    // ── the status picker as a real radio group ─────────────────────────────
    // One Tab stop for the whole group, arrows to move — the ARIA radio
    // pattern, and what a screen-reader user expects of « 4 choix ». Without
    // it, Tab walked through every card and the arrows did nothing.
    const statusGroupRef = useRef<HTMLDivElement>(null);
    const offeredStatuses = OFFERED_USER_ACTIVITY_STATUSES as readonly string[];
    // A legacy status is a disabled card, which cannot take focus: the Tab
    // stop then falls on the first offered status.
    const tabStopStatus = offeredStatuses.includes(draft.status) ? draft.status : offeredStatuses[0];

    const handleStatusKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (saving) return;
        const index = offeredStatuses.indexOf(tabStopStatus);
        const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        let next: string | undefined;
        if (e.key in step) {
            next = offeredStatuses[(index + step[e.key] + offeredStatuses.length) % offeredStatuses.length];
        } else if (e.key === 'Home') {
            next = offeredStatuses[0];
        } else if (e.key === 'End') {
            next = offeredStatuses[offeredStatuses.length - 1];
        }
        if (!next) return;
        e.preventDefault();
        // Selection follows focus, as in a native radio group.
        draft.setStatus(next);
        statusGroupRef.current
            ?.querySelector<HTMLButtonElement>(`[data-status="${next}"]`)
            ?.focus();
    };

    // Closing used to drop unsaved changes without a word.
    const requestClose = () => {
        if (dirty && !saving) {
            setConfirmDiscard(true);
            return;
        }
        onClose();
    };

    const openAssignments = detail?.assignments.filter((a) => a.open) ?? [];
    const closedAssignments = detail?.assignments.filter((a) => !a.open) ?? [];
    const max = person?.maxConcurrentAssignments ?? 3;
    const saturated = !!person && person.activeAssignments >= max;
    const idleDays =
        person?.lastAssignedAt && detail
            ? daysBetween(person.lastAssignedAt, detail.today)
            : null;
    const dormant = idleDays !== null && idleDays >= DORMANT_READER_DAYS;
    const awayWithBooks = !!person && !isEffectivelyActive(person) && person.activeAssignments > 0;

    // Legacy statuses are never offered again, but the one a person still
    // carries has to stay visible — shown as a locked card rather than dropped.
    const legacyCurrent =
        person &&
        !(OFFERED_USER_ACTIVITY_STATUSES as readonly string[]).includes(person.activityStatus)
            ? person.activityStatus
            : null;

    const settingsSummary = person
        ? [
              `${maxConcurrent || '3'} attribution(s) simultanée(s) max`,
              languages.length > 0
                  ? languages.map((l) => LANGUAGE_LABELS[l as Language] ?? l).join(', ')
                  : 'aucune langue indiquée',
          ].join(' · ')
        : null;

    const amber = AMBER;

    const assignmentsSummary = (
        <>
            {openAssignments.length === 0
                ? 'Aucune en cours'
                : `${openAssignments.length} en cours`}
            {closedAssignments.length > 0 && ` · ${closedAssignments.length} terminée(s)`}
            {awayWithBooks && (
                <span className="mt-0.5 flex items-start gap-1.5">
                    <AlertTriangle size={12} className={`mt-px shrink-0 ${amber}`} />
                    Encore chez cette personne alors qu&apos;elle n&apos;est pas disponible.
                </span>
            )}
        </>
    );

    return (
        <Dialog open={personId !== null} onOpenChange={(open) => !open && requestClose()}>
            {/* Three bands, not one scrolling box: the dialog itself no longer
                scrolls (`overflow-y-hidden` replaces the primitive's own
                `overflow-y-auto`), only the middle one does. A `sticky` action
                bar inside a scrolling dialog sticks to the SCROLLPORT, which
                leaves the rest of the form running on underneath and past it —
                which is exactly what it looked like. */}
            <DialogContent className="bg-card border-border max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-y-hidden">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2 pr-8">
                        {person ? (
                            <IntentLink
                                href={`/admin/users/dossier/${person.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                title="Ouvrir le dossier dans un nouvel onglet"
                            >
                                {person.name}
                            </IntentLink>
                        ) : (
                            'Disponibilité'
                        )}
                        {person && (
                            <>
                                <CopyableId id={person.id} label="de la personne" />
                                <span
                                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${getMemberTypeColor(person.memberType)}`}
                                >
                                    {getMemberTypeLabel(person.memberType)}
                                </span>
                                {/* No status pill: the selected status a few
                                    pixels below says the same, and a second
                                    coloured chip was one colour too many. */}
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription className={META}>
                        {person ? (
                            <>
                                {/* The plafond only matters for someone who can
                                    be handed a book. */}
                                <span className={saturated && isEffectivelyActive(person) ? amber : undefined}>
                                    {person.activeAssignments} / {max} attributions en cours
                                    {saturated && isEffectivelyActive(person) && ' (plafond atteint)'}
                                </span>
                                {' · '}
                                <span className={dormant ? amber : undefined}>
                                    {person.lastAssignedAt
                                        ? `dernière attribution le ${formatDayKey(person.lastAssignedAt)}`
                                        : 'aucune attribution reçue'}
                                </span>
                                {person.email && (
                                    <>
                                        {' · '}
                                        <a
                                            href={`mailto:${person.email}`}
                                            className="underline decoration-dotted underline-offset-2 hover:text-foreground hover:decoration-solid"
                                        >
                                            {person.email}
                                        </a>
                                    </>
                                )}
                            </>
                        ) : (
                            'Chargement…'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* the only scrolling band */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
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
                        {/* Two columns on a wide screen — what you ACT on to
                            the left, what you READ to the right. One long
                            column wasted the width and put the attributions
                            between the status and everything else; the
                            original columns were not the problem, what sat
                            in them was. */}
                        {/* The right column is the wider one: the status
                            choices fit two by two, the attribution lines do
                            not fit at all in less. */}
                        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                            {/* ── left: the status, and its history under it —
                                the same subject, its present and its past. ── */}
                            <div className="space-y-3">
                            {/* ── disponibilité: what the panel is opened for ── */}
                            <section className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3 dark:border-primary/50 dark:bg-primary/[0.08]">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        <CalendarClock size={16} className="text-primary" />
                                        Statut de disponibilité
                                    </h3>
                                    {changingStatus ? (
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in duration-200">
                                            {getUserActivityStatusLabel(person.activityStatus)}
                                            <ArrowRight size={12} />
                                            <span className="font-medium text-foreground">
                                                {getUserActivityStatusLabel(draft.status)}
                                            </span>
                                        </p>
                                    ) : (
                                        statusDirty && (
                                            <p className="text-xs font-medium text-foreground animate-in fade-in duration-200">
                                                Nouvelles dates
                                            </p>
                                        )
                                    )}
                                </div>

                                <div
                                    ref={statusGroupRef}
                                    role="radiogroup"
                                    aria-label="Statut de disponibilité"
                                    onKeyDown={handleStatusKeyDown}
                                    className="grid grid-cols-2 gap-2"
                                >
                                    {OFFERED_USER_ACTIVITY_STATUSES.map((status) => (
                                        <StatusCard
                                            key={status}
                                            status={status}
                                            selected={draft.status === status}
                                            isCurrent={person.activityStatus === status}
                                            disabled={saving}
                                            tabbable={status === tabStopStatus}
                                            onSelect={draft.setStatus}
                                        />
                                    ))}
                                    {legacyCurrent && (
                                        <StatusCard
                                            status={legacyCurrent}
                                            selected={draft.status === legacyCurrent}
                                            isCurrent
                                            disabled
                                            tabbable={false}
                                            onSelect={draft.setStatus}
                                        />
                                    )}
                                </div>

                                {/* The window the person already carries — read,
                                    not edited, until asked. */}
                                {/* A plain line, not a box in the box: the band
                                    is already the frame. */}
                                {draft.needsWindow && !showWindowEditor && windowSummary && (
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-foreground">
                                        <p>
                                            Du <strong className="font-semibold">{formatDayKey(draft.from)}</strong> au{' '}
                                            <strong className="font-semibold">{formatDayKey(draft.until)}</strong>
                                            <span className={META}>
                                                {' '}· retour le {formatDayKey(windowSummary.backOn)}
                                            </span>
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setEditingWindow(true)}
                                            disabled={saving}
                                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                                        >
                                            <Pencil size={11} />
                                            Modifier les dates
                                        </button>
                                    </div>
                                )}

                                {showWindowEditor && (
                                    <div className="rounded-lg border border-border bg-card p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {changingStatus || !storedUntil ? (
                                                <>
                                                    <span className={`text-xs ${META} mr-1`}>
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
                                                            onClick={() => applyPreset(preset.span)}
                                                        >
                                                            {preset.label}
                                                        </Button>
                                                    ))}
                                                </>
                                            ) : (
                                                <>
                                                    <span className={`text-xs ${META} mr-1`}>
                                                        Prolonger :
                                                    </span>
                                                    {EXTEND_PRESETS.map((preset) => (
                                                        <Button
                                                            key={preset.label}
                                                            type="button"
                                                            variant={
                                                                activeExtension === preset.label
                                                                    ? 'default'
                                                                    : 'outline'
                                                            }
                                                            size="sm"
                                                            className="h-7 px-2 text-xs"
                                                            onClick={() => {
                                                                draft.setFrom(person.unavailableFrom ?? draft.from);
                                                                draft.setUntil(shift(storedUntil, preset.span));
                                                            }}
                                                        >
                                                            {preset.label}
                                                        </Button>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="ml-auto h-7 px-2 text-xs"
                                                        onClick={cancelWindowEdit}
                                                    >
                                                        Annuler
                                                    </Button>
                                                </>
                                            )}
                                        </div>

                                        <ActivityWindowFields draft={draft} hint={false} stacked />

                                        {windowError ? (
                                            <p className="text-sm text-red-500">{windowError}</p>
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

                                {statusDirty &&
                                    (showComment ? (
                                        <Textarea
                                            autoFocus
                                            aria-label="Commentaire sur ce changement"
                                            placeholder="Commentaire sur ce changement — il est conservé dans l'historique"
                                            value={comment}
                                            onChange={(e) => setComment(e.target.value)}
                                            rows={2}
                                            className="bg-field border-border text-foreground placeholder:text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200"
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setShowComment(true)}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            + Ajouter un commentaire (optionnel)
                                        </button>
                                    ))}

                                {/* Same question as the status — can this person
                                    get a book? — so it lives in the same band,
                                    and carries its own warning. Only for a
                                    status that leaves the person active: under
                                    any other it is a greyed-out switch and a
                                    sentence explaining why it is greyed out. */}
                                {willBeActive && (
                                    <div className="flex items-start justify-between gap-4 border-t border-primary/20 pt-3">
                                        <label htmlFor="dispo-available" className="cursor-pointer">
                                            <span className="block text-sm font-medium text-foreground">
                                                Prend des attributions
                                            </span>
                                            {/* Returning from an indisponibilité
                                                restores the status but never the
                                                flag — on purpose, it is not the
                                                same decision. Said out loud here,
                                                or the lecteur silently stays out
                                                of the pickers. */}
                                            <span
                                                className={`block text-xs ${
                                                    isAvailable ? META : amber
                                                }`}
                                            >
                                                {isAvailable
                                                    ? 'Apparaît dans les sélecteurs de lecteur.'
                                                    : 'Actif mais hors des sélecteurs : activez pour le rendre à nouveau attribuable.'}
                                            </span>
                                        </label>
                                        <Switch
                                            id="dispo-available"
                                            checked={isAvailable}
                                            disabled={saving}
                                            onCheckedChange={setIsAvailable}
                                            className="mt-0.5"
                                        />
                                    </div>
                                )}
                            </section>

                            {/* ── history ────────────────────────────── */}
                            <FoldSection
                                icon={History}
                                title="Historique de statut"
                                summary={
                                    detail.events.length === 0
                                        ? 'Aucun changement enregistré'
                                        : `${detail.events.length} changement(s)`
                                }
                                open={showHistory}
                                onToggle={() => setShowHistory((v) => !v)}
                            >
                                {detail.events.length === 0 ? (
                                    <p className={`text-sm ${META}`}>
                                        Aucun changement de statut enregistré.
                                    </p>
                                ) : (
                                    <ol className="divide-y divide-border">
                                        {detail.events.map((event) => (
                                            <li key={event.id} className="py-2 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-medium text-foreground">
                                                        {event.fromStatus
                                                            ? `${getUserActivityStatusLabel(event.fromStatus)} → ${getUserActivityStatusLabel(event.toStatus)}`
                                                            : getUserActivityStatusLabel(event.toStatus)}
                                                    </span>
                                                    <span className={`${META} whitespace-nowrap`}>
                                                        {parisDate(event.changedAt, {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })}
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
                                                    <p className={`mt-0.5 ${META}`}>
                                                        {event.comment}
                                                    </p>
                                                )}
                                                <p className={`mt-0.5 ${META}`}>
                                                    Par {event.changedBy ?? 'Système'}
                                                </p>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </FoldSection>
                            </div>

                            {/* ── right: the two subjects of their own — the books, and the lecteur's settings ── */}
                            <div className="space-y-3">
                            {/* ── attributions ───────────────────────────── */}
                            {/* Folded like the rest. They used to take the
                                most room by default, which assumed they were
                                what the panel is opened for — it is opened
                                to decide availability. The count is in the
                                header, and the one situation that needs a
                                look (away with books) is said on the folded
                                summary. */}
                            <FoldSection
                                icon={BookOpen}
                                title="Attributions"
                                summary={assignmentsSummary}
                                open={showAssignments}
                                onToggle={() => setShowAssignments((v) => !v)}
                            >
                                {/* Away while still holding books — the one
                                    combination that always needs a decision. */}
                                {/* Muted text, one amber mark: next to the
                                    long-out dates, a red line made the panel
                                    shout twice about the same books. */}
                                {awayWithBooks && (
                                    <p className={`mb-1 flex items-start gap-1.5 text-xs ${META}`}>
                                        <AlertTriangle size={13} className={`mt-px shrink-0 ${amber}`} />
                                        {/* Constat, pas consigne : la page signale la
                                            situation, elle ne dit pas au permanent quoi
                                            faire d'un bénévole. */}
                                        <span>
                                            Encore chez cette personne alors qu&apos;elle n&apos;est
                                            pas disponible.
                                        </span>
                                    </p>
                                )}

                                {openAssignments.length === 0 ? (
                                    <p className={`text-sm ${META}`}>
                                        Aucune attribution en cours.
                                        {person.memberType === 'lecteur' &&
                                            willBeActive &&
                                            isAvailable &&
                                            ' Ce lecteur peut recevoir un livre dès maintenant.'}
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-border">
                                        {openAssignments.map((assignment) => (
                                            <AssignmentRow key={assignment.id} assignment={assignment} today={detail.today} />
                                        ))}
                                    </ul>
                                )}

                                {closedAssignments.length > 0 && (
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            aria-expanded={showClosed}
                                            onClick={() => setShowClosed((v) => !v)}
                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            <ChevronRight
                                                size={13}
                                                className={`transition-transform duration-150 ${showClosed ? 'rotate-90' : ''}`}
                                            />
                                            {closedAssignments.length} attribution(s) terminée(s)
                                        </button>
                                        {showClosed && (
                                            <ul className="mt-1 divide-y divide-border animate-in fade-in duration-200">
                                                {closedAssignments.map((assignment) => (
                                                    <AssignmentRow key={assignment.id} assignment={assignment} today={detail.today} />
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </FoldSection>

                                {/* ── the lecteur's own settings ─────────── */}
                                <FoldSection
                                    icon={SlidersHorizontal}
                                    title="Réglages du lecteur"
                                    summary={
                                        <>
                                            {settingsSummary}
                                            {/* The notes stay readable folded:
                                                they are what you check before
                                                handing someone a book. */}
                                            {notes && (
                                                <span className="mt-0.5 block italic text-foreground/80 line-clamp-2">
                                                    « {notes} »
                                                </span>
                                            )}
                                        </>
                                    }
                                    open={showSettings}
                                    onToggle={() => setShowSettings((v) => !v)}
                                >
                                    <div className="space-y-4">
                                        <div className="space-y-1 max-w-[14rem]">
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
                                        <fieldset className="space-y-1">
                                            <legend className="text-xs font-medium text-foreground">
                                                Langues
                                            </legend>
                                            <ReaderLanguagesField
                                                value={languages}
                                                onChange={setLanguages}
                                                currentValue={person.languages}
                                                labelClassName="text-sm text-foreground"
                                                gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5"
                                            />
                                        </fieldset>
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
                                </FoldSection>
                            </div>
                        </div>

                            {saveError && (
                                <p role="alert" className="text-sm text-red-500">
                                    {saveError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* the action bar — a band of the dialog, never part of what
                    scrolls, so nothing can run past it */}
                {person && detail && !loading && (
                    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-6 py-3">
                        <div className="flex items-center gap-3">
                            <IntentLink
                                href={`/admin/users/dossier/${person.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                            >
                                Ouvrir le dossier complet <ExternalLink size={11} />
                            </IntentLink>
                            {dirty && (
                                <span className={`text-xs ${AMBER} animate-in fade-in duration-200`}>
                                    Modifications non enregistrées
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {dirty && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => applyDetail(detail)}
                                    disabled={saving}
                                >
                                    Réinitialiser
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSave}
                                disabled={!dirty || saving}
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

                <AlertDialog open={confirmDiscard} onOpenChange={(open) => !open && setConfirmDiscard(false)}>
                    <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">
                                Abandonner les modifications ?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                                Les changements apportés à la disponibilité de{' '}
                                {person ? <strong>{person.name}</strong> : 'cette personne'} ne sont
                                pas enregistrés.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Continuer la saisie</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    setConfirmDiscard(false);
                                    onClose();
                                }}
                            >
                                Abandonner
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}
