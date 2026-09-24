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
 * as different, not twenty-two: the five public-page cards only super admins
 * see (Contact → Nous rejoindre) share one slate, as one group.
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
    'Contact': 'slate',
    'Équipe': 'slate',
    'Historique': 'slate',
    'Infos pratiques': 'slate',
    'Nous rejoindre': 'slate',
};

// Static class strings, so Tailwind's JIT keeps them (they live in source).
export const ACCENT_CLASSES: Record<SectionAccent, { bg: string; hoverBg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-950/50', hoverBg: 'hover:bg-blue-200 dark:hover:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-900' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-950/50', hoverBg: 'hover:bg-purple-200 dark:hover:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-900' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-950/50', hoverBg: 'hover:bg-pink-200 dark:hover:bg-pink-900/50', text: 'text-pink-700 dark:text-pink-400', border: 'border-pink-300 dark:border-pink-900' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-950/50', hoverBg: 'hover:bg-amber-200 dark:hover:bg-amber-900/50', text: 'text-amber-800 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-900' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-950/50', hoverBg: 'hover:bg-emerald-200 dark:hover:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-900' },
    red: { bg: 'bg-red-100 dark:bg-red-950/50', hoverBg: 'hover:bg-red-200 dark:hover:bg-red-900/50', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-900' },
    yellow: { bg: 'bg-yellow-100 dark:bg-yellow-950/50', hoverBg: 'hover:bg-yellow-200 dark:hover:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-900' },
    cyan: { bg: 'bg-cyan-100 dark:bg-cyan-950/50', hoverBg: 'hover:bg-cyan-200 dark:hover:bg-cyan-900/50', text: 'text-cyan-800 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-900' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-950/50', hoverBg: 'hover:bg-orange-200 dark:hover:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-900' },
    green: { bg: 'bg-green-100 dark:bg-green-950/50', hoverBg: 'hover:bg-green-200 dark:hover:bg-green-900/50', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-900' },
    violet: { bg: 'bg-violet-100 dark:bg-violet-950/50', hoverBg: 'hover:bg-violet-200 dark:hover:bg-violet-900/50', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-300 dark:border-violet-900' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-950/50', hoverBg: 'hover:bg-teal-200 dark:hover:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-300 dark:border-teal-900' },
    indigo: { bg: 'bg-indigo-100 dark:bg-indigo-950/50', hoverBg: 'hover:bg-indigo-200 dark:hover:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-900' },
    rose: { bg: 'bg-rose-100 dark:bg-rose-950/50', hoverBg: 'hover:bg-rose-200 dark:hover:bg-rose-900/50', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-900' },
    fuchsia: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/50', hoverBg: 'hover:bg-fuchsia-200 dark:hover:bg-fuchsia-900/50', text: 'text-fuchsia-700 dark:text-fuchsia-400', border: 'border-fuchsia-300 dark:border-fuchsia-900' },
    sky: { bg: 'bg-sky-100 dark:bg-sky-950/50', hoverBg: 'hover:bg-sky-200 dark:hover:bg-sky-900/50', text: 'text-sky-800 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-900' },
    lime: { bg: 'bg-lime-100 dark:bg-lime-950/50', hoverBg: 'hover:bg-lime-200 dark:hover:bg-lime-900/50', text: 'text-lime-800 dark:text-lime-400', border: 'border-lime-300 dark:border-lime-900' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-900/60', hoverBg: 'hover:bg-slate-200 dark:hover:bg-slate-800/60', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700' },
};

/** A section's accent classes; neutral for a label with no colour. */
export function sectionAccent(label: string) {
    return ACCENT_CLASSES[SECTION_ACCENT[label] ?? 'slate'];
}
