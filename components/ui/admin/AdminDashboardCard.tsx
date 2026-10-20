import { IntentLink } from '@/components/admin/IntentLink';
import { SECTION_ICONS, sectionAccent } from '@/components/admin/section-icons';

/**
 * One line of « what is waiting » in the dashboard's « À traiter » band.
 * `value` is the words of the pill (« 170 à suivre »): the colour only
 * repeats what they say, it never says it alone. `count` is the number behind
 * those words, summed per list into the band's folded line.
 */
export type DashboardStatusRow = {
    label: string;
    href: string;
    /**
     * `warning` — past a stage's planned date (amber, never red: these are
     * volunteers' tasks, nothing is an emergency).
     * `todo` — work to do now that isn't late yet (duplications: they're meant
     * to be done straight away, so « À jour » would hide them).
     */
    tone: 'warning' | 'todo' | 'ok';
    value: string;
    count: number;
};

// Tinted, not solid. The pills used to sit under coloured cards (the
// Corbeille one is red) and had to be solid white-on-amber to stand out
// there; in the neutral band, six solid amber pills out of eight shouted
// without saying which one mattered. Text at the 900 stop keeps 4.5:1 on the
// 100 tint, and its dark-mode pair the same on the 900/40 wash.
const toneClass: Record<DashboardStatusRow['tone'], string> = {
    warning: 'rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    todo: 'rounded-full bg-blue-100 px-2.5 py-0.5 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
    ok: 'text-emerald-700 dark:text-emerald-300',
};

const countFormat = new Intl.NumberFormat('fr-FR');

/** The « what is waiting » lines, each one a link to the list already filtered. */
export function DashboardStatusList({ rows, className = '' }: { rows: DashboardStatusRow[]; className?: string }) {
    return (
        <ul className={`divide-y divide-border bg-card ${className}`}>
            {rows.map((row) => (
                <li key={row.label}>
                    <IntentLink
                        href={row.href}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                        <span>{row.label}</span>
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${toneClass[row.tone]}`}>
                            {row.value}
                        </span>
                    </IntentLink>
                </li>
            ))}
        </ul>
    );
}

interface AdminDashboardCardProps {
    title: string;
    /** Left out where a total says nothing (the stats page, the site's pages). */
    count?: number;
    /**
     * What the number counts, when the title alone doesn't say it —
     * « Disponibilités 85 » read as 85 disponibilités, not 85 lecteurs libres.
     */
    countLabel?: string;
    href: string;
    /**
     * A work queue (doublons, audio orphelin, corbeille), whose number says
     * whether there is something to do. Shown in bold — never as a bigger
     * card: an earlier version kept the queues large among small cards, two
     * sizes in one grid that read as two levels of importance.
     */
    emphasis?: boolean;
}

/**
 * One dashboard card: the section's name in its colour and, underneath, its
 * count. Every card on the dashboard has this one shape and size.
 *
 * It used to be a large tile led by a 4xl number. For most cards that number
 * is a lifetime total (20 384 demandes, 8 001 paiements): it never changes what
 * anyone does today, and drawn that large it outshouted the counts that do.
 *
 * A real link, not a clickable <div>: a <div> can't be reached with Tab, is
 * announced as plain text by a screen reader, and can't be opened in a new
 * tab. An IntentLink, like every link here and in the admin lists: each
 * prefetch of a dynamic /admin page is a proxy run (with its DB read) plus a
 * page render, and Vercel counted more invocations from the dashboard's
 * viewport prefetches than from anyone clicking. It prefetches on hover only
 * (components/admin/IntentLink.tsx).
 */
export function AdminDashboardCard({ title, count, countLabel, href, emphasis = false }: AdminDashboardCardProps) {
    // Each section's colour and icon live in one place, shared with the menu
    // (components/admin/section-icons.ts).
    const colors = sectionAccent(title);
    const Icon = SECTION_ICONS[title];

    return (
        <IntentLink
            href={href}
            className={`flex h-full items-center justify-between gap-3 rounded-lg border px-4 py-3 ${colors.border} ${colors.bg} ${colors.hoverBg} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
            <span className="min-w-0">
                <span className={`block text-lg font-bold leading-tight ${colors.text}`}>{title}</span>
                {count !== undefined && (
                    <span className={`block text-sm tabular-nums ${emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {countFormat.format(count)}{countLabel ? ` ${countLabel}` : ''}
                    </span>
                )}
            </span>
            {Icon && <Icon className={`h-5 w-5 shrink-0 ${colors.text} opacity-70`} aria-hidden="true" />}
        </IntentLink>
    );
}
