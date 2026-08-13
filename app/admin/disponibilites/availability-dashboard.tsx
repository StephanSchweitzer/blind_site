'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ArrowDownNarrowWide,
    ArrowDownWideNarrow,
    BookOpen,
    CalendarClock,
    CalendarOff,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Languages,
    Loader2,
    Moon,
    RefreshCw,
    Search,
    UserCheck,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
    getUserActivityStatusColor,
    getUserActivityStatusLabel,
} from '@/lib/user-activity-enums';
import { getLanguageLabel, getMemberTypeColor, getMemberTypeLabel, LANGUAGE_VALUES } from '@/lib/user-enums';
import {
    DORMANT_READER_DAYS,
    alertCount,
    buildAlerts,
    absences as buildAbsences,
    daysBetween,
    describeDelay,
    formatDayKey,
    freeReaders,
    isLecteur,
    isTakingAttributions,
    loadedReaders,
    overlapsPeriod,
    type Absence,
    type AvailabilityAlerts,
} from '@/lib/users/availability';
import { UserSearchCombobox, type UserSearchResult } from '@/admin/UserSearchCombobox';
import type { AvailabilityPerson, AvailabilityResponse } from '@/types';
import AvailabilityTimeline, {
    PERIOD_PRESETS,
    resolvePeriod,
    type PeriodPreset,
} from './availability-timeline';
import PersonAvailabilityPanel from './person-availability-panel';

/**
 * /admin/disponibilites — one screen answering "qui est là, qui ne l'est pas,
 * et à qui puis-je confier la prochaine attribution ?".
 *
 * Everything is derived from the flat `people` list handed down by the server
 * through the pure helpers in lib/users/availability.ts, so the filters are
 * instant and no view can drift from another.
 */

const TYPE_FILTERS = [
    { value: 'all', label: 'Tous' },
    { value: 'lecteur', label: 'Lecteurs' },
    { value: 'autre', label: 'Autres' },
] as const;

type TypeFilter = typeof TYPE_FILTERS[number]['value'];

/**
 * UNE table de lecteurs, deux sens de lecture.
 *
 * Il y avait trois onglets — « Sans attribution en cours », « Charge des
 * lecteurs », « Tous les lecteurs » — qui découpaient l'effectif au lieu de le
 * trier. Un lecteur avec 1 livre sur 3 reste parfaitement preneur, et il était
 * pourtant invisible depuis l'onglet censé répondre à « à qui je confie
 * celui-ci ? » ; le troisième onglet n'existait que pour rattraper le fait que
 * les deux premiers cachaient chacun la moitié des gens.
 *
 * La charge est une quantité, pas une catégorie : elle se trie. Le filtre
 * « attribuables » et le filtre « dormants » restent des filtres, sur un axe
 * séparé — ce que les onglets confondaient.
 */
const READER_SORTS = [
    { value: 'freest', label: 'Les plus disponibles d’abord' },
    { value: 'busiest', label: 'Les plus chargés d’abord' },
] as const;

type ReaderSort = typeof READER_SORTS[number]['value'];

/** Une ligne de la table des lecteurs, tout ce qui s'y lit déjà calculé. */
interface ReaderRow {
    person: AvailabilityPerson;
    /** Plafond d'attributions simultanées de la fiche (3 par défaut). */
    max: number;
    /** À son plafond, ou au-delà. */
    saturated: boolean;
    /** Jours depuis la dernière attribution ; null s'il n'en a jamais eu. */
    idleDays: number | null;
    dormant: boolean;
    /** Actif, preneur, et encore de la place : on peut lui confier un livre. */
    assignable: boolean;
}

/**
 * Départage deux lecteurs à charge égale : le plus anciennement sollicité
 * d'abord, « jamais attribué » tout en haut. C'est la règle d'équité que
 * portait l'ancien onglet « sans attribution en cours » — les bénévoles qu'on
 * oublie sont précisément ceux qui n'ont rien eu depuis le plus longtemps.
 */
function compareIdle(a: ReaderRow, b: ReaderRow): number {
    if (a.idleDays === null && b.idleDays === null) return 0;
    if (a.idleDays === null) return -1;
    if (b.idleDays === null) return 1;
    return b.idleDays - a.idleDays;
}

const PAGE_SIZE = 10;

