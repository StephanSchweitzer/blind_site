'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SkipLinks } from '@/components/SkipLinks';
import { AffichageBouton, AffichageSettings } from '@/components/AffichageSettings';

/**
 * Le logo de la barre : le monogramme « eca » en image, et le nom en texte.
 *
 * L'ancien logo était une seule image, mots compris : sur un téléphone,
 * « Délégation des Auxiliaires des Aveugles » y tombait à 6 px, illisible, et
 * ne grandissait pas avec le réglage « Taille du texte ». Ici le nom est du
 * vrai texte, qui suit la taille choisie. Le monogramme a un fond blanc : il
 * est posé sur une pastille blanche, voulue, qui tient aussi en thème sombre.
 *
 * Dans la barre complète, le nom n'apparaît qu'à partir de 1536 px : en
 * dessous, il serrait le menu (surtout avec le lien « Administration »), et le
 * monogramme seul y reste lisible. Sur téléphone, il est toujours là.
 */
function EcaLogo({ nameFrom2xl = false }: { nameFrom2xl?: boolean }) {
    return (
        <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 ring-1 ring-border">
                <Image src="/eca_mark.png" alt="" aria-hidden="true" width={40} height={36} className="h-auto w-full" priority />
            </span>
            <span className={`${nameFrom2xl ? 'hidden 2xl:block' : 'block'} text-[0.8125rem] font-semibold leading-[1.15] text-foreground`}>
                {/* Trois lignes voulues, coupées au sens : le nom tient ainsi à côté du
                    menu complet, sans se casser au hasard. */}
                <span className="block whitespace-nowrap">Enregistrements</span>
                <span className="block whitespace-nowrap">à la Carte</span>
                <span className="block whitespace-nowrap">pour les Aveugles</span>
            </span>
        </span>
    );
}

type NavLink = {
    href: string;
    label: string;
    dropdown?: { href: string; label: string }[];
};

