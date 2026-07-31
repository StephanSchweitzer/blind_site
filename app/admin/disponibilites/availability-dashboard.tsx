'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    BookOpen,
    CalendarClock,
    CalendarOff,
    CheckCircle2,
    Loader2,
    Moon,
    RefreshCw,
    Search,
    UserCheck,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getMemberTypeColor, getMemberTypeLabel } from '@/lib/user-enums';
import {
    DORMANT_READER_DAYS,
    alertCount,
    buildAlerts,
    absences as buildAbsences,
    describeDelay,
    formatDayKey,
    freeReaders,
    isLecteur,
    isTakingAttributions,
    loadedReaders,
    overlapsPeriod,
    type Absence,
} from '@/lib/users/availability';
import type { AvailabilityPerson, AvailabilityResponse } from '@/types';
import AvailabilityTimeline, {
    PERIOD_PRESETS,
    resolvePeriod,
    type PeriodPreset,
} from './availability-timeline';

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
    { value: 'auditeur', label: 'Auditeurs' },
    { value: 'autre', label: 'Autres' },
] as const;

type TypeFilter = typeof TYPE_FILTERS[number]['value'];

function matchesType(person: AvailabilityPerson, filter: TypeFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'lecteur') return person.memberType === 'lecteur';
    // 'ecouteur' is the retired spelling of auditeur — same people.
    if (filter === 'auditeur') return person.memberType === 'auditeur' || person.memberType === 'ecouteur';
    return person.memberType !== 'lecteur' && person.memberType !== 'auditeur' && person.memberType !== 'ecouteur';
}

