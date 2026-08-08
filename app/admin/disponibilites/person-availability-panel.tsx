'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    BookOpen,
    CalendarOff,
    CheckCircle2,
    ExternalLink,
    History,
    Loader2,
    Moon,
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
    getUserActivityStatusColor,
    getUserActivityStatusLabel,
    needsActivityStatusConfirmation,
} from '@/lib/user-activity-enums';
import {
    getLanguageLabel,
    getMemberTypeColor,
    getMemberTypeLabel,
    LANGUAGE_LABELS,
    LANGUAGE_VALUES,
    type Language,
} from '@/lib/user-enums';
import { withCurrentValues } from '@/lib/select-options';
import {
    ActivityStatusConfirmDialog,
    ActivityStatusFields,
    useActivityStatusDraft,
} from '@/admin/ActivityStatusFields';
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
 */

/** Absence presets — the durations an indisponibilité is actually declared in. */
const ABSENCE_PRESETS = [
    { label: '1 semaine', days: 6 },
    { label: '2 semaines', days: 13 },
    { label: '1 mois', days: 30 },
    { label: '3 mois', days: 91 },
] as const;

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
                <Link
                    href={`/admin/assignments?search=${assignment.id}`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                >
                    Attribution n°{assignment.id} <ExternalLink size={11} />
                </Link>
                {assignment.orderId && (
                    <Link
                        href={`/admin/orders?search=${assignment.orderId}`}
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
    onSaved: () => void;
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
                        ...(person.memberType === 'lecteur' ? { languages } : {}),
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
            onSaved();
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

    return (
        <Dialog open={personId !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
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

                {loading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                        <Loader2 size={18} className="animate-spin" /> Chargement…
                    </div>
                )}

                {loadError && !loading && (
                    <p className="py-8 text-center text-sm text-red-500">{loadError}</p>
                )}

                {person && detail && !loading && (
                    <div className="space-y-4">
                        {/* ── situation en un coup d'œil ──────────────────── */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <BookOpen size={13} /> Attributions en cours
                                </div>
                                <div
                                    className={`mt-1 text-lg font-semibold ${saturated ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}
                                >
                                    {person.activeAssignments} / {max}
                                </div>
                                {saturated && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                        Plafond atteint
                                    </p>
                                )}
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Moon size={13} /> Dernière attribution
                                </div>
                                <div className="mt-1 text-sm font-medium text-foreground">
                                    {person.lastAssignedAt ? formatDayKey(person.lastAssignedAt) : 'Jamais'}
                                </div>
                                {idleDays !== null && (
                                    <p
                                        className={`text-[11px] ${idleDays >= DORMANT_READER_DAYS ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                                    >
                                        il y a {idleDays} jours
                                    </p>
                                )}
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CalendarOff size={13} /> Prend des attributions
                                </div>
                                <div className="mt-1 text-sm font-medium text-foreground">
                                    {person.isAvailable ? 'Oui' : 'Non'}
                                </div>
                                {person.languages.length > 0 && (
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        {person.languages
                                            .map((l) => LANGUAGE_LABELS[l as Language] ?? l)
                                            .join(', ')}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Away while still holding books — the one combination
                            that always needs a decision, so it is said here too. */}
                        {!isEffectivelyActive(person) && person.activeAssignments > 0 && (
                            <div className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-foreground flex items-start gap-2">
                                <AlertTriangle size={15} className="mt-0.5 text-red-600 dark:text-red-400" />
                                <span>
                                    {person.activeAssignments} attribution(s) sont encore chez cette
                                    personne alors qu&apos;elle n&apos;est pas disponible. Relancez-la
                                    ou réattribuez le livre.
                                </span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* ── edit ───────────────────────────────────── */}
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Modifier la disponibilité
                                </h3>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground mr-1">
                                        Indisponible :
                                    </span>
                                    {ABSENCE_PRESETS.map((preset) => (
                                        <Button
                                            key={preset.label}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => applyPreset(preset.days)}
                                        >
                                            {preset.label}
                                        </Button>
                                    ))}
                                    {draft.status !== 'ACTIVE' && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => draft.setStatus('ACTIVE')}
                                        >
                                            <CheckCircle2 size={12} className="mr-1" /> Rendre actif
                                        </Button>
                                    )}
                                </div>

                                <ActivityStatusFields
                                    draft={draft}
                                    currentStatus={person.activityStatus}
                                    triggerClassName="bg-field border-border text-foreground"
                                />

                                {statusDirty && (
                                    <Textarea
                                        placeholder="Commentaire sur ce changement (optionnel)"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        rows={2}
                                        className="bg-field border-border text-foreground placeholder:text-muted-foreground"
                                    />
                                )}

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
                                        {person.memberType === 'lecteur' && (
                                            <div className="space-y-1 sm:col-span-2">
                                                <label className="text-xs font-medium text-foreground">
                                                    Langues
                                                </label>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                                                    {withCurrentValues(LANGUAGE_VALUES, person.languages).map(
                                                        (lang) => (
                                                            <label
                                                                key={lang}
                                                                className="flex items-center gap-1.5 text-xs text-foreground"
                                                            >
                                                                <Checkbox
                                                                    checked={languages.includes(lang)}
                                                                    onCheckedChange={(checked) =>
                                                                        setLanguages(
                                                                            checked === true
                                                                                ? [...languages, lang]
                                                                                : languages.filter((l) => l !== lang)
                                                                        )
                                                                    }
                                                                    className="border-border data-[state=checked]:bg-primary"
                                                                />
                                                                {getLanguageLabel(lang)}
                                                            </label>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )}
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

                                {saveError && <p className="text-sm text-red-500">{saveError}</p>}

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Link
                                        href={`/admin/users/dossier/${person.id}`}
                                        className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                                    >
                                        Ouvrir le dossier complet <ExternalLink size={11} />
                                    </Link>
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
                                        <div className="mt-2">
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
