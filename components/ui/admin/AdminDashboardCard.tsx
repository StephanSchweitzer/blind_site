import Link from 'next/link';
import { Check } from 'lucide-react';
import { SECTION_ICONS } from '@/components/admin/section-icons';

/**
 * One line of « what is waiting » under a card — see `rows` below.
 * `value` is the words of the pill (« 170 en retard », « À jour »): the colour
 * only repeats what they say, it never says it alone.
 */
export type DashboardStatusRow = {
    label: string;
    href: string;
    tone: 'danger' | 'warning' | 'ok';
    value: string;
};

interface AdminDashboardCardProps {
    title: string;
    count: number;
    /**
     * What the number counts, when the title alone doesn't say it —
     * « Disponibilités 85 » read as 85 disponibilités, not 85 lecteurs libres.
     */
    countLabel?: string;
    href: string;
    buttonText: string;
    /**
     * What is late on this page, each line opening the list already filtered.
     * Only on the cards whose page holds work with a délai (demandes,
     * attributions, factures) — a line that could never say anything would
     * just be one more thing to read.
     */
    rows?: DashboardStatusRow[];
}

// Colour on the dashboard means one thing: the state of the work (red late,
// amber to watch, green up to date). The cards used to carry ten accent colours
// that meant nothing — Factures and Doublons shared an orange, Permanents the
// red of the Corbeille — so a « danger » pill had to shout over a red card.
// The cards are neutral now, and only these pills are coloured.
const toneClass: Record<DashboardStatusRow['tone'], string> = {
    danger: 'rounded-full bg-red-100 px-2.5 py-0.5 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    warning: 'rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    ok: 'text-emerald-700 dark:text-emerald-300',
};

const countFormat = new Intl.NumberFormat('fr-FR');

export function AdminDashboardCard({
                                       title,
                                       count,
                                       countLabel,
                                       href,
                                       buttonText,
                                       rows,
                                   }: AdminDashboardCardProps) {
    const Icon = SECTION_ICONS[title];

    const header = (
        <>
            <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {Icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                )}
            </div>
            <p className="flex flex-wrap items-baseline gap-x-2 text-foreground">
                <span className="text-3xl font-bold tabular-nums">{countFormat.format(count)}</span>
                {countLabel && <span className="text-sm text-muted-foreground">{countLabel}</span>}
            </p>
            <div className="mt-3 text-sm text-muted-foreground group-hover:text-foreground">
                {buttonText} <span aria-hidden="true">→</span>
            </div>
        </>
    );

    // A real link, not a clickable <div>: a <div> can't be reached with Tab, is
    // announced as plain text by a screen reader, and can't be opened in a new
    // tab. It also used to pushState the URL before router.push added it again,
    // so the first « Retour » landed back on the dashboard.
    if (!rows?.length) {
        return (
            <Link
                href={href}
                className="group block p-5 rounded-lg border border-border bg-card transition-colors duration-200 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {header}
            </Link>
        );
    }

    // With rows the card holds several links, so it can no longer BE one (a
    // link inside a link is invalid, and a screen reader reads the lot as one
    // run-on label): the top stays the link to the page, and each line is its
    // own link to the filtered list. The list takes the rest of the height, so
    // the cards of a grid row — stretched to the tallest — still line up.
    return (
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors duration-200 hover:border-primary/40">
            <Link
                href={href}
                className="group block p-5 transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                {header}
            </Link>
            <ul className="flex-1 divide-y divide-border border-t border-border">
                {rows.map((row) => (
                    <li key={row.label}>
                        <Link
                            href={row.href}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <span>{row.label}</span>
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap font-medium ${toneClass[row.tone]}`}>
                                {row.tone === 'ok' && <Check className="h-4 w-4" aria-hidden="true" />}
                                {row.value}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
