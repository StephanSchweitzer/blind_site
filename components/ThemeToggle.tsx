'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};
function useHydrated() {
    return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function ThemeToggle() {
    const mounted = useHydrated();
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        const storedTheme = localStorage.getItem('theme');
        if (!storedTheme) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? 'dark' : 'light');
        }
    }, [setTheme]);

    if (!mounted) {
        // Placeholder only — hidden from assistive technology so it is not
        // announced as an unlabelled control before hydration.
        return (
            <div
                aria-hidden="true"
                className="p-2 rounded-lg bg-gray-200 w-10 h-10 flex items-center justify-center"
            >
                <div className="w-5 h-5 rounded-full bg-gray-300 animate-pulse" />
            </div>
        );
    }

    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 transition-colors duration-200"
            // The name states the action, not just the icon, so it is usable
            // without seeing which glyph is displayed (RGAA 11.9 / WCAG 4.1.2).
            aria-label={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
            aria-pressed={isDark}
            title={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
        >
            {isDark ? (
                <Sun aria-hidden="true" className="h-5 w-5 text-yellow-500" />
            ) : (
                <Moon aria-hidden="true" className="h-5 w-5 text-gray-700" />
            )}
        </button>
    );
}
