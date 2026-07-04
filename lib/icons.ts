import {
    Calendar,
    FileText,
    Award,
    Bookmark,
    BookOpen,
    Archive,
    Heart,
    Users,
    Clock,
    Euro,
    BookMarked,
    HelpCircle,
    Mail,
    Headphones,
    type LucideIcon,
} from 'lucide-react';

/**
 * Whitelist of icons that DB-driven content may reference. Content stores the
 * string key (e.g. "Award"); pages resolve it to the component at render time.
 * Storing a key (not markup) keeps it type-safe and prevents arbitrary SVG.
 */
export const ICONS = {
    Calendar,
    FileText,
    Award,
    Bookmark,
    BookOpen,
    Archive,
    Heart,
    Users,
    Clock,
    Euro,
    BookMarked,
    HelpCircle,
    Mail,
    Headphones,
} as const;

export type IconKey = keyof typeof ICONS;

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

export function resolveIcon(key: string): LucideIcon {
    return (ICONS as Record<string, LucideIcon>)[key] ?? Calendar;
}
