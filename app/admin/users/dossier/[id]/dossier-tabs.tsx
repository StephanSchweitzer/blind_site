'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DossierTabsProps {
    userId: number;
    memberType: string;
}

const TABS = [
    { slug: 'demandes', label: 'Demandes' },
    { slug: 'factures', label: 'Factures' },
    { slug: 'paiements', label: 'Paiements' },
    { slug: 'affectations', label: 'Attributions' },
];

/**
 * Les onglets qui ont un sens pour ce type de membre : un lecteur n'a ni
 * demandes ni factures, un donateur ne fait que des paiements. Tout autre type
 * (permanent, trésorière…) garde les quatre.
 */
function tabsFor(memberType: string) {
    const slugs =
        memberType === 'auditeur' || memberType === 'ecouteur'
            ? ['demandes', 'factures', 'paiements', 'affectations']
            : memberType === 'lecteur'
                ? ['affectations', 'paiements']
                : memberType === 'bienfaiteur'
                    ? ['paiements']
                    : null;
    return slugs ? TABS.filter((t) => slugs.includes(t.slug)).sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug)) : TABS;
}

export default function DossierTabs({ userId, memberType }: DossierTabsProps) {
    const pathname = usePathname();
    const tabs = tabsFor(memberType);
    const base = `/admin/users/dossier/${userId}`;

    return (
        <nav className="flex flex-wrap gap-1 border-b border-border">
            {tabs.map((tab) => {
                const href = `${base}/${tab.slug}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                    <Link
                        prefetch={false}
                        key={tab.slug}
                        href={href}
                        className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                            active
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </nav>
    );
}