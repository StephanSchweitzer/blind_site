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
        <div className="w-full relative z-50">
            {/* Top banner image - adjusted for light mode */}
            <div className="relative w-full bg-gradient-to-b from-gray-100 via-gray-50 to-transparent dark:from-black dark:via-gray-900 dark:to-transparent">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <div className="relative">
                        <Link href="/" className="block">
                            <Image
                                src="/eca_logo.png"
                                alt="Banner"
                                className="w-full h-auto hover:opacity-90 transition-opacity duration-300"
                                width={1024}
                                height={200}
                                priority
                            />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Navigation bar - increased text size to text-lg */}
            <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-white/10 text-gray-900 dark:text-white py-4 w-full shadow-lg transition-colors duration-300">
                <div className="w-full px-4 sm:px-6">
                    <div className="flex justify-between items-center">
                        {/* Desktop menu - increased from text-base to text-lg */}
                        <div className="hidden lg:flex lg:flex-nowrap space-x-6 text-lg flex-1 justify-center">
                            {navLinks.map((link, index) => (
                                <div key={`${link.href}-${index}`} className="relative group whitespace-nowrap">
                                    {link.dropdown ? (
                                        <div className="flex items-center cursor-pointer group">
                                            <span className="hover:text-gray-900 dark:hover:text-white text-gray-700 dark:text-gray-200 transition-colors duration-200 flex items-center py-2 border-b-2 border-transparent hover:border-purple-500">
                                                {link.label}
                                                <ChevronDown size={16} className="ml-1 transition-transform duration-200 group-hover:rotate-180" />
                                            </span>
                                            {/* Desktop dropdown menu */}
                                            <div className="absolute hidden group-hover:block top-full left-0 z-50 pt-2">
                                                <div className="backdrop-blur-lg bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-white/20 rounded-lg min-w-[220px] py-2 shadow-2xl">
                                                    {link.dropdown.map((dropdownItem) => (
                                                        <Link
                                                            key={dropdownItem.href}
                                                            href={dropdownItem.href}
                                                            className="block px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/10 whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white"
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
                                            className="hover:text-gray-900 dark:hover:text-white text-gray-700 dark:text-gray-200 transition-colors duration-200 py-2 border-b-2 border-transparent hover:border-purple-500 inline-block"
                                        >
                                            {link.label}
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Theme toggle - Desktop */}
                        <div className="hidden lg:block">
                            <ThemeToggle />
                        </div>

                        {/* Mobile menu button and theme toggle */}
                        <div className="lg:hidden flex items-center space-x-3">
                            <ThemeToggle />
                            <button
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors duration-200"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                aria-label="Toggle menu"
                            >
                                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    {isMenuOpen && (
                        <div className="lg:hidden mt-4 space-y-2 backdrop-blur-lg bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-white/10">
                            {navLinks.map((link, index) => (
                                <div key={`mobile-${link.href}-${index}`}>
                                    {link.dropdown ? (
                                        <div>
                                            <div
                                                className="flex items-center justify-between cursor-pointer py-2 px-3 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors duration-200 text-base"
                                                onClick={() => handleDropdownToggle(index)}
                                            >
                                                <span>{link.label}</span>
                                                <ChevronDown
                                                    size={16}
                                                    className={`transition-transform duration-200 ${activeDropdown === index ? 'rotate-180' : ''}`}
                                                />
                                            </div>
                                            {activeDropdown === index && (
                                                <div className="pl-4 mt-2 space-y-2 border-l-2 border-purple-400/50 ml-3">
                                                    {link.dropdown.map((dropdownItem) => (
                                                        <Link
                                                            key={dropdownItem.href}
                                                            href={dropdownItem.href}
                                                            className="block py-2 px-3 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg hover:text-gray-900 dark:hover:text-white text-gray-700 dark:text-gray-200 transition-colors duration-200 text-base"
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
                                            className="block py-2 px-3 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg hover:text-gray-900 dark:hover:text-white text-gray-700 dark:text-gray-200 transition-colors duration-200 text-base"
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
        </div>
    );
};

export default FrontendNavbar;