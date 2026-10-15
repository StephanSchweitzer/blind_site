'use client';

import React, { useMemo, useState } from 'react';
import type { DayKey } from '@/types';
import {
    absenceProfile,
    addDays,
    daysBetween,
    formatDayKey,
    formatDayKeyShort,
    mondayOf,
    rosterSnapshot,
    type Absence,
    type AbsenceState,
} from '@/lib/users/availability';
import type { AvailabilityPerson } from '@/types';
import { getMemberTypeColor, getMemberTypeLabel } from '@/lib/user-enums';

/**
 * Period view of who is away when: a "how many at once" profile, then one row
 * per indisponibilité, one tab per state it is in.
 *
 * THE PROFILE IS THE STACK OF THE ROWS BELOW IT — literally, day by day. That
 * is the whole design: it is not a second, independently-computed statistic
 * that happens to sit above the calendar, it is the calendar's own silhouette.
 * A reader who understands the rows understands the curve without being told.
 * The tabs only choose which rows are listed: the profile always stacks all
 * of them, so it still answers « combien en même temps » whatever tab is open.
 *
 * It replaced a weekly bar chart, which failed on three counts:
 *   - counts over time are a continuous quantity, and detached bars broke it
 *     into blocks that read as unrelated events;
 *   - the y-axis was scaled to the data's own peak, so ONE person away out of
 *     169 painted a full-height block — the shape screamed while the number
 *     whispered. The scale now has a floor, so a quiet period looks quiet;
 *   - the bars were clickable and clicking did nothing you could see.
 *
 * Everything — the month axis, the profile, the absence bars and the
 * "aujourd'hui" line — is positioned through the SAME mapping over the visible
 * window, so a bump in the curve sits exactly above the absences that cause it.
 *
 * Nothing is read through a native `title` tooltip: those take a second to
 * appear and never show on touch. The figures are on screen, in the readout.
 */

/**
 * Smallest top of the y-axis. Without it the curve is normalised to its own
 * peak and a single absence fills the band — technically true, visually a lie.
 */
const PROFILE_FLOOR = 4;

/**
 * Absence colours. Blue is the one hue this palette must NOT use: on a
 * planning screen it reads as "informational, nothing to do", and somebody
 * being unavailable is precisely something to take into account. Red and
 * orange overstate it the other way — an indisponibilité is normal, declared
 * in advance, not an incident.
 *
 * Violet sits where it should: unmistakably "note this", without alarm. The
 * open-ended case moves to fuchsia because Tailwind's purple-500 and
 * violet-500 are near-identical and would have been unreadable side by side
 * in the legend.
 */
const STATE_BAR: Record<AbsenceState, string> = {
    current: 'bg-violet-500 dark:bg-violet-500',
    upcoming: 'bg-amber-400 dark:bg-amber-500',
    elapsed: 'bg-muted-foreground/40',
    openEnded: 'bg-fuchsia-500 dark:bg-fuchsia-500',
};

const STATE_LABEL: Record<AbsenceState, string> = {
    current: 'Indisponible actuellement',
    upcoming: 'Indisponibilité à venir',
    elapsed: 'Indisponibilité terminée',
    openEnded: 'Indisponibilité sans date de fin',
};

/** Tab label for each group of rows. */
const STATE_GROUP: Record<AbsenceState, string> = {
    current: 'En cours',
    openEnded: 'Sans date de fin',
    upcoming: 'À venir',
    elapsed: 'Terminées',
};

/** Reading order of the tabs: what blocks a hand-off today comes first. */
const GROUP_ORDER: AbsenceState[] = ['current', 'upcoming', 'openEnded', 'elapsed'];

/**
 * Rows shown before « Afficher les N autres », within one tab. The tabs
 * already split the list three ways; this keeps a busy tab from still
 * pushing the lecteur table a screen further down.
 */
const ROWS_PREVIEW = 12;

/**
 * Order within a tab, by the date that matters in it: who comes back first,
 * who leaves first, who has been away longest.
 */
