'use client';

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

const FrontendNavbar: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <div className="w-full">
            {/* Top banner image with black sides */}
            <div className="relative w-full bg-black">
                <div className="max-w-4xl mx-auto px-4 sm:px-6"> {/* Matching the main content width and padding */}
                    <div className="relative">
                        <a href="/"> <img
                            src="/eca_logo.png"
                            alt="Banner"
                            className="w-full h-auto"
                        /></a>
                    </div>
                </div>
            </div>

            {/* Navigation bar */}
            <nav className="bg-[#4B9AD3] text-white py-4">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <div className="flex justify-between items-center">
                        {/* Desktop menu */}
                        <div className="hidden md:flex space-x-6">
                            <a href="/catalogue" className="hover:text-gray-200">Catalogue</a>
                            <a href="/coups_de_coeur" className="hover:text-gray-200">Coups de Cœur</a>
                            <a href="/derniers_infos" className="hover:text-gray-200">Derniéres infos</a>
                            <a href="/contact" className="hover:text-gray-200">Contact</a>
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
                            <a href="/catalogue" className="block hover:text-gray-200">Catalogue</a>
                            <a href="/coups_de_coeur" className="block hover:text-gray-200">Coups de Coeur</a>
                            <a href="/derniers_infos" className="block hover:text-gray-200">Derniéres infos</a>
                            <a href="/contact" className="block hover:text-gray-200">Contact</a>
                        </div>
                    )}
                </div>
            </nav>
        </div>
    );
};

export default FrontendNavbar;