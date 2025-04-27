'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useSession } from 'next-auth/react';

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
                { href: '/nous-connaitre/organisation', label: 'Organisation' },
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
        <div className="w-full">
            {/* Top banner image with black sides */}
            <div className="relative w-full bg-black">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <div className="relative">
                        <Link href="/">
                            <Image
                                src="/eca_logo.png"
                                alt="Banner"
                                className="w-full h-auto"
                                width={1024}
                                height={200}
                                priority
                            />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Navigation bar */}
            <nav className="bg-[#0E1113] text-white py-4 w-full">
                <div className="w-full px-4 sm:px-6">
                    <div className="flex justify-center items-center">
                        {/* Desktop menu */}
                        <div className="hidden md:flex md:flex-nowrap space-x-8 text-lg justify-between">
                            {navLinks.map((link, index) => (
                                <div key={`${link.href}-${index}`} className="relative group whitespace-nowrap">
                                    {link.dropdown ? (
                                        <div className="flex items-center cursor-pointer group">
                                            <span className="hover:text-gray-200 flex items-center">
                                                {link.label}
                                                <ChevronDown size={16} className="ml-1" />
                                            </span>
                                            {/* Desktop dropdown menu (on hover) */}
                                            <div className="absolute hidden group-hover:block top-full left-0 z-50">
                                                {/* Invisible bridge to prevent hover gap */}
                                                <div className="h-2 w-full"></div>
                                                <div className="bg-[#0E1113] border border-gray-700 rounded min-w-[200px] py-1 shadow-lg">
                                                    {link.dropdown.map((dropdownItem) => (
                                                        <Link
                                                            key={dropdownItem.href}
                                                            href={dropdownItem.href}
                                                            className="block px-4 py-2 hover:bg-gray-800 whitespace-nowrap"
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
                                            className="hover:text-gray-200"
                                        >
                                            {link.label}
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                        >
                            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>

                    {/* Mobile menu */}
                    {isMenuOpen && (
                        <div className="md:hidden mt-4 space-y-4">
                            {navLinks.map((link, index) => (
                                <div key={`mobile-${link.href}-${index}`}>
                                    {link.dropdown ? (
                                        <div>
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => handleDropdownToggle(index)}
                                            >
                                                <span>{link.label}</span>
                                                <ChevronDown
                                                    size={16}
                                                    className={`transition-transform ${activeDropdown === index ? 'rotate-180' : ''}`}
                                                />
                                            </div>
                                            {activeDropdown === index && (
                                                <div className="pl-4 mt-2 space-y-2 border-l border-gray-700">
                                                    {link.dropdown.map((dropdownItem) => (
                                                        <Link
                                                            key={dropdownItem.href}
                                                            href={dropdownItem.href}
                                                            className="block hover:text-gray-200"
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
                                            className="block hover:text-gray-200"
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