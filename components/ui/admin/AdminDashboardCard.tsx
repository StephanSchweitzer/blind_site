import Link from 'next/link';
import {
    BookOpen,
    Theater,
    Newspaper,
    List,
    ShoppingCart,
    UserCheck,
    Headphones,
    FileText,
    Mic,
    Copy,
    HeartHandshake,
    FolderX,
    CreditCard,
    KeyRound,
    CalendarClock,
    MapPin,
    Users,
    History,
    Info,
    Handshake,
    BarChart3,
    Trash2,
    Check,
    LucideIcon,
} from 'lucide-react';

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
    href: string;
    buttonText: string;
    accentColor: 'blue' | 'purple' | 'green' | 'pink' | 'yellow' | 'cyan' | 'orange' | 'red' | 'indigo' | 'teal';
    /**
     * What is late on this page, each line opening the list already filtered.
     * Only on the cards whose page holds work with a délai (demandes,
     * attributions, factures) — a line that could never say anything would
     * just be one more thing to read.
     */
    rows?: DashboardStatusRow[];
}

const toneClass: Record<DashboardStatusRow['tone'], string> = {
    danger: 'rounded-full bg-red-100 px-2.5 py-0.5 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    warning: 'rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    ok: 'text-emerald-700 dark:text-emerald-300',
};

const colorMap = {
    blue: {
        bg: 'bg-blue-100 dark:bg-blue-950/50',
        hoverBg: 'hover:bg-blue-200 dark:hover:bg-blue-900/50',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-300 dark:border-blue-900',
    },
    yellow: {
        bg: 'bg-yellow-100 dark:bg-yellow-950/50',
        hoverBg: 'hover:bg-yellow-200 dark:hover:bg-yellow-900/50',
        text: 'text-yellow-700 dark:text-yellow-400',
        border: 'border-yellow-300 dark:border-yellow-900',
    },
    purple: {
        bg: 'bg-purple-100 dark:bg-purple-950/50',
        hoverBg: 'hover:bg-purple-200 dark:hover:bg-purple-900/50',
        text: 'text-purple-700 dark:text-purple-400',
        border: 'border-purple-300 dark:border-purple-900',
    },
    green: {
        bg: 'bg-green-100 dark:bg-green-950/50',
        hoverBg: 'hover:bg-green-200 dark:hover:bg-green-900/50',
        text: 'text-green-700 dark:text-green-400',
        border: 'border-green-300 dark:border-green-900',
    },
    pink: {
        bg: 'bg-pink-100 dark:bg-pink-950/50',
        hoverBg: 'hover:bg-pink-200 dark:hover:bg-pink-900/50',
        text: 'text-pink-700 dark:text-pink-400',
        border: 'border-pink-300 dark:border-pink-900',
    },
    cyan: {
        bg: 'bg-cyan-100 dark:bg-cyan-950/50',
        hoverBg: 'hover:bg-cyan-200 dark:hover:bg-cyan-900/50',
        text: 'text-cyan-700 dark:text-cyan-400',
        border: 'border-cyan-300 dark:border-cyan-900',
    },
    orange: {
        bg: 'bg-orange-100 dark:bg-orange-950/50',
        hoverBg: 'hover:bg-orange-200 dark:hover:bg-orange-900/50',
        text: 'text-orange-700 dark:text-orange-400',
        border: 'border-orange-300 dark:border-orange-900',
    },
    red: {
        bg: 'bg-red-100 dark:bg-red-950/50',
        hoverBg: 'hover:bg-red-200 dark:hover:bg-red-900/50',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-300 dark:border-red-900',
    },
    indigo: {
        bg: 'bg-indigo-100 dark:bg-indigo-950/50',
        hoverBg: 'hover:bg-indigo-200 dark:hover:bg-indigo-900/50',
        text: 'text-indigo-700 dark:text-indigo-400',
        border: 'border-indigo-300 dark:border-indigo-900',
    },
    teal: {
        bg: 'bg-teal-100 dark:bg-teal-950/50',
        hoverBg: 'hover:bg-teal-200 dark:hover:bg-teal-900/50',
        text: 'text-teal-700 dark:text-teal-400',
        border: 'border-teal-300 dark:border-teal-900',
    }
};

const iconMap: Record<string, LucideIcon> = {
    'Catalogue': BookOpen,
    'Genres': Theater,
    'Dernières infos': Newspaper,
    'Listes de livres': List,
    'Doublons': Copy,
    'Demandes': ShoppingCart,
    'Attributions': UserCheck,
    'Factures': FileText,
    'Lecteurs': Mic,
    'Auditeurs': Headphones,
    'Donateurs': HeartHandshake,
    'Audio orphelin': FolderX,
    'Corbeille audio': Trash2,
    'Paiements': CreditCard,
    'Permanents': KeyRound,
    'Disponibilités': CalendarClock,
    'Contact': MapPin,
    'Équipe': Users,
    'Historique': History,
    'Infos pratiques': Info,
    'Nous rejoindre': Handshake,
    'Statistiques': BarChart3,
};

export function AdminDashboardCard({
                                       title,
                                       count,
                                       href,
                                       buttonText,
                                       accentColor,
                                       rows,
                                   }: AdminDashboardCardProps) {
    const colors = colorMap[accentColor];
    const Icon = iconMap[title];

    const header = (
        <>
            <div className="flex items-start justify-between mb-2">
                <h2 className={`text-2xl font-bold ${colors.text}`}>{title}</h2>
                {Icon && (
                    <Icon className={`w-7 h-7 ${colors.text} opacity-70`} />
                )}
            </div>
            <p className="text-4xl font-extrabold text-foreground">{count}</p>
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