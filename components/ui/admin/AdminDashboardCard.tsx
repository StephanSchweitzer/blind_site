// components/ui/admin/AdminDashboardCard.tsx
'use client';

import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';

interface AdminDashboardCardProps {
    title: string;
    count: number;
    href: string;
    buttonText: string;
    accentColor: 'blue' | 'purple' | 'green' | 'pink';
}

const colorMap = {
    blue: {
        bg: 'bg-blue-950/50',
        hoverBg: 'hover:bg-blue-900/50',
        text: 'text-blue-400',
        border: 'border-blue-900',
        button: 'border-blue-900 bg-blue-950/50 hover:bg-blue-900/50 text-blue-400'
    },
    purple: {
        bg: 'bg-purple-950/50',
        hoverBg: 'hover:bg-purple-900/50',
        text: 'text-purple-400',
        border: 'border-purple-900',
        button: 'border-purple-900 bg-purple-950/50 hover:bg-purple-900/50 text-purple-400'
    },
    green: {
        bg: 'bg-green-950/50',
        hoverBg: 'hover:bg-green-900/50',
        text: 'text-green-400',
        border: 'border-green-900',
        button: 'border-green-900 bg-green-950/50 hover:bg-green-900/50 text-green-400'
    },
    pink: {
        bg: 'bg-pink-950/50',
        hoverBg: 'hover:bg-pink-900/50',
        text: 'text-pink-400',
        border: 'border-pink-900',
        button: 'border-pink-900 bg-pink-950/50 hover:bg-pink-900/50 text-pink-400'
    }
};

export function AdminDashboardCard({
                                       title,
                                       count,
                                       href,
                                       buttonText,
                                       accentColor
                                   }: AdminDashboardCardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const colors = colorMap[accentColor];

    const handleNavigation = () => {
        window.history.pushState({ from: pathname }, '', href);
        router.push(href);
    };

    return (
        <div className={`p-6 rounded-lg border ${colors.border} ${colors.bg} ${colors.hoverBg} transition-all duration-200`}>
            <h2 className={`text-2xl font-bold mb-2 ${colors.text}`}>{title}</h2>
            <p className="text-4xl font-extrabold text-gray-100">{count}</p>
            <Button
                variant="outline"
                className={`mt-4 w-full ${colors.button} transition-all duration-200`}
                onClick={handleNavigation}
            >
                {buttonText}
            </Button>
        </div>
    );
}