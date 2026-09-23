'use client';

import { useId, useState } from 'react';
import { Type } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    TAILLES,
    appliquerAffichage,
    lireAffichage,
    type Affichage,
} from '@/lib/affichage';

/**
 * Le bouton « Affichage » du site public : taille du texte, espacement du
 * texte, contraste renforcé, animations réduites (lib/affichage.ts).
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
export function AffichageSettings() {
    const [etat, setEtat] = useState<Affichage | null>(null);
    const id = useId();

    // Relu à l'ouverture plutôt qu'au rendu : le serveur ne connaît pas ces
    // réglages, et les lire pendant l'hydratation ferait diverger le HTML.
    const onOpenChange = (open: boolean) => {
        if (open) setEtat(lireAffichage());
    };

    const changer = (partiel: Partial<Affichage>) => {
        if (!etat) return;
        const suivant = { ...etat, ...partiel };
        appliquerAffichage(suivant);
        setEtat(suivant);
    };

    return (
        <Popover onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    // Contains the visible word, so voice control (« cliquer
                    // Affichage ») still finds it — WCAG 2.5.3.
                    aria-label="Réglages d'affichage"
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 transition-colors duration-200 text-gray-800 dark:text-gray-100 font-medium"
                >
                    <Type aria-hidden="true" className="h-5 w-5" />
                    {/* The word hides on a phone, where the bar also holds the
                        logo, the theme switch and the menu button. */}
                    <span className="hidden sm:inline">Affichage</span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-5 text-base">
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
                                    Arrête le fond animé et les effets de mouvement.
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
