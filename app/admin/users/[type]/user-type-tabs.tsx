'use client';

import Link from 'next/link';

interface UserTypeTabsProps {
    currentType: string;
}

export function UserTypeTabs({ currentType }: UserTypeTabsProps) {
    const tabs = [
        { key: 'auditeurs', label: 'Auditeurs' },
        { key: 'lecteurs', label: 'Lecteurs' },
        { key: 'bienfaiteurs', label: 'Donateurs' },
        { key: 'permanents', label: 'Permanents' },
    ];

    return (
        <div className="border-b border-border">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => {
                    const isActive = currentType === tab.key;
                    return (
                        <Link
                            key={tab.key}
                            href={`/admin/users/${tab.key}`}
                            className={`
                                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium
                                ${isActive
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-muted-foreground hover:border-border hover:text-muted-foreground'
                            }
                            `}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}