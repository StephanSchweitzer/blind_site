'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    History,
    Loader2,
    RotateCcw,
    Search,
    X,
} from 'lucide-react';
import { AdminCard } from '@/components/ui/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { toast } from '@/hooks/use-toast';
import {
    OPERATION_LABELS,
    fieldLabel,
    formatAuditValue,
    isReservedField,
    modelLabel,
    recordHref,
} from '@/lib/audit/labels';
import type {
    AuditEventItem,
    AuditEventsResponse,
    AuditOperation,
    AuditRestoreResponse,
    StatsActor,
} from '@/types';
import { AUDIO_ACTION_LABEL, AUDIO_ACTION_TINT, formatDateTime } from './stats-utils';
import { type EventGroup, groupEvents, headOf, isAudioBurst } from './audit-grouping';

/**
 * « Journal des modifications » — the audit trail, read.
 *
 * Rows are collapsed to one line each; opening one shows the field-level diff in
 * words rather than as JSON. Deletions are set apart visually because they are
 * the only rows that can be acted on, and the only ones whose data is gone.
 *
 * One act by one person is often several writes — saving a fiche, then the
 * bucket re-read that follows it, each landing as its own AuditEvent. Those are
 * regrouped here, at display time only: the table stays append-only and nothing
 * is merged, deleted or reordered on the way in.
 */

const OPERATIONS: AuditOperation[] = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'];

