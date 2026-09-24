'use client';

import { createContext, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Type } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    TAILLES,
    appliquerAffichage,
    lireAffichage,
    type Affichage,
} from '@/lib/affichage';

/*
 * La barre de navigation porte deux boutons « Affichage », un par disposition
 * (`nav-large` / `nav-compacte`, app/globals.css) — l'autre est en
 * display: none. Or grossir ou espacer le texte fait justement basculer la
 * barre d'une disposition à l'autre, fenêtre ouverte. Accrochée à son propre
 * bouton, la fenêtre se retrouvait accrochée à un élément masqué — un
 * rectangle vide en haut à gauche — et traversait l'écran.
 *
 * D'où une seule fenêtre pour les deux boutons, accrochée à celui qui est
 * affiché au moment où elle se place. Elle reste montée pendant la bascule,
 * si bien que le focus reste sur le réglage qu'on vient de changer.
 *
 * Les boutons portent l'identifiant de leur fenêtre : la page peut compter
 * plus d'une barre (en développement, le rendu en flux en laisse une copie
 * masquée), et chaque fenêtre ne doit chercher que les siens.
 */
const BOUTON = 'data-affichage-bouton';
const FenetreId = createContext('');

function selecteur(fenetre: string): string {
    return `[${BOUTON}="${CSS.escape(fenetre)}"]`;
}

function boutonVisible(fenetre: string): HTMLElement | null {
    return (
        Array.from(document.querySelectorAll<HTMLElement>(selecteur(fenetre))).find(
            (b) => b.getClientRects().length > 0,
        ) ?? null
    );
}

/**
 * La fenêtre « Affichage » du site public : taille du texte, espacement du
 * texte, contraste renforcé, animations réduites (lib/affichage.ts). Elle
 * entoure la barre de navigation, qui place un `AffichageBouton` dans chacune
 * de ses dispositions.
 *
 * Un site pour des personnes malvoyantes ne peut pas compter sur le seul
 * zoom du navigateur : beaucoup de visiteurs ne savent pas qu'il existe, et
 * il agrandit aussi la mise en page. Ici le texte grandit et la page se
 * réorganise autour.
 *
 * Des contrôles natifs (boutons radio, cases à cocher) plutôt que des
 * composants dessinés : ce sont ceux que les lecteurs d'écran et la
 * navigation au clavier connaissent le mieux. Libellés en toutes lettres,
 * cibles larges.
 */
export function AffichageSettings({ children }: { children: ReactNode }) {
    const [etat, setEtat] = useState<Affichage | null>(null);
    const id = useId();
    const ancre = useMemo(
        () => ({
            current: {
                getBoundingClientRect: () => boutonVisible(id)?.getBoundingClientRect() ?? new DOMRect(),
            },
        }),
        [id],
    );
    // Fermée par un clic ou un Tab ailleurs : le focus n'est pas ramené au
    // bouton, le visiteur est déjà passé à autre chose (ce que fait Radix).
    const fermeeDehors = useRef(false);

    // Relu à l'ouverture plutôt qu'au rendu : le serveur ne connaît pas ces
    // réglages, et les lire pendant l'hydratation ferait diverger le HTML.
    const onOpenChange = (open: boolean) => {
        if (!open) return;
        fermeeDehors.current = false;
        setEtat(lireAffichage());
    };

    const changer = (partiel: Partial<Affichage>) => {
        if (!etat) return;
        const suivant = { ...etat, ...partiel };
        appliquerAffichage(suivant);
        setEtat(suivant);
    };

    return (
        <Popover onOpenChange={onOpenChange}>
            <PopoverAnchor virtualRef={ancre} />
            <FenetreId.Provider value={id}>{children}</FenetreId.Provider>
            <PopoverContent
                align="end"
                className="w-80 p-5 text-base"
                onInteractOutside={(e) => {
                    // Radix ne retient qu'un bouton, le dernier monté : un clic
                    // sur l'autre passerait pour un clic dehors, fermerait la
                    // fenêtre et la rouvrirait aussitôt.
                    if (e.target instanceof Element && e.target.closest(selecteur(id))) {
                        e.preventDefault();
                        return;
                    }
                    fermeeDehors.current = true;
                }}
                onCloseAutoFocus={(e) => {
                    // Même raison : le focus revient au bouton affiché, pas à
                    // celui que Radix a retenu.
                    e.preventDefault();
                    if (!fermeeDehors.current) boutonVisible(id)?.focus();
                }}
            >
                {etat && (
                    <div className="space-y-5">
                        <fieldset>
                            <legend className="mb-2 font-semibold text-gray-900 dark:text-white">Taille du texte</legend>
                            <div className="grid grid-cols-3 gap-2">
                                {TAILLES.map((t, i) => (
                                    <label
                                        key={t.value}
                                        className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-gray-300 px-2 py-2 text-center text-sm text-gray-800 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-600 dark:border-gray-600 dark:text-gray-100 dark:has-[:checked]:border-blue-400 dark:has-[:checked]:bg-blue-950"
                                    >
                                        <input
                                            type="radio"
                                            name={`${id}-taille`}
                                            value={t.value}
                                            checked={etat.taille === t.value}
                                            onChange={() => changer({ taille: t.value })}
                                            className="sr-only"
                                        />
                                        <span aria-hidden="true" className="font-bold leading-none" style={{ fontSize: `${1 + i * 0.3}rem` }}>
                                            A
                                        </span>
                                        {t.label}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={etat.espacement}
                                onChange={(e) => changer({ espacement: e.target.checked })}
                                className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900 dark:text-white">Espacer le texte</span>
                                <span className="block text-sm text-gray-700 dark:text-gray-300">
                                    Plus d&apos;air entre les lignes, les mots et les lettres.
                                </span>
                            </span>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={!!etat.contraste}
                                onChange={(e) => changer({ contraste: e.target.checked })}
                                className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900 dark:text-white">Contraste renforcé</span>
                                <span className="block text-sm text-gray-700 dark:text-gray-300">
                                    Fonds unis, textes plus foncés, liens soulignés.
                                </span>
                            </span>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={etat.animationsReduites}
                                onChange={(e) => changer({ animationsReduites: e.target.checked })}
                                className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900 dark:text-white">Réduire les animations</span>
                                <span className="block text-sm text-gray-700 dark:text-gray-300">
                                    Coupe les transitions et les fondus, même discrets.
                                </span>
                            </span>
                        </label>

                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Ces réglages sont gardés sur cet appareil.
                        </p>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

/** Le bouton qui ouvre la fenêtre — un dans chaque disposition de la barre. */
export function AffichageBouton() {
    const fenetre = useContext(FenetreId);
    return (
        <PopoverTrigger asChild>
            <button
                type="button"
                {...{ [BOUTON]: fenetre }}
                // Contains the visible word, so voice control (« cliquer
                // Affichage ») still finds it — WCAG 2.5.3.
                aria-label="Réglages d'affichage"
                className="flex items-center gap-2 p-2 rounded-lg bg-muted hover:bg-accent transition-colors duration-200 text-foreground font-medium"
            >
                <Type aria-hidden="true" className="h-5 w-5" />
                {/* The word hides on a phone, where the bar also holds the
                    logo, the theme switch and the menu button. */}
                <span className="hidden sm:inline">Affichage</span>
            </button>
        </PopoverTrigger>
    );
}
