'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useSession } from 'next-auth/react';

const FrontendNavbar = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { status } = useSession();
    const isAuthenticated = status === 'authenticated';

    const navLinks = [
        { href: '/catalogue', label: 'Catalogue' },
        { href: '/coups-de-coeur', label: 'Coups de Cœur' },
        { href: '/dernieres-infos', label: 'Derniéres infos' },
        { href: '/contact', label: 'Contact' },
        ...(isAuthenticated ? [{ href: '/admin', label: 'Administration' }] : [])
    ];

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
            <nav className="bg-[#0E1113] text-white py-4">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <div className="flex justify-between items-center">
                        {/* Desktop menu */}
                        <div className="hidden md:flex space-x-6">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="hover:text-gray-200"
                                >
                                    {link.label}
                                </Link>
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
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="block hover:text-gray-200"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </nav>
        </div>
    );
};

export default FrontendNavbar;