const compareInGroup = (state: AbsenceState) => (a: Absence, b: Absence) => {
    const key = (x: Absence) =>
        (state === 'current' || state === 'elapsed' ? x.until : x.from) ?? '0000-00-00';
    return key(a).localeCompare(key(b)) || a.person.name.localeCompare(b.person.name, 'fr');
};

/**
 * Width of the left name gutter, shared by every band so the chart, the axis
 * and the absence rows all start at the same x. Written out twice on purpose:
 * Tailwind only emits classes it can read literally in the source, so deriving
 * the offset from the width at runtime would silently produce no margin.
 */
const GUTTER = 'w-52 sm:w-56';
const GUTTER_OFFSET = 'ml-52 sm:ml-56';

/** Month starts inside the period, for the axis ticks. */
function monthTicks(start: DayKey, end: DayKey): DayKey[] {
    const ticks: DayKey[] = [];
    const first = new Date(`${start}T00:00:00Z`);
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    if (cursor.toISOString().slice(0, 10) < start) {
        cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    }
    while (cursor.toISOString().slice(0, 10) <= end) {
        ticks.push(cursor.toISOString().slice(0, 10));
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return ticks;
}

const monthLabel = (key: DayKey): string =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    });

/** « du 10/08 au 09/09 » / « depuis le 10/08 » — the range as a person says it. */
function describeRange(from: DayKey | null, until: DayKey | null): string {
    if (from && until) return `du ${formatDayKeyShort(from)} au ${formatDayKeyShort(until)}`;
    if (from) return `depuis le ${formatDayKeyShort(from)}`;
    if (until) return `jusqu'au ${formatDayKeyShort(until)}`;
    return 'aucune date renseignée';
}

const plural = (n: number) => (n > 1 ? 's' : '');

