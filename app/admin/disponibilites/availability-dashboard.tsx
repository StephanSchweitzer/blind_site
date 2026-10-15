'use client';

import React, { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowDownNarrowWide,
    ArrowDownWideNarrow,
    ArrowRight,
    BookOpen,
    CalendarCheck,
    CalendarClock,
    CalendarOff,
    CalendarRange,
    CheckCircle2,
    ChevronUp,
    CirclePause,
    Languages,
    Loader2,
    MessageSquareText,
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
    formatDayKeyShort,
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
import { AideLink } from '@/components/ui/admin/AideLink';
import { pageInfo, pageSkip, parsePageParam, parsePageSizeParam } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';

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

/**
 * Découpe une liste en pages, en mémoire : la liste des lecteurs arrive entière
 * du serveur, et ses filtres vivent dans l'état de la page, pas dans l'URL.
 *
 * `resetKey` rassemble les filtres qui changent le contenu de la liste : quand
 * il bouge, on revient page 1 — ajusté pendant le rendu, sans effet (cf.
 * react-hooks/set-state-in-effect). La page et la taille se lisent dans l'URL
 * au chargement, pour qu'un lien de la barre de pages ouvert dans un autre
 * onglet tombe au même endroit ; un clic simple, lui, ne fait que changer l'état.
 */
function usePagedRows<T>(rows: T[], resetKey: string) {
    const searchParams = useSearchParams();
    const [page, setPage] = useState(() => parsePageParam(searchParams.get('page')));
    const [pageSize, setPageSize] = useState(() => parsePageSizeParam(searchParams.get('perPage')));
    const [syncedKey, setSyncedKey] = useState(resetKey);

    if (resetKey !== syncedKey) {
        setSyncedKey(resetKey);
        setPage(1);
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const info = pageInfo(Math.min(page, totalPages), pageSize, rows.length);
    const offset = pageSkip(info.page, pageSize);

    const navigate = (href: string) => {
        const params = new URL(href, window.location.origin).searchParams;
        setPageSize(parsePageSizeParam(params.get('perPage')));
        setPage(parsePageParam(params.get('page')));
    };

    return { visible: rows.slice(offset, offset + pageSize), info, navigate };
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
            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${getMemberTypeColor(person.memberType)}`}
        >
            {getMemberTypeLabel(person.memberType)}
        </span>
    );
}

/**
 * A counter that is also a shortcut: it scrolls to the section that lists
 * the people it counts. Drawn as a button with an arrow and a hover state —
 * a tile that only looks like a card is a tile nobody thinks of clicking.
 */
function StatTile({
    icon,
    value,
    label,
    hint,
    action,
    onClick,
    tone = 'neutral',
}: {
    icon: React.ReactNode;
    value: number;
    label: string;
    hint?: string;
    /** Où mène le clic, dit en clair : « Voir le calendrier ». */
    action: string;
    onClick: () => void;
    tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
    const toneClass = {
        neutral: 'text-foreground',
        good: 'text-green-600 dark:text-green-400',
        warn: 'text-amber-600 dark:text-amber-400',
        bad: 'text-red-600 dark:text-red-400',
    }[tone];

    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <span className={`mt-0.5 ${toneClass}`}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className={`block text-2xl font-semibold leading-none ${toneClass}`}>{value}</span>
                <span className="block text-sm text-foreground mt-1">{label}</span>
                {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {action}
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
            </span>
        </button>
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

/**
 * Noms affichés d'office dans un groupe, le bloc « + N autres » faisant le
 * sixième : environ deux rangées sur un écran de bureau.
 *
 * Ces groupes sont des repères, pas une liste de tâches. Une ligne par
 * personne, puis même douze blocs par groupe, transformaient la section en
 * mur de noms — et les bénévoles qui ouvrent cette page y lisaient « tout va
 * mal » là où il n'y a, le plus souvent, que des absences ordinaires. Le
 * reste se déplie à la demande, et le calendrier juste dessous donne le détail.
 */
const ALERT_GROUP_PREVIEW = 5;

interface AlertRow {
    key: number;
    person: AvailabilityPerson;
    /** Le repère lu d'un coup d'œil dans le bloc : « 18 oct. », « 2 en cours »… */
    meta?: string;
    /**
     * Une note libre sur la fiche : signalée par une icône, lue en infobulle.
     * Tronquée dans le bloc, elle en faisait des largeurs toutes différentes.
     */
    hasNote?: boolean;
    /** La phrase complète, en infobulle et pour les lecteurs d'écran. */
    detail: string;
}

/**
 * One group of « Points à surveiller »: a neutral card, an icon in the same
 * colour as the matching calendar tab, a block per person. No warning
 * triangle and no tinted background — an indisponibilité is ordinary, and six
 * amber boxes read as six incidents. Renders nothing when empty.
 */
function AlertGroup({
    title,
    description,
    icon,
    rows,
    onOpen,
}: {
    title: string;
    description: string;
    /** Icône déjà colorée, cf. les couleurs du calendrier. */
    icon: React.ReactNode;
    rows: AlertRow[];
    onOpen: (id: number) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    if (rows.length === 0) return null;

    const hidden = rows.length - ALERT_GROUP_PREVIEW;
    const visible = expanded || hidden <= 0 ? rows : rows.slice(0, ALERT_GROUP_PREVIEW);
    const blockClass =
        'flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-left text-sm transition-colors hover:bg-muted';

    return (
        <section className="rounded-lg border border-border bg-card p-4" aria-label={title}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="shrink-0" aria-hidden>
                    {icon}
                </span>
                <span className="min-w-0">{title}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {rows.length}
                </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">{description}</p>
            <ul className="flex flex-wrap gap-1.5">
                {visible.map((row) => (
                    <li key={row.key} className="min-w-0 max-w-full">
                        {/* Ouvre le panneau de disponibilité, comme PersonButton. */}
                        <button
                            type="button"
                            onClick={() => onOpen(row.person.id)}
                            title={`${row.person.name} — ${row.detail}`}
                            aria-label={`${row.person.name}, ${getMemberTypeLabel(row.person.memberType)} : ${row.detail}`}
                            className={blockClass}
                        >
                            <span className="truncate font-medium text-foreground">{row.person.name}</span>
                            {/* Le type ne se lit que quand il fait exception :
                                presque tout le monde ici est lecteur. */}
                            {!isLecteur(row.person) && <TypeBadge person={row.person} />}
                            {row.meta && (
                                <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                                    {row.meta}
                                </span>
                            )}
                            {row.hasNote && (
                                <MessageSquareText size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                            )}
                        </button>
                    </li>
                ))}
                {hidden > 0 && (
                    <li>
                        <button
                            type="button"
                            onClick={() => setExpanded(!expanded)}
                            aria-expanded={expanded}
                            className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            {expanded ? (
                                <>
                                    <ChevronUp size={13} /> Réduire
                                </>
                            ) : (
                                <>+ {hidden} autre{hidden > 1 ? 's' : ''}</>
                            )}
                        </button>
                    </li>
                )}
            </ul>
        </section>
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

    // Where the counter tiles lead. Focus follows the scroll so a keyboard
    // user lands in the section too, not back at the top of the page.
    const calendarRef = useRef<HTMLDivElement>(null);
    const readersRef = useRef<HTMLDivElement>(null);
    const goTo = (ref: React.RefObject<HTMLDivElement | null>) => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        ref.current?.focus({ preventScroll: true });
    };

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

    // Empty selection = no restriction; otherwise the person must carry at
    // least one of the checked languages.
    const languageMatches = useMemo(() => {
        return (person: AvailabilityPerson) =>
            languageFilter.length === 0 ||
            person.languages.some((lang) => languageFilter.includes(lang));
    }, [languageFilter]);

    // Same name + language filters as the calendar and the lecteur table,
    // applied to the alert groups: typing a name or checking a language up
    // top should narrow "Points à surveiller" too, not just the rows further
    // down the page.
    const filteredAlerts: AvailabilityAlerts = useMemo(() => {
        const matches = (p: AvailabilityPerson) => nameMatches(p) && languageMatches(p);
        return {
            endingSoon: alerts.endingSoon.filter((a) => matches(a.person)),
            startingSoon: alerts.startingSoon.filter((a) => matches(a.person)),
            awayWithAttributions: alerts.awayWithAttributions.filter((a) => matches(a.person)),
            openEnded: alerts.openEnded.filter((a) => matches(a.person)),
            elapsed: alerts.elapsed.filter((a) => matches(a.person)),
            flaggedUnavailable: alerts.flaggedUnavailable.filter(matches),
        };
    }, [alerts, nameMatches, languageMatches]);

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
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">Disponibilités</h1>
                        <AideLink section="disponibilites" />
                    </div>
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
                        searchPlaceholder="Nom, email, ou numéro de personne…"
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
            {/* Pas de tuile « Points à surveiller » : la section juste dessous
                compte déjà chacun de ses groupes, et un gros total y ajoutait
                surtout de l'inquiétude. Chaque tuile mène à la section qui
                liste les personnes qu'elle compte, réglée pour les montrer. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* « Attribuables », pas « libres » : un lecteur qui a 1 livre
                    sur 3 peut en prendre un autre, et c'est bien à cette
                    question-là qu'on répond en ouvrant cette page. */}
                <StatTile
                    icon={<UserCheck size={20} />}
                    value={assignableRoster.length}
                    label="Lecteurs attribuables"
                    hint={`dont ${freeRoster.length} sans aucun livre en cours`}
                    tone="good"
                    action="Voir les lecteurs"
                    onClick={() => {
                        setOnlyAssignable(true);
                        setOnlyDormant(false);
                        setReaderSort('freest');
                        goTo(readersRef);
                    }}
                />
                <StatTile
                    icon={<CalendarOff size={20} />}
                    value={awayToday.length}
                    label="Indisponibles aujourd'hui"
                    hint={`${readerRoster.filter((p) => p.effectiveStatus === 'UNAVAILABLE').length} lecteur(s)`}
                    tone={awayToday.length > 0 ? 'warn' : 'neutral'}
                    action="Voir le calendrier"
                    onClick={() => {
                        setTypeFilter('all');
                        goTo(calendarRef);
                    }}
                />
                <StatTile
                    icon={<BookOpen size={20} />}
                    value={saturated.length}
                    label="Lecteurs au maximum"
                    hint="ont atteint leur nombre d'attributions simultanées"
                    tone={saturated.length > 0 ? 'warn' : 'neutral'}
                    action="Voir les plus chargés"
                    onClick={() => {
                        // Ils ne sont pas attribuables : le filtre par défaut
                        // les cacherait précisément.
                        setOnlyAssignable(false);
                        setOnlyDormant(false);
                        setReaderSort('busiest');
                        goTo(readersRef);
                    }}
                />
            </div>

            {/* ── alerts ─────────────────────────────────────────────────── */}
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <CalendarClock size={18} className="text-muted-foreground" />
                Points à surveiller
                <SearchChip search={search} onClear={() => setSearch('')} />
                <LanguageFilterChip languages={languageFilter} onClear={() => setLanguageFilter([])} />
            </h2>
            {totalAlerts === 0 ? (
                <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                    {(search.trim() || languageFilter.length > 0) && totalAlertsUnfiltered > 0
                        ? `Aucun point à surveiller pour ce filtre : ${totalAlertsUnfiltered} au total hors filtre par nom/langue.`
                        : <>Rien à signaler : aucune indisponibilité n&apos;arrive à échéance dans les{' '}
                            {warningDays} prochains jours.</>}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4">
                    <AlertGroup
                        title="Retours prochains"
                        description={`Ces personnes reviennent d’ici  jours : de quoi penser à leur prochaine attribution.`}
                        icon={<CalendarCheck size={15} className="text-green-600 dark:text-green-400" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.endingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            meta: formatDayKeyShort(a.until!),
                            detail: `de retour le ${formatDayKey(a.until!)} (${describeDelay(a.daysAway ?? 0)})`,
                        }))}
                    />
                    <AlertGroup
                        title="Absences à venir"
                        description={`Ces personnes s’absentent d’ici  jours : un livre plus court leur conviendra peut-être mieux.`}
                        icon={<CalendarClock size={15} className="text-amber-500" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.startingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            meta: formatDayKeyShort(a.from!),
                            detail: `indisponible à partir du ${formatDayKey(a.from!)} (${describeDelay(a.daysAway ?? 0)})${
                                a.until ? `, jusqu'au ${formatDayKey(a.until)}` : ''
                            }`,
                        }))}
                    />
                    <AlertGroup
                        title="Absents avec un livre en cours"
                        description="Un livre les attend pendant leur absence. Rien d’urgent, simplement bon à savoir."
                        icon={<BookOpen size={15} className="text-violet-500" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.awayWithAttributions.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            meta: `${a.person.activeAssignments} en cours`,
                            detail: `${a.person.activeAssignments} attribution(s) en cours${
                                a.until ? `, indisponible jusqu'au ${formatDayKey(a.until)}` : ', sans date de fin'
                            }`,
                        }))}
                    />
                    <AlertGroup
                        title="Absences sans date de retour"
                        description="Quand vous connaîtrez leur date de retour, l’indiquer leur rendra le statut « Actif » tout seul."
                        icon={<CalendarRange size={15} className="text-fuchsia-500" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.openEnded.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            meta: a.from ? `depuis le ${formatDayKeyShort(a.from)}` : 'sans date',
                            detail: a.from
                                ? `indisponible depuis le ${formatDayKey(a.from)}`
                                : 'indisponible, aucune date renseignée',
                        }))}
                    />
                    <AlertGroup
                        title="En pause pour les attributions"
                        description="Toujours actifs, mais ne souhaitent pas de nouveau livre pour l’instant : ils ne sont pas proposés comme lecteur."
                        icon={<CirclePause size={15} className="text-sky-500" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.flaggedUnavailable.map((p) => ({
                            key: p.id,
                            person: p,
                            hasNote: Boolean(p.availabilityNotes),
                            detail: p.availabilityNotes
                                ? `« ${p.availabilityNotes} »`
                                : 'aucune précision sur la fiche',
                        }))}
                    />
                    <AlertGroup
                        title="Absences terminées"
                        description="Leur absence est terminée et ils comptent déjà comme actifs ; il reste seulement à refermer l’indisponibilité."
                        icon={<CheckCircle2 size={15} className="text-muted-foreground" />}
                        onOpen={openPerson}
                        rows={filteredAlerts.elapsed.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            meta: `fin le ${formatDayKeyShort(a.until!)}`,
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
            <Card
                ref={calendarRef}
                tabIndex={-1}
                className="border-border bg-card scroll-mt-36 focus:outline-none"
            >
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
            <Card
                ref={readersRef}
                tabIndex={-1}
                className="border-border bg-card scroll-mt-36 focus:outline-none"
            >
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
                    <AdminPaginatedList
                        info={readerPage.info}
                        noun={{ one: 'lecteur', many: 'lecteurs' }}
                        label="Pages des lecteurs"
                        onNavigate={readerPage.navigate}
                        // Les filtres de cette page ne sont pas dans l'URL : les liens
                        // ne portent que la page et la taille.
                        query=""
                    >
                    {displayedReaders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucun lecteur ne correspond à ces critères.
                        </p>
                    ) : (
                        <div>
                            <Table stickyHeader mobileCards>
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
                                                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${getUserActivityStatusColor(row.person.effectiveStatus)}`}
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
                    </AdminPaginatedList>
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
