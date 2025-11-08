'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSkeletonProps {
    message?: string;
}

export function LoadingSkeleton({ message = "Chargement..." }: LoadingSkeletonProps) {
    return (
        <div className="w-full h-full min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            {/* Top loading bar */}
            <div className="fixed top-0 left-0 w-full z-50">
                <div className="h-1 w-full bg-gray-200 dark:bg-gray-800">
                    <div
                        className="h-1 bg-blue-600 dark:bg-blue-500 w-1/3 animate-[slide_1s_ease-in-out_infinite]"
                        style={{
                            animation: 'slide 1s ease-in-out infinite',
                            background: 'linear-gradient(to right, transparent, #3B82F6, transparent)'
                        }}
                    />
                </div>
            </div>

            {/* Center loading spinner */}
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
                </div>
            </div>
        </div>
    );
}