'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSkeletonProps {
    message?: string;
    variant?: 'frontend' | 'admin';
}

export function LoadingSkeleton({
                                    message = "Chargement...",
                                    variant = 'frontend'
                                }: LoadingSkeletonProps) {
    // Admin variant: opaque themed background so it matches the active light/dark theme
    // Frontend variant: no background, theme-aware text
    const backgroundClass = variant === 'admin'
        ? 'bg-background'
        : '';

    const textClass = variant === 'admin'
        ? 'text-foreground'
        : 'text-gray-600 dark:text-gray-400';

    return (
        <div className={`w-full h-full min-h-screen flex flex-col transition-colors duration-300 ${backgroundClass}`}>
            {/* No top bar of its own: the site-wide one (components/NavigationFeedback.tsx)
                runs from the click until this screen shows, and two would stack. */}
            {/* Center loading spinner */}
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                    <p className={`text-sm ${textClass}`}>{message}</p>
                </div>
            </div>
        </div>
    );
}