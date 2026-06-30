'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface NavItem {
    href: string;
    label: string;
    icon: string;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

const navGroups: NavGroup[] = [
    {
        label: 'Livres',
        items: [
            { href: '/admin/books', label: 'Catalogue', icon: '📚' },
            { href: '/admin/genres', label: 'Genres', icon: '🏷️' },
            { href: '/admin/manage_coups_de_coeur', label: 'Listes de livres', icon: '⭐' },
        ],
    },
    {
        label: 'Gestion',
        items: [
            { href: '/admin/orders', label: 'Demandes', icon: '📋' },
            { href: '/admin/assignments', label: 'Attributions', icon: '🔗' },
            { href: '/admin/bills', label: 'Factures', icon: '💰' },
            { href: '/admin/payments', label: 'Paiements', icon: '💳' },
        ],
    },
    {
        label: 'Membres',
        items: [
            { href: '/admin/users/auditeurs', label: 'Auditeurs', icon: '👤' },
            { href: '/admin/users/lecteurs', label: 'Lecteurs', icon: '👥' },
            { href: '/admin/users/bienfaiteurs', label: 'Donateurs', icon: '💝' },
            { href: '/admin/users/permanents', label: 'Permanents', icon: '🔑' },
        ],
    },
];

const BackendNavbar: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [mobileGroup, setMobileGroup] = useState<number | null>(null);

    const toggleMobileGroup = (index: number) => {
        setMobileGroup((prev) => (prev === index ? null : index));
    };

    const closeAll = () => {
        setIsMenuOpen(false);
        setMobileGroup(null);
    };

    return (
        <nav className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between gap-4 h-16">
                    {/* Brand */}
                    <Link
                        href="/admin"
                        onClick={closeAll}
                        className="text-xl font-bold bg-gradient-to-r from-blue-500 to-blue-700 dark:from-blue-300 dark:to-blue-500 bg-clip-text text-transparent tracking-wide whitespace-nowrap"
                    >
                        Administration
                    </Link>

                    {/* Desktop navigation — hover-triggered dropdowns */}
                    <div className="hidden lg:flex items-center gap-1 flex-1">
                        {navGroups.map((group) => (
                            <div key={group.label} className="relative group">
                                <span className="flex items-center gap-2 px-4 py-2 rounded-md text-foreground/80 font-medium cursor-pointer select-none hover:text-foreground hover:bg-accent transition-colors duration-100">
                                    {group.label}
                                    <ChevronDown
                                        size={14}
                                        className="opacity-70 transition-transform duration-100 group-hover:rotate-180"
                                    />
                                </span>

                                {/* pt-2 keeps a hover bridge between trigger and panel */}
                                <div className="absolute hidden group-hover:block top-full left-0 z-50 pt-2">
                                    <div className="min-w-[220px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
                                        {group.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={closeAll}
                                                className="flex items-center gap-3 px-4 py-3 text-foreground/80 hover:bg-accent hover:text-foreground transition-colors duration-100"
                                            >
                                                <span className="text-lg" aria-hidden="true">{item.icon}</span>
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}

                        <Link
                            href="/admin/news"
                            onClick={closeAll}
                            className="px-4 py-2 rounded-md text-foreground/80 font-medium hover:text-foreground hover:bg-accent transition-colors duration-100"
                        >
                            Dernières infos
                        </Link>
                    </div>

                    {/* Desktop right-aligned actions */}
                    <div className="hidden lg:flex items-center gap-3">
                        <Link
                            href="/admin/profile"
                            onClick={closeAll}
                            className="px-4 py-2 rounded-md text-foreground/80 font-medium hover:text-foreground hover:bg-accent transition-colors duration-100"
                        >
                            Mon Compte
                        </Link>
                        <Link
                            href="/"
                            onClick={closeAll}
                            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold shadow-sm hover:opacity-90 transition-opacity duration-100"
                        >
                            Site principal
                        </Link>
                        <ThemeToggle />
                    </div>

                    {/* Mobile actions */}
                    <div className="flex items-center gap-2 lg:hidden">
                        <ThemeToggle />
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen((open) => !open)}
                            aria-label="Ouvrir le menu"
                            aria-expanded={isMenuOpen}
                            className="h-11 w-11 flex items-center justify-center rounded-lg text-foreground hover:bg-accent transition-colors duration-100"
                        >
                            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>

                {/* Mobile menu — click-toggled dropdowns */}
                {isMenuOpen && (
                    <div className="lg:hidden pb-4 space-y-1">
                        {navGroups.map((group, index) => (
                            <div key={group.label}>
                                <button
                                    type="button"
                                    onClick={() => toggleMobileGroup(index)}
                                    aria-expanded={mobileGroup === index}
                                    className="w-full flex items-center justify-between min-h-11 px-4 py-2.5 rounded-lg text-foreground font-medium hover:bg-accent transition-colors duration-100"
                                >
                                    <span>{group.label}</span>
                                    <ChevronDown
                                        size={16}
                                        className={`transition-transform duration-100 ${mobileGroup === index ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {mobileGroup === index && (
                                    <div className="pl-4 mt-1 mb-2 space-y-1 border-l-2 border-border ml-3">
                                        {group.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={closeAll}
                                                className="flex items-center gap-3 min-h-11 px-4 py-2.5 rounded-lg text-foreground/80 hover:bg-accent hover:text-foreground transition-colors duration-100"
                                            >
                                                <span className="text-lg" aria-hidden="true">{item.icon}</span>
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        <Link
                            href="/admin/news"
                            onClick={closeAll}
                            className="flex items-center min-h-11 px-4 py-2.5 rounded-lg text-foreground/80 font-medium hover:bg-accent hover:text-foreground transition-colors duration-100"
                        >
                            Dernières infos
                        </Link>
                        <Link
                            href="/admin/profile"
                            onClick={closeAll}
                            className="flex items-center min-h-11 px-4 py-2.5 rounded-lg text-foreground/80 font-medium hover:bg-accent hover:text-foreground transition-colors duration-100"
                        >
                            Mon Compte
                        </Link>
                        <Link
                            href="/"
                            onClick={closeAll}
                            className="flex items-center justify-center min-h-11 px-4 py-2.5 mt-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity duration-100"
                        >
                            Site principal
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default BackendNavbar;