const OPERATION_TINT: Record<AuditOperation, string> = {
    CREATE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    RESTORE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

/**
 * What to badge a row with. An AudioTrackEvent row is always a CREATE at the
 * storage level — it's a log entry being inserted, never the track itself
 * being deleted in place — so `event.operation` alone would badge a deletion
 * burst « Création ». The action the row actually describes (upload / rename
 * / delete / restore) lives in `changes.action` instead; that's what a reader
 * needs to see.
 */
function operationBadge(event: AuditEventItem): { label: string; tint: string } {
    const action = event.model === 'AudioTrackEvent' ? event.changes.action?.[1] : null;
    if (typeof action === 'string' && action in AUDIO_ACTION_LABEL) {
        return { label: AUDIO_ACTION_LABEL[action], tint: AUDIO_ACTION_TINT[action] };
    }
    return { label: OPERATION_LABELS[event.operation], tint: OPERATION_TINT[event.operation] };
}

interface Filters {
    model: string;
    actor: string;
    operation: string;
    subject: string;
    start: string;
    end: string;
}

const EMPTY_FILTERS: Filters = {
    model: '', actor: '', operation: '', subject: '', start: '', end: '',
};

/** Below this the « Enregistrement » term matches too much to be worth a query. */
const MIN_SUBJECT_CHARS = 2;

/** Typing pause before the subject search is sent. */
const SUBJECT_DEBOUNCE_MS = 350;

const selectClass =
    'h-9 rounded-md border border-border bg-field px-2 text-sm text-foreground';

/**
 * Accent- and case-insensitive contains, so « andree » finds « Andrée HORDE ».
 * Names in this base carry their accents; the people typing them often don't.
 */
const foldAccents = (value: string): string =>
    value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * « Auteur » filter as a typeahead rather than a <select>.
 *
 * Purely local: the actors present in the window already travel with every page
 * of the journal, so filtering them costs no request at all — which is also why
 * this doesn't reuse EntitySearchCombobox, whose whole job is debouncing a
 * fetch, and which cannot show a list before the first keystroke.
 */
function ActorFilter({
    actors,
    value,
    onChange,
}: {
    actors: StatsActor[];
    value: string;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selected = actors.find((actor) => String(actor.id) === value) ?? null;
    const shown = React.useMemo(() => {
        const term = foldAccents(query.trim());
        return term ? actors.filter((actor) => foldAccents(actor.name).includes(term)) : actors;
    }, [actors, query]);

    const pick = (next: string) => {
        onChange(next);
        setOpen(false);
        setQuery('');
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="h-9 w-56 justify-between bg-field border-border font-normal"
                >
                    <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>
                        {selected?.name ?? 'Tous'}
                    </span>
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(320px,calc(100vw-2rem))] p-0 bg-card border-border"
                align="start"
                collisionPadding={16}
            >
                <div className="p-2">
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher un auteur…"
                        aria-label="Rechercher un auteur"
                        className="h-8 bg-field border-border text-foreground"
                    />
                </div>
                <div className="max-h-[220px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => pick('')}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${
                            value === '' ? 'bg-muted text-foreground' : 'text-muted-foreground'
                        }`}
                    >
                        Tous
                    </button>
                    {shown.map((actor) => (
                        <button
                            key={actor.id}
                            type="button"
                            onClick={() => pick(String(actor.id))}
                            className={`w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted ${
                                String(actor.id) === value ? 'bg-muted' : ''
                            }`}
                        >
                            {actor.name}
                        </button>
                    ))}
                    {shown.length === 0 && (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                            Aucun auteur ne correspond.
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

/**
 * « Livre n°4549, Le Ventre de Paris — Émile Zola » — the record in full, for
 * the tooltip and the link's accessible name, where the visible label truncates.
 */
function describeRecord(event: AuditEventItem): string {
    const identity = event.recordId === '*'
        ? modelLabel(event.model)
        : `${modelLabel(event.model)} n°${event.recordId}`;
    if (!event.recordLabel) return identity;
    const { title, subtitle } = event.recordLabel;
    return `${identity}, ${title}${subtitle ? ` — ${subtitle}` : ''}`;
}

/** "3 champs" / "Instantané conservé" / "12 pistes" — the one-line gist of a row. */
function summarize(group: EventGroup): string {
    if (isAudioBurst(group)) return `${group.events.length} pistes`;
    const event = headOf(group);
    const count = Object.keys(group.changes).length;
    if (event.operation === 'DELETE') {
        return event.restorable ? 'Instantané conservé' : 'Sans instantané';
    }
    if (count === 0) return '—';
    return count === 1 ? '1 champ' : `${count} champs`;
}

/**
 * File-by-file detail for a folded audio burst. What differs between the
 * merged events is each event's own filename, not a field whose value moved —
 * so this lists them rather than reusing DiffTable's before/after columns.
 */
function AudioBurstList({ group }: { group: EventGroup }) {
    const action = headOf(group).changes.action?.[1];
    const label = typeof action === 'string' ? AUDIO_ACTION_LABEL[action] ?? action : null;

    return (
        <div>
            {label && (
                <p className="text-xs text-muted-foreground mb-1.5">
                    {group.events.length} fichiers — {label}
                </p>
            )}
            <ul className="text-sm space-y-0.5 max-h-64 overflow-y-auto">
                {[...group.events].reverse().map((event) => {
                    const filename = event.changes.filename?.[1];
                    const newFilename = event.changes.newFilename?.[1];
                    return (
                        <li key={event.id} className="text-foreground/80 truncate">
                            {typeof filename === 'string' ? filename : '—'}
                            {typeof newFilename === 'string' && (
                                <span className="text-muted-foreground"> → {newFilename}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function DiffTable({ group }: { group: EventGroup }) {
    const event = headOf(group);
    const entries = Object.entries(group.changes);
    if (entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {event.operation === 'DELETE'
                    ? 'L’enregistrement a été supprimé ; son contenu est conservé hors du journal pour permettre une restauration.'
                    : group.events.length > 1
                        ? 'Ces modifications se sont annulées entre elles : l’enregistrement a retrouvé son état de départ.'
                        : 'Aucun champ suivi n’a changé.'}
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                        <th className="font-normal py-1 pr-4">Champ</th>
                        <th className="font-normal py-1 pr-4">Avant</th>
                        <th className="font-normal py-1">Après</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(([field, [before, after]]) => (
                        <tr key={field} className="border-t border-border/60 align-top">
                            <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">
                                {fieldLabel(field)}
                            </td>
                            <td className="py-1.5 pr-4 text-foreground/70 break-words max-w-xs">
                                {isReservedField(field) ? '—' : formatAuditValue(before)}
                            </td>
                            <td className="py-1.5 text-foreground break-words max-w-xs">
                                {formatAuditValue(after)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EventRow({
    group,
    expanded,
    onToggle,
    onRestore,
}: {
    group: EventGroup;
    expanded: boolean;
    onToggle: () => void;
    onRestore: (event: AuditEventItem) => void;
}) {
    const event = headOf(group);
    const isDeletion = event.operation === 'DELETE';
    const badge = operationBadge(event);
    const href = recordHref(event.model, event.recordId);
    const merged = group.events.length;
    // The stretch a grouped block covers, oldest → newest.
    const startedAt = group.events[merged - 1].at;

    return (
        <div
            className={`rounded-lg border ${
                isDeletion
                    ? 'border-red-300 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20'
                    : 'border-border bg-card'
            }`}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                >
                    {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className="sr-only">Voir le détail</span>
                </button>

                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDateTime(event.at)}
                </span>

                <Badge className={badge.tint}>
                    {badge.label}
                </Badge>

                {merged > 1 && (
                    <Badge
                        variant="outline"
                        className="font-normal text-muted-foreground"
                        title={`${merged} écritures entre ${formatDateTime(startedAt)} et ${formatDateTime(event.at)}, regroupées`}
                    >
                        ×{merged}
                    </Badge>
                )}

                <span className="text-sm text-foreground font-medium whitespace-nowrap">
                    {modelLabel(event.model)}
                    {event.recordId !== '*' && (
                        <span className="text-muted-foreground font-normal">
                            {' '}n°{event.recordId}
                        </span>
                    )}
                </span>

                {/* What the record actually is. The id stays — it is the link
                    target and the vocabulary of the fiches — but it is the name
                    that makes the line readable. */}
                {event.recordLabel && (
                    <span
                        className="text-sm text-foreground truncate max-w-[22rem]"
                        title={describeRecord(event)}
                    >
                        {event.recordLabel.title}
                        {event.recordLabel.subtitle && (
                            <span className="text-muted-foreground font-normal">
                                {' — '}{event.recordLabel.subtitle}
                            </span>
                        )}
                    </span>
                )}

                {href && (
                    <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Ouvrir ${describeRecord(event)}`}
                    >
                        <ExternalLink size={13} />
                    </Link>
                )}

                <span className="text-xs text-muted-foreground">par {event.actorName}</span>

                <span className="text-xs text-muted-foreground ml-auto">{summarize(group)}</span>

                {isDeletion && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!event.restorable}
                        title={event.restoreBlocker ?? 'Recréer cet enregistrement'}
                        onClick={() => onRestore(event)}
                    >
                        <RotateCcw size={13} className="mr-1.5" />
                        Restaurer
                    </Button>
                )}
            </div>

            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-border/60">
                    {merged > 1 && !isAudioBurst(group) && (
                        <p className="text-xs text-muted-foreground mb-2">
                            {merged} enregistrements successifs entre {formatDateTime(startedAt)} et{' '}
                            {formatDateTime(event.at)}. Le détail ci-dessous montre l’effet net :
                            la valeur de départ et la valeur d’arrivée.
                        </p>
                    )}
                    {merged > 1 && isAudioBurst(group) && (
                        <p className="text-xs text-muted-foreground mb-2">
                            {merged} pistes traitées entre {formatDateTime(startedAt)} et{' '}
                            {formatDateTime(event.at)}, dans la même action groupée.
                        </p>
                    )}
                    {isAudioBurst(group) ? <AudioBurstList group={group} /> : <DiffTable group={group} />}
                    {isDeletion && event.restoreBlocker && (
                        <p className="text-xs text-muted-foreground mt-2">{event.restoreBlocker}</p>
                    )}
                </div>
            )}
        </div>
    );
}

