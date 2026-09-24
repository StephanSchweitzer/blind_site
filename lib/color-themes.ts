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

// Nous rejoindre: card header band, highlight value text, CTA button.
// Flat 700 shades (they were gradients): white text on them stays above 4.5:1.
export const MEMBERSHIP_THEME: Record<ColorTheme, { header: string; value: string; cta: string }> = {
    blue: { header: 'bg-blue-700', value: 'text-blue-700 dark:text-blue-300', cta: 'bg-blue-700 hover:bg-blue-800' },
    purple: { header: 'bg-purple-700', value: 'text-purple-700 dark:text-purple-300', cta: 'bg-purple-700 hover:bg-purple-800' },
    green: { header: 'bg-green-700', value: 'text-green-700 dark:text-green-300', cta: 'bg-green-700 hover:bg-green-800' },
    amber: { header: 'bg-amber-700', value: 'text-amber-700 dark:text-amber-300', cta: 'bg-amber-700 hover:bg-amber-800' },
    red: { header: 'bg-red-700', value: 'text-red-700 dark:text-red-300', cta: 'bg-red-700 hover:bg-red-800' },
    indigo: { header: 'bg-indigo-700', value: 'text-indigo-700 dark:text-indigo-300', cta: 'bg-indigo-700 hover:bg-indigo-800' },
};

export function asTheme(key: string): ColorTheme {
    return (THEME_KEYS as readonly string[]).includes(key) ? (key as ColorTheme) : 'blue';
}