/** Numéros de page à afficher, resserrés autour de la page courante. */
function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const items: Array<number | 'gap'> = [1];
    // Fenêtre de 5 pages autour de la page courante, recalée près des bords
    // pour que la largeur du pied de tableau ne bouge pas d'une page à l'autre.
    let first = Math.max(2, page - 2);
    let last = Math.min(totalPages - 1, page + 2);
    if (page <= 3) last = Math.min(totalPages - 1, 5);
    if (page >= totalPages - 2) first = Math.max(2, totalPages - 4);
    if (first > 2) items.push('gap');
    for (let p = first; p <= last; p += 1) items.push(p);
    if (last < totalPages - 1) items.push('gap');
    items.push(totalPages);
    return items;
}

/**
 * Découpe une liste en pages de 10. `resetKey` rassemble les filtres qui
 * changent le contenu de la liste : quand il bouge, on revient page 1 —
 * ajusté pendant le rendu, sans effet (cf. react-hooks/set-state-in-effect).
 */
function usePagedRows<T>(rows: T[], resetKey: string) {
    const [page, setPage] = useState(1);
    const [syncedKey, setSyncedKey] = useState(resetKey);

    if (resetKey !== syncedKey) {
        setSyncedKey(resetKey);
        setPage(1);
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, totalPages);
    const offset = (current - 1) * PAGE_SIZE;

    return {
        visible: rows.slice(offset, offset + PAGE_SIZE),
        page: current,
        totalPages,
        total: rows.length,
        from: rows.length === 0 ? 0 : offset + 1,
        to: Math.min(offset + PAGE_SIZE, rows.length),
        setPage,
    };
}

/** Pied de tableau : « 1–10 sur 34 » + navigation. Masqué s'il n'y a qu'une page. */
function PaginationFooter({
    page,
    totalPages,
    from,
    to,
    total,
    unit,
    onPageChange,
}: {
    page: number;
    totalPages: number;
    from: number;
    to: number;
    total: number;
    unit: string;
    onPageChange: (page: number) => void;
}) {
    if (totalPages <= 1) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-xs text-muted-foreground">
                {from}–{to} sur {total} {unit}
            </p>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="px-2"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 1}
                    aria-label="Page précédente"
                >
                    <ChevronLeft size={15} />
                </Button>
                {pageItems(page, totalPages).map((item, index) =>
                    item === 'gap' ? (
                        <span
                            key={`gap-${index}`}
                            aria-hidden
                            className="px-1 text-xs text-muted-foreground"
                        >
                            …
                        </span>
                    ) : (
                        <Button
                            key={item}
                            variant={item === page ? 'default' : 'outline'}
                            size="sm"
                            className="w-9 px-0"
                            onClick={() => onPageChange(item)}
                            aria-label={`Page ${item}`}
                            aria-current={item === page ? 'page' : undefined}
                        >
                            {item}
                        </Button>
                    )
                )}
                <Button
                    variant="outline"
                    size="sm"
                    className="px-2"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page === totalPages}
                    aria-label="Page suivante"
                >
                    <ChevronRight size={15} />
                </Button>
            </div>
        </div>
    );
}

function matchesType(person: AvailabilityPerson, filter: TypeFilter): boolean {
    // The calendar is a staffing tool: lecteurs whose capacity it tracks, and
    // everyone else (permanents, techniciens, donateurs…) whose own absence can
    // still stall something. Auditeurs place demandes themselves — nobody plans
    // around their indisponibilité here — so they never appear, regardless of
    // filter. 'ecouteur' is the retired spelling of auditeur — same people.
    if (person.memberType === 'auditeur' || person.memberType === 'ecouteur') return false;
    if (filter === 'all') return true;
    if (filter === 'lecteur') return person.memberType === 'lecteur';
    return person.memberType !== 'lecteur';
}

/**
 * A name on this page opens the availability panel, it does NOT navigate to the
 * dossier. Sending a permanent away to act on what the screen just told them
 * lost the whole planning context; the panel keeps them here (the dossier is
 * one click away from inside it).
 */
function PersonButton({
    person,
    onOpen,
}: {
    person: AvailabilityPerson;
    onOpen: (id: number) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onOpen(person.id)}
            className="text-left font-medium text-foreground hover:underline"
            title="Voir et modifier sa disponibilité"
        >
            {person.name}
        </button>
    );
}