function PersonLink({ person }: { person: AvailabilityPerson }) {
    return (
        <Link
            href={`/admin/users/dossier/${person.id}`}
            className="font-medium text-foreground hover:underline"
        >
            {person.name}
        </Link>
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

/** One alert group. Renders nothing at all when it is empty. */
function AlertGroup({
    title,
    description,
    tone,
    rows,
}: {
    title: string;
    description: string;
    tone: 'warn' | 'bad' | 'info';
    rows: Array<{ key: number; person: AvailabilityPerson; detail: string }>;
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
                        <PersonLink person={row.person} />
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
    const [onlyDormant, setOnlyDormant] = useState(false);

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

    const visibleAbsences: Absence[] = useMemo(
        () =>
            buildAbsences(people, today)
                .filter((a) => overlapsPeriod(a, start, end))
                .filter((a) => matchesType(a.person, typeFilter) && nameMatches(a.person)),
        [people, today, start, end, typeFilter, nameMatches]
    );

    const free = useMemo(
        () => freeReaders(people, today).filter((r) => nameMatches(r.person)),
        [people, today, nameMatches]
    );
    const loaded = useMemo(
        () => loadedReaders(people).filter((r) => nameMatches(r.person)),
        [people, nameMatches]
    );

    const readerRoster = people.filter(isLecteur);
    const readersTaking = readerRoster.filter(isTakingAttributions);
    const awayToday = people.filter((p) => p.effectiveStatus === 'UNAVAILABLE');
    const saturated = loadedReaders(people).filter((r) => r.saturated);

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

    const displayedFree = onlyDormant ? free.filter((r) => r.dormant) : free;
    const totalAlerts = alertCount(alerts);

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
                <div className="flex items-center gap-2">
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
                <StatTile
                    icon={<UserCheck size={20} />}
                    value={free.length}
                    label="Lecteurs libres"
                    hint={`sur ${readersTaking.length} lecteurs disponibles`}
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
            {totalAlerts === 0 ? (
                <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                    Rien à signaler : aucune indisponibilité n&apos;arrive à échéance dans les{' '}
                    {warningDays} prochains jours.
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <AlertGroup
                        title="Retours prochains"
                        description={`Ces personnes redeviennent actives dans les ${warningDays} prochains jours — de nouveau attribuables.`}
                        tone="info"
                        rows={alerts.endingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `de retour le ${formatDayKey(a.until!)} (${describeDelay(a.daysAway ?? 0)})`,
                        }))}
                    />
                    <AlertGroup
                        title="Départs prochains"
                        description={`Indisponibilités qui démarrent dans les ${warningDays} prochains jours — évitez de leur confier un long enregistrement.`}
                        tone="warn"
                        rows={alerts.startingSoon.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `indisponible à partir du ${formatDayKey(a.from!)} (${describeDelay(a.daysAway ?? 0)})${
                                a.until ? `, jusqu'au ${formatDayKey(a.until)}` : ''
                            }`,
                        }))}
                    />
                    <AlertGroup
                        title="Absents avec des attributions en cours"
                        description="Ces personnes sont (ou seront bientôt) indisponibles alors qu'un livre est encore chez elles. À relancer ou à réattribuer."
                        tone="bad"
                        rows={alerts.awayWithAttributions.map((a) => ({
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
                        rows={alerts.openEnded.map((a) => ({
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
                        rows={alerts.flaggedUnavailable.map((p) => ({
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
                        rows={alerts.elapsed.map((a) => ({
                            key: a.person.id,
                            person: a.person,
                            detail: `terminée le ${formatDayKey(a.until!)}`,
                        }))}
                    />
                </div>
            )}

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
                        <CardTitle className="text-lg text-foreground">
                            Calendrier des indisponibilités
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
                            <div className="relative">
                                <Search
                                    size={14}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Filtrer par nom…"
                                    className="h-9 w-48 pl-8 pr-8 bg-field border-border text-foreground"
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
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Du {formatDayKey(start)} au {formatDayKey(end)}.
                    </p>
                </CardHeader>
                <CardContent>
                    <AvailabilityTimeline
                        absences={visibleAbsences}
                        people={people}
                        today={today}
                        start={start}
                        end={end}
                    />
                </CardContent>
            </Card>

            {/* ── free readers ───────────────────────────────────────────── */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg text-foreground">
                                Lecteurs actifs sans attribution en cours
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Actifs, disponibles, et aucun livre en cours : les prochains à
                                solliciter. Les plus anciennement sollicités d&apos;abord.
                            </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                                type="checkbox"
                                checked={onlyDormant}
                                onChange={(e) => setOnlyDormant(e.target.checked)}
                                className="accent-current"
                            />
                            Uniquement les dormants ({DORMANT_READER_DAYS}+ jours)
                        </label>
                    </div>
                </CardHeader>
                <CardContent>
                    {displayedFree.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucun lecteur libre ne correspond à ces critères.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Lecteur</TableHead>
                                        <TableHead>Dernière attribution</TableHead>
                                        <TableHead>Spécialisation</TableHead>
                                        <TableHead className="text-right">Capacité</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedFree.map(({ person, idleDays, dormant }) => (
                                        <TableRow key={person.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <PersonLink person={person} />
                                                    {dormant && (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium"
                                                            title={`Aucune attribution depuis au moins ${DORMANT_READER_DAYS} jours`}
                                                        >
                                                            <Moon size={11} /> Dormant
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {person.lastAssignedAt ? (
                                                    <>
                                                        {formatDayKey(person.lastAssignedAt)}
                                                        <span className="text-xs ml-1">
                                                            ({idleDays} j)
                                                        </span>
                                                    </>
                                                ) : (
                                                    'Jamais'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {person.specialization || '—'}
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground text-sm">
                                                0 / {person.maxConcurrentAssignments ?? 3}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── load ───────────────────────────────────────────────────── */}
            <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground">Charge des lecteurs</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Attributions en cours par rapport au maximum simultané de chaque fiche.
                    </p>
                </CardHeader>
                <CardContent>
                    {loaded.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Aucune attribution en cours.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Lecteur</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead>Charge</TableHead>
                                        <TableHead className="text-right">En cours</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loaded.map(({ person, max, saturated: isSaturated }) => (
                                        <TableRow key={person.id}>
                                            <TableCell>
                                                <PersonLink person={person} />
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getUserActivityStatusColor(person.effectiveStatus)}`}
                                                >
                                                    {getUserActivityStatusLabel(person.effectiveStatus)}
                                                </span>
                                                {person.effectiveStatus === 'UNAVAILABLE' &&
                                                    person.unavailableUntil && (
                                                        <span className="block text-xs text-muted-foreground mt-0.5">
                                                            jusqu&apos;au {formatDayKey(person.unavailableUntil)}
                                                        </span>
                                                    )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${isSaturated ? 'bg-amber-500' : 'bg-primary'}`}
                                                            style={{
                                                                width: `${Math.min(100, (person.activeAssignments / Math.max(1, max)) * 100)}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        {person.activeAssignments} / {max}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link
                                                    href={`/admin/users/dossier/${person.id}/affectations`}
                                                    className="text-sm text-primary hover:underline"
                                                >
                                                    Voir les attributions
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
                Une indisponibilité repasse automatiquement au statut « Actif » à la fin de sa
                période : la clôture est faite chaque nuit et à chaque ouverture de cette page, et
                le retour est tracé dans l&apos;historique de la personne. Une indisponibilité dont
                la date de début est future laisse la personne active jusque-là.
            </p>
        </div>
    );
}