export default function AvailabilityTimeline({
    absences,
    people,
    today,
    start,
    end,
    onSelectPerson,
    highlightPersonId = null,
}: {
    absences: Absence[];
    people: AvailabilityPerson[];
    today: DayKey;
    start: DayKey;
    /** Inclusive last day of the period. */
    end: DayKey;
    /** Opens the availability panel — same gesture as the tables below. */
    onSelectPerson: (id: number) => void;
    /**
     * Who was just modified. Their row is ringed so the change is visible the
     * moment the panel closes, instead of the page looking unchanged.
     */
    highlightPersonId?: number | null;
}) {
    const span = Math.max(1, daysBetween(start, end));
    const pct = (day: DayKey) =>
        Math.min(100, Math.max(0, (daysBetween(start, day) / span) * 100));

    // ── the profile: how many of the rows below overlap on each day ─────────
    const profile = useMemo(
        () => absenceProfile(absences, start, end),
        [absences, start, end]
    );
    const peak = Math.max(...profile, 0);
    const peakDayIndex = profile.indexOf(peak);
    const scaleMax = Math.max(PROFILE_FLOOR, peak);

    /** Day index → y in the 0..100 viewBox, 0 at the bottom. */
    const yOf = (value: number) => 100 - (value / scaleMax) * 100;

    const { areaPath, linePath } = useMemo(() => {
        // A step, not a slope: an absence covers a whole day, so the count is a
        // staircase. Drawing it as a diagonal would invent intermediate values.
        const steps: string[] = [];
        for (let day = 0; day < profile.length; day += 1) {
            const y = 100 - (profile[day] / scaleMax) * 100;
            steps.push(`L ${day} ${y} L ${day + 1} ${y}`);
        }
        const walk = steps.join(' ');
        return {
            linePath: `M 0 ${100 - (profile[0] / scaleMax) * 100} ${walk}`,
            areaPath: `M 0 100 ${walk} L ${profile.length} 100 Z`,
        };
    }, [profile, scaleMax]);

    // Read head: follows the pointer over the profile, parked on today at rest.
    const [readDay, setReadDay] = useState<DayKey | null>(null);
    const shownDay = readDay ?? (today >= start && today <= end ? today : start);
    const shownCount = profile[Math.max(0, Math.min(span, daysBetween(start, shownDay)))] ?? 0;

    const readProfile = (event: React.MouseEvent<HTMLDivElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (box.width === 0) return;
        const ratio = (event.clientX - box.left) / box.width;
        const day = Math.round(Math.min(1, Math.max(0, ratio)) * span);
        setReadDay(addDays(start, day));
    };

    const snapshot = useMemo(() => rosterSnapshot(people, today), [people, today]);

    const groups = useMemo(
        () =>
            GROUP_ORDER.map((state) => ({
                state,
                rows: absences.filter((a) => a.state === state).sort(compareInGroup(state)),
            })).filter((group) => group.rows.length > 0),
        [absences]
    );

    // One tab of rows at a time. The chosen tab can empty out under a filter
    // or a period change — fall back to the first one that has rows rather
    // than show an empty calendar under a list of full tabs.
    const [chosenTab, setChosenTab] = useState<AbsenceState>('current');
    const [showAllRows, setShowAllRows] = useState(false);
    // Somebody just saved from the panel: open the tab their row now lives in,
    // so closing the panel lands on the change. Adjusted during render, not in
    // an effect (react-hooks/set-state-in-effect).
    const [syncedHighlight, setSyncedHighlight] = useState(highlightPersonId);
    if (highlightPersonId !== syncedHighlight) {
        setSyncedHighlight(highlightPersonId);
        const saved = absences.find((a) => a.person.id === highlightPersonId);
        if (saved) {
            setChosenTab(saved.state);
            setShowAllRows(true);
        }
    }
    const activeGroup = groups.find((g) => g.state === chosenTab) ?? groups[0];
    const chooseTab = (state: AbsenceState) => {
        setChosenTab(state);
        setShowAllRows(false);
    };
    const hiddenRows = activeGroup ? activeGroup.rows.length - ROWS_PREVIEW : 0;
    const shownRows = !activeGroup
        ? []
        : showAllRows || hiddenRows <= 0
            ? activeGroup.rows
            : activeGroup.rows.slice(0, ROWS_PREVIEW);

    const todayPct = today >= start && today <= end ? pct(today) : null;
    const ticks = monthTicks(start, end);

    /** The vertical furniture every band shares: month gridlines + today. */
    const gridlines = (
        <>
            {ticks.map((tick) => (
                <span
                    key={tick}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-border/70"
                    style={{ left: `${pct(tick)}%` }}
                />
            ))}
            {todayPct !== null && (
                <span
                    aria-hidden
                    className="absolute inset-y-0 w-0.5 bg-red-500/70"
                    style={{ left: `${todayPct}%` }}
                />
            )}
        </>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                    Combien de personnes absentes en même temps
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                        le cumul, jour par jour, de toutes les indisponibilités ci-dessous
                    </span>
                </h4>
                {/* Volontairement PAS « attribuables » : la tuile du haut compte
                    ceux qui sont sous leur plafond, ce qui est un autre nombre.
                    Deux chiffres différents sous le même mot, et on ne croit
                    plus ni l'un ni l'autre. */}
                <p className="text-[11px] text-muted-foreground">
                    Effectif de {snapshot.roster} lecteurs · {snapshot.away} indisponible
                    {plural(snapshot.away)} aujourd&apos;hui
                    {snapshot.notTaking > 0 &&
                        ` · ${snapshot.notTaking} ne prend pas d'attribution`}
                </p>
            </div>
            <p aria-live="polite" className="-mt-3 text-xs text-foreground min-h-[1.25rem]">
                <span className="font-medium">
                    {shownDay === today ? "Aujourd'hui" : formatDayKey(shownDay)}
                </span>{' '}
                — {shownCount} personne{plural(shownCount)} indisponible{plural(shownCount)}
                {peak > 0 && (
                    <span className="text-muted-foreground">
                        {' '}
                        · maximum de {peak} le {formatDayKey(addDays(start, peakDayIndex))}
                    </span>
                )}
            </p>

            <div className="overflow-x-auto">
                <div className="min-w-[720px] space-y-3">
                    {/* month axis — shared by the chart and the rows below it */}
                    <div
                        className={`relative h-5 ${GUTTER_OFFSET} text-[10px] text-muted-foreground border-b border-border`}
                    >
                        {ticks.map((tick) => (
                            <span
                                key={tick}
                                className="absolute -translate-x-1/2"
                                style={{ left: `${pct(tick)}%` }}
                            >
                                {monthLabel(tick)}
                            </span>
                        ))}
                    </div>

                    {/* ── the profile ────────────────────────────────────── */}
                    <div className="flex items-stretch">
                        <div
                            className={`${GUTTER} shrink-0 pr-3 flex flex-col justify-between items-end text-[10px] text-muted-foreground tabular-nums`}
                        >
                            <span>{scaleMax}</span>
                            <span>0</span>
                        </div>
                        <div
                            className="relative flex-1 h-16 cursor-crosshair"
                            onMouseMove={readProfile}
                            onMouseLeave={() => setReadDay(null)}
                        >
                            {/* échelle */}
                            <span
                                aria-hidden
                                className="absolute inset-x-0 top-0 border-t border-dashed border-border"
                            />
                            <span
                                aria-hidden
                                className="absolute inset-x-0 bottom-0 border-t border-border"
                            />
                            {/* le passé, estompé */}
                            {todayPct !== null && todayPct > 0 && (
                                <span
                                    aria-hidden
                                    className="absolute inset-y-0 left-0 bg-muted/40"
                                    style={{ width: `${todayPct}%` }}
                                />
                            )}
                            {gridlines}

                            <svg
                                aria-hidden
                                className="absolute inset-0 h-full w-full overflow-hidden"
                                viewBox={`0 0 ${span} 100`}
                                preserveAspectRatio="none"
                            >
                                <path d={areaPath} className="fill-violet-500/25" />
                                <path
                                    d={linePath}
                                    fill="none"
                                    strokeWidth={1.5}
                                    vectorEffect="non-scaling-stroke"
                                    className="stroke-violet-500"
                                />
                            </svg>

                            {/* read head — where the readout above is measured */}
                            <span
                                aria-hidden
                                className="absolute inset-y-0 w-px bg-foreground/40"
                                style={{ left: `${pct(shownDay)}%` }}
                            />
                            <span
                                aria-hidden
                                className="absolute h-2 w-2 -translate-x-1/2 translate-y-[-50%] rounded-full bg-violet-500 ring-2 ring-card"
                                style={{
                                    left: `${pct(shownDay)}%`,
                                    top: `${yOf(shownCount)}%`,
                                }}
                            />

                            {peak === 0 && (
                                <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                                    Personne n&apos;est indisponible sur cette période.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── which rows to list: buttons that are also the legend ──
                        Every row used to sit on one list, the three colours
                        interleaved down a page; each colour is now its own
                        view. First drawn as underlined tabs, they read as a
                        legend — nobody guessed they could be clicked. A
                        labelled segmented control (« Afficher : », a framed
                        group, the chosen one raised) is the shape people
                        already know is a choice. The swatch stays inside
                        each button, so there is still one key, not two. */}
                    {groups.length > 0 && (
                        <div
                            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1 ${GUTTER_OFFSET}`}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span id="timeline-view-label" className="text-xs font-medium text-muted-foreground">
                                    Afficher :
                                </span>
                                <div
                                    role="group"
                                    aria-labelledby="timeline-view-label"
                                    className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1"
                                >
                                    {groups.map((group) => {
                                        const selected = group.state === activeGroup?.state;
                                        return (
                                            <button
                                                key={group.state}
                                                type="button"
                                                onClick={() => chooseTab(group.state)}
                                                aria-pressed={selected}
                                                title={STATE_LABEL[group.state]}
                                                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                    selected
                                                        ? 'bg-card font-semibold text-foreground shadow-sm ring-1 ring-border'
                                                        : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                                                }`}
                                            >
                                                <span
                                                    aria-hidden
                                                    className={`w-3 h-3 rounded-sm ${STATE_BAR[group.state]}`}
                                                />
                                                {STATE_GROUP[group.state]}
                                                <span
                                                    className={`rounded-full px-1.5 text-xs font-medium tabular-nums ${
                                                        selected ? 'bg-muted text-foreground' : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {group.rows.length}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="w-0.5 h-3 bg-red-500" /> Aujourd&apos;hui
                            </span>
                        </div>
                    )}

                    {!activeGroup ? (
                        <p className="text-sm text-muted-foreground py-10 text-center">
                            Aucune indisponibilité sur cette période.
                        </p>
                    ) : (
                        <div className="mt-2 space-y-1">
                            {shownRows.map(({ person, from, until, state }) => {
                                const barStart = from && from > start ? from : start;
                                const barEnd = until && until < end ? until : end;
                                const left = pct(barStart);
                                // +1 day so a single-day absence is still visible.
                                const width = Math.max(
                                    pct(addDays(barEnd, 1)) - left,
                                    0.8
                                );
                                const range = describeRange(from, until);
                                const label = [
                                    person.name,
                                    STATE_LABEL[state].toLowerCase(),
                                    range,
                                    person.activeAssignments > 0
                                        ? `${person.activeAssignments} attribution(s) en cours`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(' — ');
                                const highlighted = person.id === highlightPersonId;

                                return (
                                    <div
                                        key={person.id}
                                        className={`flex items-center rounded ${
                                            highlighted
                                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-card animate-in fade-in duration-300'
                                                : ''
                                        }`}
                                    >
                                        <div
                                            className={`${GUTTER} shrink-0 flex items-center gap-1.5 pr-3`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelectPerson(person.id)}
                                                className="text-xs font-medium text-foreground truncate hover:underline text-left"
                                            >
                                                {person.name}
                                            </button>
                                            <span
                                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getMemberTypeColor(person.memberType)}`}
                                            >
                                                {getMemberTypeLabel(person.memberType)}
                                            </span>
                                        </div>
                                        <div className="relative flex-1 h-7 rounded bg-muted/50">
                                            {gridlines}
                                            <button
                                                type="button"
                                                onClick={() => onSelectPerson(person.id)}
                                                aria-label={label}
                                                className={`absolute top-1 bottom-1 rounded px-1.5 text-left overflow-hidden transition-opacity hover:opacity-80 ${STATE_BAR[state]}`}
                                                style={{
                                                    left: `${left}%`,
                                                    width: `${width}%`,
                                                }}
                                            >
                                                <span
                                                    className={`block truncate text-[10px] leading-5 ${
                                                        state === 'elapsed'
                                                            ? 'text-foreground/70'
                                                            : 'text-white'
                                                    }`}
                                                >
                                                    {range}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {hiddenRows > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllRows(!showAllRows)}
                                    aria-expanded={showAllRows}
                                    className={`${GUTTER_OFFSET} mt-1 text-xs font-medium text-muted-foreground hover:text-foreground`}
                                >
                                    {showAllRows
                                        ? 'Réduire'
                                        : `Afficher les ${hiddenRows} autre${plural(hiddenRows)}`}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Period presets offered above the timeline. */
export const PERIOD_PRESETS = [
    { value: '1m', label: '1 mois', days: 30 },
    { value: '3m', label: '3 mois', days: 91 },
    { value: '6m', label: '6 mois', days: 182 },
    { value: '12m', label: '12 mois', days: 365 },
] as const;

export type PeriodPreset = typeof PERIOD_PRESETS[number]['value'];

/** The visible window: starts on the current week's Monday so bars line up. */
export function resolvePeriod(today: DayKey, preset: PeriodPreset) {
    const days = PERIOD_PRESETS.find((p) => p.value === preset)?.days ?? 91;
    const start = mondayOf(today);
    return { start, end: addDays(start, days) };
}
