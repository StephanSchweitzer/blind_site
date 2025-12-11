'use client';

import Link from 'next/link';

interface UserTypeTabsProps {
    currentType: string;
}

export function UserTypeTabs({ currentType }: UserTypeTabsProps) {
    const tabs = [
        { key: 'lecteurs', label: 'Lecteurs' },
        { key: 'auditeurs', label: 'Auditeurs' }
    ];

    return (
        <div className="border-b border-gray-200">
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
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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