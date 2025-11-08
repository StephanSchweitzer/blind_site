'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeToggle';

const FrontendNavbar = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const { status } = useSession();
    const isAuthenticated = status === 'authenticated';

    const navLinks = [
        { href: '/', label: 'Accueil' },
        { href: '/catalogue', label: 'Catalogue' },
        { href: '/coups-de-coeur', label: 'Listes de livres' },
        { href: '/dernieres-infos', label: 'Dernières infos' },
        { href: '/contact', label: 'Contact' },
        {
            href: '#',
            label: 'Nous connaître',
            dropdown: [
                { href: '/nous-connaitre/historique', label: 'Historique' },
                { href: '/nous-connaitre/informations-pratiques', label: 'Informations Pratiques' },
                { href: '/nous-connaitre/equipe', label: 'Equipe' }
            ]
        },
        { href: '/nous-rejoindre', label: 'Nous rejoindre' },
        ...(isAuthenticated ? [{ href: '/admin', label: 'Administration' }] : [])
    ];

    const handleDropdownToggle = (index: number): void => {
        if (activeDropdown === index) {
            setActiveDropdown(null);
        } else {
            setActiveDropdown(index);
        }
    };

    return (
        <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/95 dark:bg-gray-900/90 border-b-2 border-blue-200 dark:border-purple-500/30 text-gray-900 dark:text-white shadow-lg transition-all duration-300">
            <div className="w-full px-4 sm:px-6">
                <div className="flex justify-between items-center py-3">
                    {/* Small logo on left - visible on desktop */}
                    <div className="hidden lg:block">
                        <Link href="/" className="block">
                            <Image
                                src="/eca_logo.png"
                                alt="ECA"
                                className="h-12 w-auto hover:opacity-90 transition-opacity duration-300"
                                width={150}
                                height={48}
                                priority
                            />
                        </Link>
                    </div>

                    {/* Desktop menu - centered with better spacing */}
                    <div className="hidden lg:flex lg:flex-nowrap space-x-6 text-base flex-1 justify-center">
                        {navLinks.map((link, index) => (
                            <div key={`${link.href}-${index}`} className="relative group whitespace-nowrap">
                                {link.dropdown ? (
                                    <div className="flex items-center cursor-pointer group">
                                        <span className="hover:text-blue-600 dark:hover:text-purple-400 text-gray-700 dark:text-gray-200 transition-colors duration-200 flex items-center py-2 border-b-2 border-transparent hover:border-blue-500 dark:hover:border-purple-400 font-medium">
                                            {link.label}
                                            <ChevronDown size={16} className="ml-1 transition-transform duration-200 group-hover:rotate-180" />
                                        </span>
                                        {/* Desktop dropdown menu */}
                                        <div className="absolute hidden group-hover:block top-full left-0 z-50 pt-2">
                                            <div className="backdrop-blur-lg bg-white/98 dark:bg-gray-900/95 border-2 border-blue-200 dark:border-purple-500/30 rounded-xl min-w-[240px] py-2 shadow-2xl">
                                                {link.dropdown.map((dropdownItem) => (
                                                    <Link
                                                        key={dropdownItem.href}
                                                        href={dropdownItem.href}
                                                        className="block px-5 py-3 hover:bg-blue-50 dark:hover:bg-white/10 whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-purple-400 font-medium"
                                                    >
                                                        {dropdownItem.label}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <Link
                                        href={link.href}
                                        className="hover:text-blue-600 dark:hover:text-purple-400 text-gray-700 dark:text-gray-200 transition-colors duration-200 py-2 border-b-2 border-transparent hover:border-blue-500 dark:hover:border-purple-400 inline-block font-medium"
                                    >
                                        {link.label}
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Theme toggle - Desktop (right side) */}
                    <div className="hidden lg:block">
                        <ThemeToggle />
                    </div>

                    {/* Mobile: Logo + Theme toggle + Menu button */}
                    <div className="lg:hidden flex items-center justify-between w-full">
                        {/* Small logo on mobile */}
                        <Link href="/" className="block">
                            <Image
                                src="/eca_logo.png"
                                alt="ECA"
                                className="h-10 w-auto"
                                width={120}
                                height={40}
                                priority
                            />
                        </Link>

                        <div className="flex items-center space-x-3">
                            <ThemeToggle />
                            <button
                                className="p-2 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg transition-colors duration-200"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                aria-label="Toggle menu"
                            >
                                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                {isMenuOpen && (
                    <div className="lg:hidden mt-4 mb-4 space-y-2 backdrop-blur-lg bg-white/95 dark:bg-gray-800/90 rounded-xl p-4 border-2 border-blue-200 dark:border-purple-500/30 shadow-xl">
                        {navLinks.map((link, index) => (
                            <div key={`mobile-${link.href}-${index}`}>
                                {link.dropdown ? (
                                    <div>
                                        <div
                                            className="flex items-center justify-between cursor-pointer py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg transition-colors duration-200 text-base font-medium"
                                            onClick={() => handleDropdownToggle(index)}
                                        >
                                            <span>{link.label}</span>
                                            <ChevronDown
                                                size={16}
                                                className={`transition-transform duration-200 ${activeDropdown === index ? 'rotate-180' : ''}`}
                                            />
                                        </div>
                                        {activeDropdown === index && (
                                            <div className="pl-4 mt-2 space-y-2 border-l-2 border-blue-400 dark:border-purple-400 ml-3">
                                                {link.dropdown.map((dropdownItem) => (
                                                    <Link
                                                        key={dropdownItem.href}
                                                        href={dropdownItem.href}
                                                        className="block py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg hover:text-blue-600 dark:hover:text-purple-400 text-gray-700 dark:text-gray-200 transition-colors duration-200 text-base font-medium"
                                                    >
                                                        {dropdownItem.label}
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Link
                                        href={link.href}
                                        className="block py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg hover:text-blue-600 dark:hover:text-purple-400 text-gray-700 dark:text-gray-200 transition-colors duration-200 text-base font-medium"
                                    >
                                        {link.label}
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </nav>
    );
};

export default FrontendNavbar;