const FrontendNavbar = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const [mobileDropdown, setMobileDropdown] = useState<number | null>(null);
    const { status } = useSession();
    const isAuthenticated = status === 'authenticated';
    const pathname = usePathname();
    const menuId = useId();
    const dropdownIdBase = useId();
    const desktopNavRef = useRef<HTMLUListElement>(null);
    const mobileButtonRef = useRef<HTMLButtonElement>(null);

    const navLinks: NavLink[] = [
        { href: '/', label: 'Accueil' },
        { href: '/catalogue', label: 'Catalogue' },
        { href: '/listes-de-livres', label: 'Listes de livres' },
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

    // A submenu is "current" when the visitor is on one of its own pages, so the
    // parent entry is announced as the active branch too (RGAA 12.9).
    const isCurrent = (link: NavLink) =>
        link.dropdown
            ? link.dropdown.some(item => pathname === item.href)
            : pathname === link.href;

    const handleDropdownToggle = (index: number): void => {
        setActiveDropdown(current => (current === index ? null : index));
    };

    // Navigating away closes the menus so focus is not left inside a panel that
    // no longer relates to the page being announced. Adjusted during render
    // rather than in an effect — `react-hooks/set-state-in-effect` rejects the
    // effect form, and this avoids the extra commit anyway.
    const [lastPathname, setLastPathname] = useState(pathname);
    if (pathname !== lastPathname) {
        setLastPathname(pathname);
        setActiveDropdown(null);
        setMobileDropdown(null);
        setIsMenuOpen(false);
    }

    // Escape closes whatever is open and returns focus to the control that
    // opened it — without this a keyboard user can get stranded inside an open
    // submenu (RGAA 7.3 / WCAG 2.1.2).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (activeDropdown !== null) {
                const trigger = desktopNavRef.current?.querySelector<HTMLButtonElement>(
                    `[data-dropdown-trigger="${activeDropdown}"]`
                );
                setActiveDropdown(null);
                trigger?.focus();
                return;
            }
            if (isMenuOpen) {
                setIsMenuOpen(false);
                setMobileDropdown(null);
                mobileButtonRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [activeDropdown, isMenuOpen]);

    // Clicking or tabbing away from an open desktop submenu closes it.
    useEffect(() => {
        if (activeDropdown === null) return;
        const onOutside = (event: Event) => {
            const target = event.target as Node | null;
            if (target && desktopNavRef.current?.contains(target)) return;
            setActiveDropdown(null);
        };
        document.addEventListener('mousedown', onOutside);
        document.addEventListener('focusin', onOutside);
        return () => {
            document.removeEventListener('mousedown', onOutside);
            document.removeEventListener('focusin', onOutside);
        };
    }, [activeDropdown]);

    const linkClasses = 'hover:text-primary dark:hover:text-blue-300 text-foreground transition-colors duration-200 py-2 border-b-2 border-transparent hover:border-primary dark:hover:border-blue-300 inline-block font-medium aria-[current=page]:border-primary dark:aria-[current=page]:border-blue-300 aria-[current=page]:text-primary dark:aria-[current=page]:text-blue-200';

    return (
        // Une seule fenêtre « Affichage » pour les deux dispositions de la barre
        // (components/AffichageSettings.tsx) ; elle ne rend rien d'autre.
        <AffichageSettings>
            <SkipLinks />

            <nav
                id="navigation-principale"
                tabIndex={-1}
                aria-label="Navigation principale"
                className="sticky top-0 z-50 bg-card border-b border-border text-foreground shadow-sm"
            >
                <div className="w-full px-4 sm:px-6">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center py-3 w-full">
                        {/* Small logo on left - visible on desktop.
                            `nav-large` / `nav-compacte` (app/globals.css) rather than
                            lg: — the full menu does not fit at 1024 px, and an
                            enlarged text pushes that width further still. */}
                        <div className="nav-large justify-start">
                            <Link href="/" className="block rounded-lg" aria-label="ECA — retour à l'accueil">
                                <EcaLogo nameFrom2xl />
                            </Link>
                        </div>

                        {/* Desktop menu - truly centered on page */}
                        <ul ref={desktopNavRef} className="nav-large flex-nowrap space-x-5 text-base justify-center list-none m-0 p-0">
                            {navLinks.map((link, index) => (
                                <li key={`${link.href}-${index}`} className="relative whitespace-nowrap">
                                    {link.dropdown ? (
                                        <div
                                            className="flex items-center"
                                            onMouseEnter={() => setActiveDropdown(index)}
                                            onMouseLeave={() => setActiveDropdown(null)}
                                        >
                                            <button
                                                type="button"
                                                data-dropdown-trigger={index}
                                                aria-expanded={activeDropdown === index}
                                                aria-controls={`${dropdownIdBase}-${index}`}
                                                aria-current={isCurrent(link) ? 'true' : undefined}
                                                onClick={() => handleDropdownToggle(index)}
                                                className={`${linkClasses} flex items-center bg-transparent`}
                                            >
                                                {link.label}
                                                <ChevronDown
                                                    size={16}
                                                    aria-hidden="true"
                                                    className={`ml-1 transition-transform duration-200 ${activeDropdown === index ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                            {/* Desktop dropdown menu */}
                                            <div
                                                id={`${dropdownIdBase}-${index}`}
                                                hidden={activeDropdown !== index}
                                                className="absolute top-full left-0 z-50 pt-2"
                                            >
                                                <ul className="bg-popover border border-border rounded-xl min-w-[240px] py-2 shadow-lg list-none m-0">
                                                    {link.dropdown.map((dropdownItem) => (
                                                        <li key={dropdownItem.href}>
                                                            <Link
                                                                href={dropdownItem.href}
                                                                aria-current={pathname === dropdownItem.href ? 'page' : undefined}
                                                                className="block px-5 py-3 hover:bg-blue-50 dark:hover:bg-white/10 whitespace-nowrap transition-colors duration-200 text-foreground hover:text-primary dark:hover:text-blue-300 font-medium aria-[current=page]:text-primary dark:aria-[current=page]:text-blue-200 aria-[current=page]:bg-blue-50 dark:aria-[current=page]:bg-white/10"
                                                            >
                                                                {dropdownItem.label}
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    ) : (
                                        <Link
                                            href={link.href}
                                            aria-current={isCurrent(link) ? 'page' : undefined}
                                            className={linkClasses}
                                        >
                                            {link.label}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {/* Display settings + theme toggle - Desktop (right side) */}
                        <div className="nav-large justify-end items-center gap-3">
                            <AffichageBouton />
                            <ThemeToggle />
                        </div>

                        {/* Mobile: Logo + Theme toggle + Menu button */}
                        <div className="nav-compacte flex items-center justify-between w-full col-span-3">
                            {/* Small logo on mobile */}
                            <Link href="/" className="block rounded-lg" aria-label="ECA — retour à l'accueil">
                                <EcaLogo />
                            </Link>

                            <div className="flex items-center space-x-3">
                                <AffichageBouton />
                                <ThemeToggle />
                                <button
                                    ref={mobileButtonRef}
                                    type="button"
                                    className="p-2 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg transition-colors duration-200"
                                    onClick={() => setIsMenuOpen(open => !open)}
                                    aria-expanded={isMenuOpen}
                                    aria-controls={menuId}
                                    aria-label={isMenuOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation'}
                                >
                                    {isMenuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    <div id={menuId} hidden={!isMenuOpen}>
                        <ul className="nav-compacte mt-4 mb-4 space-y-2 bg-card rounded-xl p-4 border border-border shadow-md list-none">
                            {navLinks.map((link, index) => (
                                <li key={`mobile-${link.href}-${index}`}>
                                    {link.dropdown ? (
                                        <div>
                                            <button
                                                type="button"
                                                aria-expanded={mobileDropdown === index}
                                                aria-controls={`${menuId}-sub-${index}`}
                                                aria-current={isCurrent(link) ? 'true' : undefined}
                                                className="w-full flex items-center justify-between py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg transition-colors duration-200 text-base font-medium text-left"
                                                onClick={() => setMobileDropdown(current => (current === index ? null : index))}
                                            >
                                                <span>{link.label}</span>
                                                <ChevronDown
                                                    size={16}
                                                    aria-hidden="true"
                                                    className={`transition-transform duration-200 ${mobileDropdown === index ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                            <ul
                                                id={`${menuId}-sub-${index}`}
                                                hidden={mobileDropdown !== index}
                                                className="pl-4 mt-2 space-y-2 border-l-2 border-primary/40 ml-3 list-none"
                                            >
                                                {link.dropdown.map((dropdownItem) => (
                                                    <li key={dropdownItem.href}>
                                                        <Link
                                                            href={dropdownItem.href}
                                                            aria-current={pathname === dropdownItem.href ? 'page' : undefined}
                                                            className="block py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg hover:text-primary dark:hover:text-blue-300 text-foreground transition-colors duration-200 text-base font-medium aria-[current=page]:text-primary dark:aria-[current=page]:text-blue-200"
                                                        >
                                                            {dropdownItem.label}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : (
                                        <Link
                                            href={link.href}
                                            aria-current={isCurrent(link) ? 'page' : undefined}
                                            className="block py-2.5 px-4 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg hover:text-primary dark:hover:text-blue-300 text-foreground transition-colors duration-200 text-base font-medium aria-[current=page]:text-primary dark:aria-[current=page]:text-blue-200"
                                        >
                                            {link.label}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </nav>
        </AffichageSettings>
    );
};

export default FrontendNavbar;
