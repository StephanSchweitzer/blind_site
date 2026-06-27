'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DossierTabsProps {
    userId: number;
}

const TABS = [
    { slug: 'commandes', label: 'Demandes' },
    { slug: 'factures', label: 'Factures' },
    { slug: 'paiements', label: 'Paiements' },
    { slug: 'affectations', label: 'Attributions' },
];

export default function DossierTabs({ userId }: DossierTabsProps) {
    const pathname = usePathname();
    const base = `/admin/users/dossier/${userId}`;

    return (
        <nav className="flex flex-wrap gap-1 border-b border-gray-800">
            {TABS.map((tab) => {
                const href = `${base}/${tab.slug}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                    <Link
                        key={tab.slug}
                        href={href}
                        className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                            active
                                ? 'border-blue-500 text-gray-100'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
                        }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </nav>
    );
}