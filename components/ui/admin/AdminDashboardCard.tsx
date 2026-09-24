import Link from 'next/link';
import { Check } from 'lucide-react';
import { SECTION_ICONS, sectionAccent } from '@/components/admin/section-icons';

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

// Solid pills with white text: a late count has to stand out whatever the
// colour of the card above it (the Corbeille card is red too). White on red-600
// and amber-700 keeps 4.5:1.
const toneClass: Record<DashboardStatusRow['tone'], string> = {
    danger: 'rounded-full bg-red-600 px-2.5 py-0.5 text-white',
    warning: 'rounded-full bg-amber-700 px-2.5 py-0.5 text-white',
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
    // Each section's colour and icon live in one place, shared with the menu
    // (components/admin/section-icons.ts).
    const colors = sectionAccent(title);
    const Icon = SECTION_ICONS[title];

    const header = (
        <>
            <div className="flex items-start justify-between mb-2">
                <h3 className={`text-2xl font-bold ${colors.text}`}>{title}</h3>
                {Icon && (
                    <Icon className={`w-7 h-7 ${colors.text} opacity-70`} aria-hidden="true" />
                )}
            </div>
            <p className="flex flex-wrap items-baseline gap-x-2 text-foreground">
                <span className="text-4xl font-extrabold tabular-nums">{countFormat.format(count)}</span>
                {countLabel && <span className={`text-sm font-medium ${colors.text}`}>{countLabel}</span>}
            </p>
            <div className={`mt-4 text-sm font-medium ${colors.text}`}>
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
                className={`block p-6 rounded-lg border ${colors.border} ${colors.bg} ${colors.hoverBg} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
                {header}
            </Link>
        );
    }

    // With rows the card holds several links, so it can no longer BE one (a
    // link inside a link is invalid, and a screen reader reads the lot as one
    // run-on label): the coloured top stays the link to the page, and each
    // line is its own link to the filtered list. The white panel takes the
    // rest of the height, so the cards of a grid row — stretched to the
    // tallest — still line up.
    return (
        <div className={`flex flex-col overflow-hidden rounded-lg border ${colors.border} ${colors.bg}`}>
            <Link
                href={href}
                className={`block p-6 ${colors.hoverBg} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
            >
                {header}
            </Link>
            <ul className={`flex-1 divide-y divide-border border-t ${colors.border} bg-card`}>
                {rows.map((row) => (
                    <li key={row.label}>
                        <Link
                            href={row.href}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <span>{row.label}</span>
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${toneClass[row.tone]}`}>
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
