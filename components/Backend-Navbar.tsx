import React from 'react';
import Link from 'next/link';

const BackendNavbar: React.FC = () => {
    return (
        <nav className="sticky top-0 z-50 bg-gradient-to-br from-slate-900 to-slate-800 shadow-lg border-b-2 border-slate-700">
            <div className="max-w-7xl mx-auto px-8 flex items-center gap-8">
                {/* Brand */}
                <Link
                    href="/admin"
                    className="py-5 text-xl font-bold bg-gradient-to-r from-blue-50 to-blue-100 bg-clip-text text-transparent tracking-wide hover:-translate-y-0.5 hover:brightness-125 transition-all duration-300"
                >
                    Administration
                </Link>

                {/* Main Navigation Links */}
                <div className="flex items-center gap-2 flex-1">
                    {/* Livres Dropdown */}
                    <div className="relative group">
                        <span className="flex items-center gap-2 px-5 py-3 rounded-md text-slate-200 font-medium cursor-pointer select-none hover:text-white hover:bg-white/10 transition-all duration-300">
                            Livres
                            <svg
                                className="w-3 h-3 opacity-70 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-300"
                                viewBox="0 0 12 12"
                                fill="currentColor"
                            >
                                <path d="M6 8L2 4h8z"/>
                            </svg>
                        </span>

                        {/* Dropdown Menu */}
                        <div className="absolute top-full left-0 mt-2 min-w-[220px] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 -translate-y-2 transition-all duration-300 overflow-hidden">
                            <Link
                                href="/admin/books"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">📚</span>
                                Catalogue
                            </Link>
                            <Link
                                href="/admin/genres"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">🏷️</span>
                                Genres
                            </Link>
                            <Link
                                href="/admin/manage_coups_de_coeur"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">⭐</span>
                                Listes de livres
                            </Link>
                        </div>
                    </div>

                    {/* Gestion Dropdown */}
                    <div className="relative group">
                        <span className="flex items-center gap-2 px-5 py-3 rounded-md text-slate-200 font-medium cursor-pointer select-none hover:text-white hover:bg-white/10 transition-all duration-300">
                            Gestion
                            <svg
                                className="w-3 h-3 opacity-70 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-300"
                                viewBox="0 0 12 12"
                                fill="currentColor"
                            >
                                <path d="M6 8L2 4h8z"/>
                            </svg>
                        </span>

                        {/* Dropdown Menu */}
                        <div className="absolute top-full left-0 mt-2 min-w-[220px] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 -translate-y-2 transition-all duration-300 overflow-hidden">
                            <Link
                                href="/admin/orders"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">📋</span>
                                Demandes
                            </Link>
                            <Link
                                href="/admin/assignments"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">🔗</span>
                                Affectations
                            </Link>
                            <Link
                                href="/admin/bills"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">💰</span>
                                Factures
                            </Link>
                        </div>
                    </div>

                    {/* Membres Dropdown */}
                    <div className="relative group">
                        <span className="flex items-center gap-2 px-5 py-3 rounded-md text-slate-200 font-medium cursor-pointer select-none hover:text-white hover:bg-white/10 transition-all duration-300">
                            Membres
                            <svg
                                className="w-3 h-3 opacity-70 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-300"
                                viewBox="0 0 12 12"
                                fill="currentColor"
                            >
                                <path d="M6 8L2 4h8z"/>
                            </svg>
                        </span>

                        {/* Dropdown Menu */}
                        <div className="absolute top-full left-0 mt-2 min-w-[220px] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 -translate-y-2 transition-all duration-300 overflow-hidden">
                            <Link
                                href="/admin/users/lecteurs"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">👥</span>
                                Lecteurs
                            </Link>
                            <Link
                                href="/admin/users/auditeurs"
                                className="flex items-center gap-3 px-5 py-3.5 text-slate-200 border-l-3 border-transparent hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-transparent hover:text-white hover:border-blue-500 hover:pl-6 transition-all duration-200"
                            >
                                <span className="text-lg transition-transform duration-200 group-hover:scale-110">👤</span>
                                Auditeurs
                            </Link>
                        </div>
                    </div>

                    {/* Standalone Links */}
                    <Link
                        href="/admin/news"
                        className="px-5 py-3 rounded-md text-slate-200 font-medium hover:text-white hover:bg-white/10 transition-all duration-300 relative after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-400 after:to-blue-600 hover:after:w-4/5 after:transition-all after:duration-300"
                    >
                        Dernières infos
                    </Link>
                </div>

                {/* Right-aligned Links */}
                <div className="flex items-center gap-4 ml-auto">
                    <Link
                        href="/admin/profile"
                        className="px-5 py-3 rounded-md text-slate-200 font-medium hover:text-white hover:bg-white/10 transition-all duration-300"
                    >
                        Mon Compte
                    </Link>
                    <Link
                        href="/"
                        className="px-5 py-3 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-blue-800 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-300"
                    >
                        Site principal
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default BackendNavbar;