'use client';

import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { BookOpen, Theater, Newspaper, List, ShoppingCart, UserCheck, Headphones, FileText, Mic, LucideIcon } from 'lucide-react';

interface AdminDashboardCardProps {
    title: string;
    count: number;
    href: string;
    buttonText: string;
    accentColor: 'blue' | 'purple' | 'green' | 'pink' | 'yellow' | 'cyan' | 'orange' | 'red' | 'indigo' | 'teal';
}

const colorMap = {
    blue: {
        bg: 'bg-blue-950/50',
        hoverBg: 'hover:bg-blue-900/50',
        text: 'text-blue-400',
        border: 'border-blue-900',
    },
    yellow: {
        bg: 'bg-yellow-950/50',
        hoverBg: 'hover:bg-yellow-900/50',
        text: 'text-yellow-400',
        border: 'border-yellow-900',
    },
    purple: {
        bg: 'bg-purple-950/50',
        hoverBg: 'hover:bg-purple-900/50',
        text: 'text-purple-400',
        border: 'border-purple-900',
    },
    green: {
        bg: 'bg-green-950/50',
        hoverBg: 'hover:bg-green-900/50',
        text: 'text-green-400',
        border: 'border-green-900',
    },
    pink: {
        bg: 'bg-pink-950/50',
        hoverBg: 'hover:bg-pink-900/50',
        text: 'text-pink-400',
        border: 'border-pink-900',
    },
    cyan: {
        bg: 'bg-cyan-950/50',
        hoverBg: 'hover:bg-cyan-900/50',
        text: 'text-cyan-400',
        border: 'border-cyan-900',
    },
    orange: {
        bg: 'bg-orange-950/50',
        hoverBg: 'hover:bg-orange-900/50',
        text: 'text-orange-400',
        border: 'border-orange-900',
    },
    red: {
        bg: 'bg-red-950/50',
        hoverBg: 'hover:bg-red-900/50',
        text: 'text-red-400',
        border: 'border-red-900',
    },
    indigo: {
        bg: 'bg-indigo-950/50',
        hoverBg: 'hover:bg-indigo-900/50',
        text: 'text-indigo-400',
        border: 'border-indigo-900',
    },
    teal: {
        bg: 'bg-teal-950/50',
        hoverBg: 'hover:bg-teal-900/50',
        text: 'text-teal-400',
        border: 'border-teal-900',
    }
};

const iconMap: Record<string, LucideIcon> = {
    'Catalogue': BookOpen,
    'Genres': Theater,
    'Dernières infos': Newspaper,
    'Listes de livres': List,
    'Demandes': ShoppingCart,
    'Affectations': UserCheck,
    'Factures': FileText,
    'Lecteurs': Mic,
    'Auditeurs': Headphones,
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
    const Icon = iconMap[title];

    const handleNavigation = () => {
        window.history.pushState({ from: pathname }, '', href);
        router.push(href);
    };

    return (
        <div
            onClick={handleNavigation}
            className={`p-6 rounded-lg border cursor-pointer ${colors.border} ${colors.bg} ${colors.hoverBg} transition-all duration-200`}
        >
            <div className="flex items-start justify-between mb-2">
                <h2 className={`text-2xl font-bold ${colors.text}`}>{title}</h2>
                {Icon && (
                    <Icon className={`w-7 h-7 ${colors.text} opacity-70`} />
                )}
            </div>
            <p className="text-4xl font-extrabold text-gray-100">{count}</p>
            <div className={`mt-4 text-sm font-medium ${colors.text}`}>
                {buttonText} →
            </div>
        </div>
    );
}