'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <button className="p-2 rounded-lg bg-white/10 dark:bg-white/10 w-10 h-10" aria-label="Toggle theme">
                <div className="w-5 h-5" />
            </button>
        );
    }

    return (
        <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 transition-colors duration-200"
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-yellow-500" />
            ) : (
                <Moon className="h-5 w-5 text-gray-700" />
            )}
        </button>
    );
}