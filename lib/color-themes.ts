// Static class maps so Tailwind's JIT keeps these classes (they live in source).

export const THEME_KEYS = ['blue', 'purple', 'green', 'amber', 'red', 'indigo'] as const;
export type ColorTheme = (typeof THEME_KEYS)[number];

// Informations pratiques: icon chip
export const INFO_THEME: Record<ColorTheme, { box: string; icon: string }> = {
    blue: { box: 'bg-blue-100 dark:bg-blue-900/30', icon: 'text-blue-600 dark:text-blue-400' },
    purple: { box: 'bg-purple-100 dark:bg-purple-900/30', icon: 'text-purple-600 dark:text-purple-400' },
    green: { box: 'bg-green-100 dark:bg-green-900/30', icon: 'text-green-600 dark:text-green-400' },
    amber: { box: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-600 dark:text-amber-400' },
    red: { box: 'bg-red-100 dark:bg-red-900/30', icon: 'text-red-600 dark:text-red-400' },
    indigo: { box: 'bg-indigo-100 dark:bg-indigo-900/30', icon: 'text-indigo-600 dark:text-indigo-400' },
};

// Nous rejoindre: card header gradient, highlight value text, CTA button
export const MEMBERSHIP_THEME: Record<ColorTheme, { header: string; value: string; cta: string }> = {
    blue: { header: 'from-blue-600 to-blue-500', value: 'text-blue-600 dark:text-blue-300', cta: 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600' },
    purple: { header: 'from-purple-600 to-purple-500', value: 'text-purple-600 dark:text-purple-300', cta: 'from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600' },
    green: { header: 'from-green-600 to-green-500', value: 'text-green-600 dark:text-green-300', cta: 'from-green-600 to-green-500 hover:from-green-700 hover:to-green-600' },
    amber: { header: 'from-amber-600 to-amber-500', value: 'text-amber-600 dark:text-amber-300', cta: 'from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600' },
    red: { header: 'from-red-600 to-red-500', value: 'text-red-600 dark:text-red-300', cta: 'from-red-600 to-red-500 hover:from-red-700 hover:to-red-600' },
    indigo: { header: 'from-indigo-600 to-indigo-500', value: 'text-indigo-600 dark:text-indigo-300', cta: 'from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600' },
};

export function asTheme(key: string): ColorTheme {
    return (THEME_KEYS as readonly string[]).includes(key) ? (key as ColorTheme) : 'blue';
}
