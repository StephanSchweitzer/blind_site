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
    Globe,
    type LucideIcon,
} from 'lucide-react';

/**
 * Each back-office section's icon and colour, keyed by the section's label —
 * shared by the dashboard cards and the navigation menu, so a section looks
 * the same in both. The menu used emoji before, which every OS draws
 * differently and some screen readers announce (« livres empilés ») unless
 * each one is hidden.
 */
export const SECTION_ICONS: Record<string, LucideIcon> = {
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
    'Site principal': Globe,
};

export type SectionAccent =
    | 'blue' | 'purple' | 'pink' | 'amber' | 'emerald' | 'red'
    | 'yellow' | 'cyan' | 'orange' | 'green' | 'violet'
    | 'teal' | 'indigo' | 'rose' | 'fuchsia' | 'sky'
    | 'lime' | 'slate';

/**
 * A colour per section — how the permanents find their way around: Factures is
 * orange, Auditeurs teal, day after day. Each section of Livres, Gestion and
 * Membres has its own; they used to collide (Factures and Doublons both orange,
 * Permanents the red of the Corbeille), so the less-used of each pair moved and
 * the everyday one kept its colour. Tailwind has about sixteen hues that read
 * as different, not twenty-two, so the five public-page cards only super admins
 * see (Contact → Nous rejoindre) borrow hues from other sections. They used to
 * share one slate, which read as « disabled » next to everything else. A
 * borrowed hue is safe there: they sit under their own « Pages du site »
 * heading, and the five are picked so no two neighbours on the dashboard's
 * three-column grid, nor Dernières infos' lime, look alike.
 */
export const SECTION_ACCENT: Record<string, SectionAccent> = {
    'Catalogue': 'blue',
    'Genres': 'purple',
    'Listes de livres': 'pink',
    'Doublons': 'amber',
    'Audio orphelin': 'emerald',
    'Corbeille audio': 'red',
    'Demandes': 'yellow',
    'Attributions': 'cyan',
    'Factures': 'orange',
    'Paiements': 'green',
    'Statistiques': 'violet',
    'Auditeurs': 'teal',
    'Lecteurs': 'indigo',
    'Donateurs': 'rose',
    'Permanents': 'fuchsia',
    'Disponibilités': 'sky',
    'Dernières infos': 'lime',
    'Contact': 'sky',
    'Équipe': 'rose',
    'Historique': 'violet',
    'Infos pratiques': 'teal',
    'Nous rejoindre': 'orange',
};

// Static class strings, so Tailwind's JIT keeps them (they live in source).
//
// Stops chosen by measurement, not by eye. The first palette (300 borders,
// 700 text, a 950/50 dark tint) had every card border at 1.3–1.7:1 against the
// page, and in dark mode a fill at 1.01:1 — the colour was barely there, and
// light-mode titles sat at 4.5:1. Now: borders ≥ 3:1 against the page in both
// themes (WCAG 1.4.11 — the card's edge is what shows it is a target), titles
// ≥ 6:1, and a 900/40 dark tint that actually reads as the section's colour.
// Yellow is the one exception: its 600 border measured 2.94:1 on white, so it
// takes 700 in light mode. Re-measure if you change a stop.
export const ACCENT_CLASSES: Record<SectionAccent, { bg: string; hoverBg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/40', hoverBg: 'hover:bg-blue-200 dark:hover:bg-blue-900/70', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-600 dark:border-blue-500' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', hoverBg: 'hover:bg-purple-200 dark:hover:bg-purple-900/70', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-600 dark:border-purple-500' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-900/40', hoverBg: 'hover:bg-pink-200 dark:hover:bg-pink-900/70', text: 'text-pink-800 dark:text-pink-300', border: 'border-pink-600 dark:border-pink-500' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-900/40', hoverBg: 'hover:bg-amber-200 dark:hover:bg-amber-900/70', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-600 dark:border-amber-500' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', hoverBg: 'hover:bg-emerald-200 dark:hover:bg-emerald-900/70', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-600 dark:border-emerald-500' },
    red: { bg: 'bg-red-100 dark:bg-red-900/40', hoverBg: 'hover:bg-red-200 dark:hover:bg-red-900/70', text: 'text-red-800 dark:text-red-300', border: 'border-red-600 dark:border-red-500' },
    yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', hoverBg: 'hover:bg-yellow-200 dark:hover:bg-yellow-900/70', text: 'text-yellow-800 dark:text-yellow-300', border: 'border-yellow-700 dark:border-yellow-500' },
    cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/40', hoverBg: 'hover:bg-cyan-200 dark:hover:bg-cyan-900/70', text: 'text-cyan-800 dark:text-cyan-300', border: 'border-cyan-600 dark:border-cyan-500' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/40', hoverBg: 'hover:bg-orange-200 dark:hover:bg-orange-900/70', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-600 dark:border-orange-500' },
    green: { bg: 'bg-green-100 dark:bg-green-900/40', hoverBg: 'hover:bg-green-200 dark:hover:bg-green-900/70', text: 'text-green-800 dark:text-green-300', border: 'border-green-600 dark:border-green-500' },
    violet: { bg: 'bg-violet-100 dark:bg-violet-900/40', hoverBg: 'hover:bg-violet-200 dark:hover:bg-violet-900/70', text: 'text-violet-800 dark:text-violet-300', border: 'border-violet-600 dark:border-violet-500' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-900/40', hoverBg: 'hover:bg-teal-200 dark:hover:bg-teal-900/70', text: 'text-teal-800 dark:text-teal-300', border: 'border-teal-600 dark:border-teal-500' },
    indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/40', hoverBg: 'hover:bg-indigo-200 dark:hover:bg-indigo-900/70', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-600 dark:border-indigo-500' },
    rose: { bg: 'bg-rose-100 dark:bg-rose-900/40', hoverBg: 'hover:bg-rose-200 dark:hover:bg-rose-900/70', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-600 dark:border-rose-500' },
    fuchsia: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', hoverBg: 'hover:bg-fuchsia-200 dark:hover:bg-fuchsia-900/70', text: 'text-fuchsia-800 dark:text-fuchsia-300', border: 'border-fuchsia-600 dark:border-fuchsia-500' },
    sky: { bg: 'bg-sky-100 dark:bg-sky-900/40', hoverBg: 'hover:bg-sky-200 dark:hover:bg-sky-900/70', text: 'text-sky-800 dark:text-sky-300', border: 'border-sky-600 dark:border-sky-500' },
    lime: { bg: 'bg-lime-100 dark:bg-lime-900/40', hoverBg: 'hover:bg-lime-200 dark:hover:bg-lime-900/70', text: 'text-lime-800 dark:text-lime-300', border: 'border-lime-600 dark:border-lime-500' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-800/60', hoverBg: 'hover:bg-slate-200 dark:hover:bg-slate-700/60', text: 'text-slate-800 dark:text-slate-200', border: 'border-slate-500 dark:border-slate-400' },
};

/** A section's accent classes; neutral for a label with no colour. */
export function sectionAccent(label: string) {
    return ACCENT_CLASSES[SECTION_ACCENT[label] ?? 'slate'];
}