function TypeBadge({ person }: { person: AvailabilityPerson }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getMemberTypeColor(person.memberType)}`}
        >
            {getMemberTypeLabel(person.memberType)}
        </span>
    );
}

function StatTile({
    icon,
    value,
    label,
    hint,
    tone = 'neutral',
}: {
    icon: React.ReactNode;
    value: number;
    label: string;
    hint?: string;
    tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
    const toneClass = {
        neutral: 'text-foreground',
        good: 'text-green-600 dark:text-green-400',
        warn: 'text-amber-600 dark:text-amber-400',
        bad: 'text-red-600 dark:text-red-400',
    }[tone];

    return (
        <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-start gap-3">
                <span className={`mt-0.5 ${toneClass}`}>{icon}</span>
                <div className="min-w-0">
                    <div className={`text-2xl font-semibold leading-none ${toneClass}`}>{value}</div>
                    <div className="text-sm text-foreground mt-1">{label}</div>
                    {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Rappel du filtre de page. Le champ de recherche vit dans l'en-tête de la page :
 * une fois descendu jusqu'aux tableaux il n'est plus à l'écran, et sans ce rappel
 * les compteurs réduits n'auraient aucune explication visible.
 */
function SearchChip({ search, onClear }: { search: string; onClear: () => void }) {
    if (!search.trim()) return null;

    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Filtré : «&nbsp;{search}&nbsp;»
            <button
                type="button"
                onClick={onClear}
                aria-label="Effacer le filtre par nom"
                className="hover:text-foreground"
            >
                <X size={11} />
            </button>
        </span>
    );
}

/** Same reminder as SearchChip, for the language filter. */
function LanguageFilterChip({ languages, onClear }: { languages: string[]; onClear: () => void }) {
    if (languages.length === 0) return null;

    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Langue : {languages.map((lang) => getLanguageLabel(lang)).join(', ')}
            <button
                type="button"
                onClick={onClear}
                aria-label="Effacer le filtre par langue"
                className="hover:text-foreground"
            >
                <X size={11} />
            </button>
        </span>
    );
}

/** One alert group. Renders nothing at all when it is empty. */
function AlertGroup({
    title,
    description,
    tone,
    rows,
    onOpen,
}: {
    title: string;
    description: string;
    tone: 'warn' | 'bad' | 'info';
    rows: Array<{ key: number; person: AvailabilityPerson; detail: string }>;
    onOpen: (id: number) => void;
}) {
    if (rows.length === 0) return null;

    const toneClass = {
        warn: 'border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20',
        bad: 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20',
        info: 'border-blue-300 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/20',
    }[tone];

    return (
        <div className={`rounded-lg border p-4 ${toneClass}`}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle size={15} />
                {title}
                <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">{description}</p>
            <ul className="space-y-1">
                {rows.map((row) => (
                    <li key={row.key} className="text-sm flex flex-wrap items-baseline gap-x-2">
                        <PersonButton person={row.person} onOpen={onOpen} />
                        <TypeBadge person={row.person} />
                        <span className="text-muted-foreground">{row.detail}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function AvailabilityDashboard({ data }: { data: AvailabilityResponse }) {
    const router = useRouter();
    const [isRefreshing, startRefresh] = useTransition();
    const [isSweeping, setIsSweeping] = useState(false);
    const [period, setPeriod] = useState<PeriodPreset>('3m');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [search, setSearch] = useState('');
    const [languageFilter, setLanguageFilter] = useState<string[]>([]);
    const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false);
    const [onlyDormant, setOnlyDormant] = useState(false);
    const [onlyAssignable, setOnlyAssignable] = useState(true);
    const [readerSort, setReaderSort] = useState<ReaderSort>('freest');
    // Who the availability panel is open on. Null = closed.
    const [openPersonId, setOpenPersonId] = useState<number | null>(null);
    // The last person saved from the panel, highlighted in the calendar.
    const [highlightPersonId, setHighlightPersonId] = useState<number | null>(null);

    /** Opening somebody drops the previous highlight — one at a time. */
    const openPerson = (id: number) => {
        setHighlightPersonId(null);
        setOpenPersonId(id);
    };

    const { people, today, warningDays, justClosed } = data;

    const alerts = useMemo(
        () => buildAlerts(people, today, warningDays),
        [people, today, warningDays]
    );

    const { start, end } = useMemo(() => resolvePeriod(today, period), [today, period]);

    const nameMatches = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return (person: AvailabilityPerson) =>
            !needle || person.name.toLowerCase().includes(needle);
    }, [search]);

    // Same name filter as the calendar and the lecteur table, applied to the
    // alert groups: typing a name up top should narrow "Points à surveiller"
    // too, not just the rows further down the page.
    const filteredAlerts: AvailabilityAlerts = useMemo(
        () => ({
            endingSoon: alerts.endingSoon.filter((a) => nameMatches(a.person)),
            startingSoon: alerts.startingSoon.filter((a) => nameMatches(a.person)),
            awayWithAttributions: alerts.awayWithAttributions.filter((a) => nameMatches(a.person)),
            openEnded: alerts.openEnded.filter((a) => nameMatches(a.person)),
            elapsed: alerts.elapsed.filter((a) => nameMatches(a.person)),
            flaggedUnavailable: alerts.flaggedUnavailable.filter(nameMatches),
        }),
        [alerts, nameMatches]
    );

    // Empty selection = no restriction; otherwise the person must carry at
    // least one of the checked languages.
    const languageMatches = useMemo(() => {
        return (person: AvailabilityPerson) =>
            languageFilter.length === 0 ||
            person.languages.some((lang) => languageFilter.includes(lang));
    }, [languageFilter]);

    const visibleAbsences: Absence[] = useMemo(
        () =>
            buildAbsences(people, today)
                .filter((a) => overlapsPeriod(a, start, end))
                .filter(
                    (a) =>
                        matchesType(a.person, typeFilter) &&
                        nameMatches(a.person) &&
                        languageMatches(a.person)
                ),
        [people, today, start, end, typeFilter, nameMatches, languageMatches]
    );

    /**
     * The person just saved when they DO carry an indisponibilité but the
     * calendar is not showing it. Undefined when there is nothing to explain —
     * a row that disappeared because the person went back to Actif is the
     * change, not a hidden one.
     */
    const hiddenHighlight = useMemo(() => {
        if (highlightPersonId === null) return undefined;
        if (visibleAbsences.some((a) => a.person.id === highlightPersonId)) return undefined;
        return buildAbsences(people, today).find((a) => a.person.id === highlightPersonId);
    }, [highlightPersonId, visibleAbsences, people, today]);

    /** Every lecteur matching the page filters, everything the table shows. */
    const readerRows: ReaderRow[] = useMemo(
        () =>
            people
                .filter(isLecteur)
                .filter((p) => nameMatches(p) && languageMatches(p))
                .map((person) => {
                    const max = person.maxConcurrentAssignments ?? 3;
                    const idleDays = person.lastAssignedAt
                        ? daysBetween(person.lastAssignedAt, today)
                        : null;
                    return {
                        person,
                        max,
                        saturated: person.activeAssignments >= max,
                        idleDays,
                        dormant: idleDays === null || idleDays >= DORMANT_READER_DAYS,
                        assignable:
                            isTakingAttributions(person) && person.activeAssignments < max,
                    };
                }),
        [people, today, nameMatches, languageMatches]
    );

    const readerRoster = people.filter(isLecteur);
    const readersTaking = readerRoster.filter(isTakingAttributions);
    const awayToday = people.filter((p) => p.effectiveStatus === 'UNAVAILABLE');
    const saturated = loadedReaders(people).filter((r) => r.saturated);
    // Tiles read the whole roster, never the name filter: a counter that moves
    // while you type a name is a counter nobody can trust.
    const assignableRoster = readerRoster.filter(
        (p) => isTakingAttributions(p) && p.activeAssignments < (p.maxConcurrentAssignments ?? 3)
    );
    const freeRoster = freeReaders(people, today);

    const runSweep = async () => {
        setIsSweeping(true);
        try {
            const response = await fetch('/api/availability/expire', { method: 'POST' });
            const body = await response.json();
            toast({
                title: response.ok ? 'Indisponibilités clôturées' : 'Erreur',
                description: body.message,
                variant: response.ok ? undefined : 'destructive',
            });
            if (response.ok) router.refresh();
        } catch {
            toast({
                title: 'Erreur',
                description: 'La clôture des indisponibilités a échoué.',
                variant: 'destructive',
            });
        } finally {
            setIsSweeping(false);
        }
    };

    const displayedReaders = useMemo(() => {
        const rows = readerRows.filter(
            (r) => (!onlyAssignable || r.assignable) && (!onlyDormant || r.dormant)
        );
        rows.sort((a, b) =>
            readerSort === 'freest'
                ? a.person.activeAssignments - b.person.activeAssignments ||
                  compareIdle(a, b) ||
                  a.person.name.localeCompare(b.person.name, 'fr')
                : b.person.activeAssignments - a.person.activeAssignments ||
                  a.person.name.localeCompare(b.person.name, 'fr')
        );
        return rows;
    }, [readerRows, onlyAssignable, onlyDormant, readerSort]);

    const totalAlerts = alertCount(filteredAlerts);
    const totalAlertsUnfiltered = alertCount(alerts);

    const readerPage = usePagedRows(
        displayedReaders,
        `${search}|${onlyAssignable}|${onlyDormant}|${readerSort}|${languageFilter.join(',')}`
    );

    return (
        <div className="space-y-6">
            {/* ── header ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Disponibilités</h1>
                    <p className="text-sm text-muted-foreground">
                        Qui est indisponible et quand, et à qui confier la prochaine attribution.
                        Situation au {formatDayKey(today)}.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startRefresh(() => router.refresh())}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? (
                        <Loader2 size={15} className="mr-2 animate-spin" />
                    ) : (
                        <RefreshCw size={15} className="mr-2" />
                    )}
                    Actualiser
                </Button>
            </div>

            {/* ── search bar ─────────────────────────────────────────────────
                The two ways to search this page (filter everyone below by name,
                or jump straight to one person's card) used to live in the header
                row, which wraps under the title on anything narrower than a wide
                desktop — easy to scroll straight past without noticing. Sticky
                and visually distinct so it reads as "the search" the moment the
                page opens, and stays reachable while scrolled down into the
                calendar or the lecteur tables. */}
            <div className="sticky top-[65px] z-30 rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground pl-1 shrink-0">
                        <Search size={16} />
                        Rechercher
                    </div>
                    {/* Filtre de page : il s'applique au calendrier ET aux deux
                        listes de lecteurs, d'où sa place ici plutôt que dans une carte. */}
                    <div className="relative flex-1 min-w-[220px]">
                        <Search
                            size={14}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Filtrer toute la page par nom…"
                            aria-label="Filtrer toute la page par nom"
                            className="h-9 w-full pl-8 pr-8 bg-field border-border text-foreground"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Effacer le filtre"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    {/* Même portée que le filtre par nom : calendrier + les deux
                        listes de lecteurs. Seuls les lecteurs ont des langues
                        enregistrées, donc le combiner avec Auditeurs/Autres ne
                        renverra rien — attendu, pas un bug. */}
                    <Popover open={languagePopoverOpen} onOpenChange={setLanguagePopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-2 shrink-0">
                                <Languages size={14} />
                                {languageFilter.length > 0
                                    ? `${languageFilter.length} langue${languageFilter.length > 1 ? 's' : ''}`
                                    : 'Langue'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2 bg-card border-border">
                            <div className="space-y-0.5 max-h-72 overflow-y-auto">
                                {LANGUAGE_VALUES.map((lang) => (
                                    <label
                                        key={lang}
                                        className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-foreground hover:bg-muted cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={languageFilter.includes(lang)}
                                            onCheckedChange={(checked) =>
                                                setLanguageFilter(
                                                    checked
                                                        ? [...languageFilter, lang]
                                                        : languageFilter.filter((l) => l !== lang)
                                                )
                                            }
                                            className="border-border data-[state=checked]:bg-primary"
                                        />
                                        {getLanguageLabel(lang)}
                                    </label>
                                ))}
                            </div>
                            {languageFilter.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-1 h-7 w-full text-xs text-muted-foreground"
                                    onClick={() => setLanguageFilter([])}
                                >
                                    Effacer
                                </Button>
                            )}
                        </PopoverContent>
                    </Popover>
                    <div className="w-px self-stretch bg-border shrink-0" aria-hidden />
                    {/* Ouvrir n'importe qui, pas seulement les personnes listées.
                        Le tableau ne porte que les lecteurs et les personnes déjà
                        indisponibles : déclarer l'absence d'un permanent ou d'un
                        auditeur actif demande de pouvoir aller le chercher. */}
                    <UserSearchCombobox<UserSearchResult>
                        value={null}
                        onSelect={(user) => openPerson(user.id)}
                        placeholder="Gérer la disponibilité de…"
                        searchPlaceholder="Rechercher par nom ou email…"
                        triggerClassName="h-9 w-64 shrink-0"
                    />
                </div>
            </div>

            {justClosed > 0 && (
                <div className="rounded-lg border border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-foreground flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 text-green-600 dark:text-green-400" />
                    <span>
                        {justClosed === 1
                            ? "1 indisponibilité arrivée à terme vient d'être clôturée : la personne est de nouveau active."
                            : `${justClosed} indisponibilités arrivées à terme viennent d'être clôturées : ces personnes sont de nouveau actives.`}{' '}
                        Le retour au statut « Actif » est enregistré dans leur historique.
                    </span>
                </div>
            )}

            {/* ── summary ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* « Attribuables », pas « libres » : un lecteur qui a 1 livre
                    sur 3 peut en prendre un autre, et c'est bien à cette
                    question-là qu'on répond en ouvrant cette page. */}
                <StatTile
                    icon={<UserCheck size={20} />}
                    value={assignableRoster.length}
                    label="Lecteurs attribuables"
                    hint={`dont ${freeRoster.length} sans aucun livre en cours`}
                    tone="good"
                />
                <StatTile
                    icon={<CalendarOff size={20} />}
                    value={awayToday.length}
                    label="Indisponibles aujourd'hui"
                    hint={`${readerRoster.filter((p) => p.effectiveStatus === 'UNAVAILABLE').length} lecteur(s)`}
                    tone={awayToday.length > 0 ? 'warn' : 'neutral'}
                />
                <StatTile
                    icon={<BookOpen size={20} />}
                    value={saturated.length}
                    label="Lecteurs au maximum"
                    hint="ont atteint leur nombre d'attributions simultanées"
                    tone={saturated.length > 0 ? 'warn' : 'neutral'}
                />
                <StatTile
                    icon={<CalendarClock size={20} />}
                    value={totalAlerts}
                    label="Points à surveiller"
                    hint={`échéances dans les ${warningDays} prochains jours`}
                    tone={totalAlerts > 0 ? 'warn' : 'good'}
                />
            </div>

            {/* ── alerts ─────────────────────────────────────────────────── */}
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <CalendarClock size={18} className="text-muted-foreground" />
                Points à surveiller
                <SearchChip search={search} onClear={() => setSearch('')} />
            </h2>
            {totalAlerts === 0 ? (
                <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                    {search.trim() && totalAlertsUnfiltered > 0
                        ? `Aucun point à surveiller pour « ${search.trim()} » : ${totalAlertsUnfiltered} au total hors filtre par nom.`
                        : <>Rien à signaler : aucune indisponibilité n&apos;arrive à échéance dans les{' '}
                            {warningDays} prochains jours.</>}
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <AlertGroup
                        title="Retours prochains"
                        description={`Ces personnes redeviennent actives dans les ${warningDays} prochains jours — de nouveau attribuables.`}
                        tone="info"
                        onOpen={openPerson}
                        rows={filteredAlerts.endingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `de retour le ${formatDayKey(a.until!)} (${describeDelay(a.daysAway ?? 0)})`,
                        }))}
                    />
                    <AlertGroup
                        title="Départs prochains"
                        description={`Indisponibilités qui démarrent dans les ${warningDays} prochains jours — évitez de leur confier un long enregistrement.`}
                        tone="warn"
                        onOpen={openPerson}
                        rows={filteredAlerts.startingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `indisponible à partir du ${formatDayKey(a.from!)} (${describeDelay(a.daysAway ?? 0)})${
                                a.until ? `, jusqu'au ${formatDayKey(a.until)}` : ''
                            }`,
                        }))}
                    />
                    <AlertGroup
                        title="Absents avec des attributions en cours"
                        description="Ces personnes sont (ou seront bientôt) indisponibles alors qu'un livre est encore chez elles."
                        tone="bad"
                        onOpen={openPerson}
                        rows={filteredAlerts.awayWithAttributions.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `${a.person.activeAssignments} attribution(s) en cours${
                                a.until ? `, indisponible jusqu'au ${formatDayKey(a.until)}` : ', sans date de fin'
                            }`,
                        }))}
                    />
                    <AlertGroup
                        title="Indisponibilités sans date de fin"
                        description="Rien ne les clôturera automatiquement : fixez une date de fin ou changez le statut."
                        tone="warn"
                        onOpen={openPerson}
                        rows={filteredAlerts.openEnded.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: a.from
                                ? `indisponible depuis le ${formatDayKey(a.from)}`
                                : 'indisponible, aucune date renseignée',
                        }))}
                    />
                    <AlertGroup
                        title="Actifs mais marqués « ne prend pas d'attribution »"
                        description="Leur statut est actif, mais leur fiche indique qu'ils ne prennent pas d'attribution. Ils n'apparaissent pas dans les sélecteurs de lecteur."
                        tone="warn"
                        onOpen={openPerson}
                        rows={filteredAlerts.flaggedUnavailable.map((p) => ({
                            key: p.id,
                            person: p,
                            detail: p.availabilityNotes
                                ? `« ${p.availabilityNotes} »`
                                : 'aucune précision sur la fiche',
                        }))}
                    />
                    <AlertGroup
                        title="Indisponibilités arrivées à terme"
                        description="Leur date de fin est passée mais le statut n'a pas encore été refermé. Elles se lisent déjà comme « Actif »."
                        tone="bad"
                        onOpen={openPerson}
                        rows={filteredAlerts.elapsed.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `terminée le ${formatDayKey(a.until!)}`,
                        }))}
                    />
                </div>
            )}

            {/* Sweeps every elapsed indisponibilité server-side, not just the
                filtered ones on screen, so this stays gated on the unfiltered
                count. */}
            {alerts.elapsed.length > 0 && (
                <Button variant="outline" size="sm" onClick={runSweep} disabled={isSweeping}>
                    {isSweeping ? (
                        <Loader2 size={15} className="mr-2 animate-spin" />
                    ) : (
                        <CheckCircle2 size={15} className="mr-2" />
                    )}
                    Clôturer les indisponibilités terminées
                </Button>
            )}

            {/* ── filters ────────────────────────────────────────────────── */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="text-lg text-foreground flex items-center gap-2">
                            Calendrier des indisponibilités
                            {/* The panel writes, then the page re-reads from the
                                server: without this the calendar simply looks
                                unchanged for as long as the round-trip takes. */}
                            {isRefreshing && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground animate-in fade-in duration-200">
                                    <Loader2 size={11} className="animate-spin" />
                                    Mise à jour…
                                </span>
                            )}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1">
                                {PERIOD_PRESETS.map((preset) => (
                                    <Button
                                        key={preset.value}
                                        size="sm"
                                        variant={preset.value === period ? 'default' : 'outline'}
                                        onClick={() => setPeriod(preset.value)}
                                    >
                                        {preset.label}
                                    </Button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1">
                                {TYPE_FILTERS.map((filter) => (
                                    <Button
                                        key={filter.value}
                                        size="sm"
                                        variant={filter.value === typeFilter ? 'default' : 'outline'}
                                        onClick={() => setTypeFilter(filter.value)}
                                    >
                                        {filter.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Du {formatDayKey(start)} au {formatDayKey(end)}.
                    </p>
                    {/* Saving somebody the current filters exclude used to read
                        as "my change did nothing" — the row is simply not in
                        this view. Say so rather than let the calendar look
                        broken. */}
                    {hiddenHighlight && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 animate-in fade-in duration-200">
                            {hiddenHighlight.person.name} vient d&apos;être modifié(e) mais
                            n&apos;apparaît pas ici : son indisponibilité est hors de la période
                            affichée ou exclue par les filtres.
                        </p>
                    )}
                </CardHeader>
                <CardContent
                    className={`transition-opacity duration-200 ${isRefreshing ? 'opacity-60' : ''}`}
                >
                    <AvailabilityTimeline
                        absences={visibleAbsences}
                        people={people}
                        today={today}
                        start={start}
                        end={end}
                        onSelectPerson={openPerson}
                        highlightPersonId={highlightPersonId}
                    />
                </CardContent>
            </Card>

            {/* ── lecteurs : une table, deux sens de lecture ─────────────── */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg text-foreground">Lecteurs</CardTitle>
                        <span className="text-sm text-muted-foreground">
                            {displayedReaders.length} sur {readerRows.length}
                        </span>
                        <SearchChip search={search} onClear={() => setSearch('')} />
                        <LanguageFilterChip languages={languageFilter} onClear={() => setLanguageFilter([])} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-1">
                            {READER_SORTS.map((sort) => (
                                <Button
                                    key={sort.value}
                                    size="sm"
                                    variant={sort.value === readerSort ? 'default' : 'outline'}
                                    onClick={() => setReaderSort(sort.value)}
                                >
                                    {sort.value === 'freest' ? (
                                        <ArrowDownNarrowWide size={14} className="mr-1.5" />
                                    ) : (
                                        <ArrowDownWideNarrow size={14} className="mr-1.5" />
                                    )}
                                    {sort.label}
                                </Button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={onlyAssignable}
                                    onChange={(e) => setOnlyAssignable(e.target.checked)}
                                    className="accent-current"
                                />
                                Attribuables seulement
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={onlyDormant}
                                    onChange={(e) => setOnlyDormant(e.target.checked)}
                                    className="accent-current"
                                />
                                Dormants seulement ({DORMANT_READER_DAYS}+ jours)
                            </label>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {readerSort === 'freest'
                            ? "Du moins chargé au plus chargé ; à charge égale, le plus anciennement sollicité d'abord."
                            : 'Du plus chargé au moins chargé — pour repérer qui est au plafond.'}
                        {onlyAssignable
                            ? ' Seuls les lecteurs actifs, preneurs et sous leur plafond sont listés.'
                            : ' Tous les lecteurs sont listés, y compris ceux qui ne peuvent rien recevoir.'}
                    </p>
                </CardHeader>

                <CardContent>
                    {displayedReaders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucun lecteur ne correspond à ces critères.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Lecteur</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setReaderSort(
                                                        readerSort === 'freest' ? 'busiest' : 'freest'
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 hover:text-foreground"
                                                aria-label="Inverser le tri par charge"
                                            >
                                                Charge
                                                {readerSort === 'freest' ? (
                                                    <ArrowDownNarrowWide size={13} />
                                                ) : (
                                                    <ArrowDownWideNarrow size={13} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead>Dernière attribution</TableHead>
                                        <TableHead>Langues</TableHead>
                                        <TableHead className="text-right">Disponibilité</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {readerPage.visible.map((row) => (
                                        <TableRow key={row.person.id}>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <PersonButton person={row.person} onOpen={openPerson} />
                                                    {row.dormant && (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium"
                                                            title={`Aucune attribution depuis au moins ${DORMANT_READER_DAYS} jours`}
                                                        >
                                                            <Moon size={11} /> Dormant
                                                        </span>
                                                    )}
                                                </div>
                                                {!row.person.isAvailable && (
                                                    <span className="block text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                                        ne prend pas d&apos;attribution
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getUserActivityStatusColor(row.person.effectiveStatus)}`}
                                                >
                                                    {getUserActivityStatusLabel(row.person.effectiveStatus)}
                                                </span>
                                                {row.person.effectiveStatus === 'UNAVAILABLE' &&
                                                    row.person.unavailableUntil && (
                                                        <span className="block text-xs text-muted-foreground mt-0.5">
                                                            jusqu&apos;au{' '}
                                                            {formatDayKey(row.person.unavailableUntil)}
                                                        </span>
                                                    )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${row.saturated ? 'bg-amber-500' : 'bg-primary'}`}
                                                            style={{
                                                                width: `${Math.min(100, (row.person.activeAssignments / Math.max(1, row.max)) * 100)}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground tabular-nums">
                                                        {row.person.activeAssignments} / {row.max}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {row.person.lastAssignedAt ? (
                                                    <>
                                                        {formatDayKey(row.person.lastAssignedAt)}
                                                        <span className="text-xs ml-1">
                                                            ({row.idleDays} j)
                                                        </span>
                                                    </>
                                                ) : (
                                                    'Jamais'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {row.person.languages.length > 0
                                                    ? row.person.languages
                                                          .map((lang) => getLanguageLabel(lang))
                                                          .join(', ')
                                                    : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openPerson(row.person.id)}
                                                >
                                                    Gérer
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <PaginationFooter
                        page={readerPage.page}
                        totalPages={readerPage.totalPages}
                        from={readerPage.from}
                        to={readerPage.to}
                        total={readerPage.total}
                        unit="lecteurs"
                        onPageChange={readerPage.setPage}
                    />
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
                Cliquez sur un nom pour ouvrir sa disponibilité : ses attributions, son statut et
                son plafond s&apos;y modifient sans quitter cette page. Une indisponibilité repasse
                automatiquement au statut « Actif » à la fin de sa période : la clôture est faite
                chaque nuit et à chaque ouverture de cette page, et le retour est tracé dans
                l&apos;historique de la personne. Une indisponibilité dont la date de début est
                future laisse la personne active jusque-là.
            </p>

            <PersonAvailabilityPanel
                personId={openPersonId}
                onClose={() => setOpenPersonId(null)}
                onSaved={(savedId) => {
                    // Ringed in the calendar until somebody else is opened, so
                    // closing the panel lands on the change instead of on a page
                    // that looks exactly like it did before.
                    setHighlightPersonId(savedId);
                    startRefresh(() => router.refresh());
                }}
            />
        </div>
    );
}