/** A page of the journal, tagged with the query it answers. */
interface LoadedPage {
    key: string;
    data: AuditEventsResponse;
    events: AuditEventItem[];
}

export default function AuditTimeline() {
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    // What is typed, kept apart from what is queried: the input must stay
    // responsive while the search behind it waits for a pause.
    const [subjectInput, setSubjectInput] = useState('');
    const subjectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [page, setPage] = useState<LoadedPage | null>(null);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    // `pending` is only ever replaced, never cleared: Radix keeps the content
    // mounted while it animates out, and clearing it would flash "n° ?" on the
    // way. `dialogOpen` is what actually opens and closes it.
    const [pending, setPending] = useState<AuditEventItem | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value !== '')
    ).toString();
    // The token forces a reload after a restore, which adds a RESTORE row.
    const queryKey = `${query}|${reloadToken}`;

    // Like the rest of the dashboard: results carry the key they answer, so
    // "loading" is derived rather than set inside the effect
    // (react-hooks/set-state-in-effect).
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/stats/audit?${query}`)
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then((data: AuditEventsResponse) => {
                if (!cancelled) { setPage({ key: queryKey, data, events: data.events }); setError(null); }
            })
            .catch(() => { if (!cancelled) setError('Impossible de charger le journal.'); });
        return () => { cancelled = true; };
    }, [queryKey, query]);

    // Collapse the open row when the query changes — adjusted during render,
    // the pattern used by the disponibilités tables.
    const [syncedKey, setSyncedKey] = useState(queryKey);
    if (queryKey !== syncedKey) {
        setSyncedKey(queryKey);
        setExpanded(null);
    }

    const current = page?.key === queryKey ? page : null;
    const loading = current === null;
    const events = current?.events ?? [];
    // Keyed on the loaded page, not on `events`: that fallback builds a fresh []
    // on every render, which would defeat the memo. Grouping is derived rather
    // than stored — the page grows by whole pages, and a block never spans a
    // boundary it could be cut on.
    const groups = React.useMemo(() => groupEvents(current?.events ?? []), [current]);
    // Facets come from the last successful load, so the filters stay usable
    // while the next one is in flight.
    const data = current?.data ?? page?.data ?? null;

    const loadMore = async () => {
        const cursor = current?.data.nextCursor;
        if (cursor === null || cursor === undefined) return;
        setLoadingMore(true);
        try {
            const res = await fetch(`/api/stats/audit?${query}&before=${cursor}`);
            if (!res.ok) throw new Error(`${res.status}`);
            const next: AuditEventsResponse = await res.json();
            setPage((previous) =>
                previous && previous.key === queryKey
                    ? { key: previous.key, data: next, events: [...previous.events, ...next.events] }
                    : previous
            );
        } catch {
            setError('Impossible de charger la suite du journal.');
        } finally {
            setLoadingMore(false);
        }
    };

    const confirmRestore = async () => {
        if (!pending) return;
        setRestoring(true);
        try {
            const res = await fetch(`/api/stats/audit/${pending.id}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true }),
            });
            const payload: AuditRestoreResponse = await res.json();
            toast({
                title: payload.success ? 'Enregistrement restauré' : 'Restauration impossible',
                description: payload.message,
                variant: payload.success ? undefined : 'destructive',
            });
            // The RESTORE event lands in the trail too, so reload either way:
            // a refusal also means the list on screen may be out of date.
            setReloadToken((token) => token + 1);
        } catch {
            toast({
                title: 'Restauration impossible',
                description: 'La requête a échoué.',
                variant: 'destructive',
            });
        } finally {
            setRestoring(false);
            setDialogOpen(false);
        }
    };

    const askRestore = (event: AuditEventItem) => {
        setPending(event);
        setDialogOpen(true);
    };

    const retention = data?.retention;
    const set = (key: keyof Filters) => (value: string) =>
        setFilters((current) => ({ ...current, [key]: value }));

    // Debounced from the change handler rather than an effect, the same shape
    // useEntitySearch uses — no setState inside an effect.
    const changeSubject = (value: string) => {
        setSubjectInput(value);
        if (subjectTimer.current) clearTimeout(subjectTimer.current);
        const trimmed = value.trim();
        // Under the minimum the filter is simply off, which is also what
        // clearing the field means.
        const next = trimmed.length >= MIN_SUBJECT_CHARS ? trimmed : '';
        subjectTimer.current = setTimeout(() => {
            setFilters((current) =>
                current.subject === next ? current : { ...current, subject: next }
            );
        }, SUBJECT_DEBOUNCE_MS);
    };

    const resetFilters = () => {
        if (subjectTimer.current) clearTimeout(subjectTimer.current);
        setSubjectInput('');
        setFilters(EMPTY_FILTERS);
    };

    // Drop a pending debounce on unmount so it cannot fire into a dead component.
    useEffect(() => () => {
        if (subjectTimer.current) clearTimeout(subjectTimer.current);
    }, []);

    return (
        <AdminCard className="p-4 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                    Journal des modifications
                </h2>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {retention
                        ? `${retention.rows} événement(s) conservé(s) · ${retention.retentionDays} derniers jours · ${retention.megabytes} Mo`
                        : <><Loader2 size={12} className="animate-spin" />Chargement…</>}
                </p>
            </div>

            {retention?.underPressure && (
                <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-foreground flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                        Le journal occupe {retention.megabytes} Mo et a dépassé le seuil de{' '}
                        {retention.softLimitMb} Mo : la rétention a été ramenée automatiquement à{' '}
                        {retention.retentionDays} jours pour protéger la base.
                    </span>
                </div>
            )}

            {/* ── filters ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-3 mt-4 mb-4">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Enregistrement
                    <span className="relative">
                        <Search
                            size={14}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                        />
                        <Input
                            type="search"
                            value={subjectInput}
                            onChange={(e) => changeSubject(e.target.value)}
                            placeholder="Titre, auteur, nom, e-mail…"
                            className="h-9 w-64 pl-8 pr-8 bg-field border-border text-foreground"
                        />
                        {subjectInput !== '' && (
                            <button
                                type="button"
                                onClick={() => changeSubject('')}
                                aria-label="Effacer la recherche"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </span>
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Type d’enregistrement
                    <select
                        className={selectClass}
                        value={filters.model}
                        onChange={(e) => set('model')(e.target.value)}
                    >
                        <option value="">Tous</option>
                        {(data?.models ?? []).map((model) => (
                            <option key={model} value={model}>{modelLabel(model)}</option>
                        ))}
                    </select>
                </label>

                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Auteur
                    <ActorFilter
                        actors={data?.actors ?? []}
                        value={filters.actor}
                        onChange={set('actor')}
                    />
                </div>

                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Opération
                    <div className="flex flex-wrap gap-1">
                        <Button
                            size="sm"
                            variant={filters.operation === '' ? 'default' : 'outline'}
                            onClick={() => set('operation')('')}
                        >
                            Toutes
                        </Button>
                        {OPERATIONS.map((operation) => (
                            <Button
                                key={operation}
                                size="sm"
                                variant={filters.operation === operation ? 'default' : 'outline'}
                                onClick={() => set('operation')(operation)}
                            >
                                {OPERATION_LABELS[operation]}
                            </Button>
                        ))}
                    </div>
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Du
                    <Input
                        type="date"
                        value={filters.start}
                        onChange={(e) => set('start')(e.target.value)}
                        className="h-9 w-40 bg-field border-border text-foreground"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Au
                    <Input
                        type="date"
                        value={filters.end}
                        onChange={(e) => set('end')(e.target.value)}
                        className="h-9 w-40 bg-field border-border text-foreground"
                    />
                </label>

                {(query !== '' || subjectInput !== '') && (
                    <Button size="sm" variant="ghost" onClick={resetFilters}>
                        Réinitialiser
                    </Button>
                )}
            </div>

            {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}

            {/* ── timeline ───────────────────────────────────────────────── */}
            {loading && events.length === 0 && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
                    <Loader2 size={16} className="animate-spin" />
                    Chargement…
                </p>
            )}

            {!loading && events.length === 0 && (
                <div className="py-10 text-center">
                    <History size={22} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-foreground">Aucune modification à afficher.</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                        Le journal ne conserve que les{' '}
                        <strong>{retention?.retentionDays ?? 14} derniers jours</strong> : au-delà,
                        les événements sont purgés automatiquement pour ne pas saturer la base.
                        {query !== '' && ' Essayez d’élargir les filtres.'}
                    </p>
                </div>
            )}

            {events.length > 0 && (
                <div className={`space-y-1.5 ${loading ? 'opacity-60' : ''}`}>
                    {groups.map((group) => (
                        <EventRow
                            key={group.key}
                            group={group}
                            expanded={expanded === group.key}
                            onToggle={() => setExpanded(expanded === group.key ? null : group.key)}
                            onRestore={askRestore}
                        />
                    ))}
                </div>
            )}

            {current?.data.nextCursor !== null && current?.data.nextCursor !== undefined && (
                <div className="flex justify-center mt-4">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore && <Loader2 size={14} className="mr-2 animate-spin" />}
                        Charger plus
                    </Button>
                </div>
            )}

            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Restaurer {pending ? describeRecord(pending) : ''} ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            L’enregistrement sera recréé tel qu’il était au moment de sa suppression,
                            avec le même identifiant. Si un enregistrement occupe déjà cet identifiant,
                            la restauration sera refusée — rien ne sera écrasé.
                            {pending?.model === 'User' && (
                                <> Le mot de passe n’est pas conservé par le journal : la personne
                                devra le réinitialiser.</>
                            )}{' '}
                            La restauration est elle-même enregistrée dans le journal.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restoring}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void confirmRestore(); }}
                            disabled={restoring}
                        >
                            {restoring && <Loader2 size={14} className="mr-2 animate-spin" />}
                            Restaurer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminCard>
    );
}
