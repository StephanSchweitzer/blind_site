/**
 * Réglages d'affichage du site public — taille du texte, contraste renforcé,
 * animations réduites (bouton « Affichage » de la barre de navigation,
 * components/AffichageSettings.tsx).
 *
 * Ils vivent sur <html>, en attributs, et le CSS fait le reste
 * (app/globals.css, « Réglages d'affichage »). Chaque règle y est bornée aux
 * pages qui portent la navigation publique (`:has(#navigation-principale)`) :
 * un permanent qui a grossi le texte en consultant le catalogue retrouve un
 * back-office à sa taille normale, dont les tableaux ne sont pas prévus pour.
 *
 * Mémorisés dans le navigateur (localStorage) : c'est un confort de lecture
 * propre à un appareil, pas une donnée à garder côté serveur. Tout accès est
 * sous try/catch — navigation privée, stockage bloqué — et l'échec ne coûte
 * que le souvenir du réglage.
 */

export const AFFICHAGE_STORAGE_KEY = 'eca-affichage';

export type TailleTexte = 'normale' | 'grande' | 'tres-grande';

export type Affichage = {
    taille: TailleTexte;
    /** null : suivre l'appareil (`prefers-contrast: more`). */
    contraste: boolean | null;
    animationsReduites: boolean;
};

export const TAILLES: { value: TailleTexte; label: string }[] = [
    { value: 'normale', label: 'Normale' },
    { value: 'grande', label: 'Grande' },
    { value: 'tres-grande', label: 'Très grande' },
];

/**
 * Posé dans le <head> par app/layout.tsx : les attributs sont en place avant le
 * premier rendu, sans quoi la page s'afficherait en petit puis sauterait à la
 * bonne taille. Volontairement autonome (aucun import, du ES5) — il est
 * injecté tel quel, avant tout JavaScript de l'application.
 */
export const AFFICHAGE_INIT_SCRIPT = `(function(){try{
var p=JSON.parse(localStorage.getItem('${AFFICHAGE_STORAGE_KEY}')||'{}'),d=document.documentElement;
if(p.taille==='grande'||p.taille==='tres-grande')d.setAttribute('data-taille-texte',p.taille);
var c=p.contraste;if(c!==true&&c!==false)c=!!(window.matchMedia&&window.matchMedia('(prefers-contrast: more)').matches);
if(c)d.setAttribute('data-contraste','renforce');
if(p.animationsReduites)d.setAttribute('data-animations','reduites');
}catch(e){}})();`;

/** L'état en vigueur, relu sur <html> — ce que le script a posé ou ce qu'on a changé depuis. */
export function lireAffichage(): Affichage {
    const d = document.documentElement;
    const taille = d.getAttribute('data-taille-texte');
    let contraste: boolean | null = null;
    try {
        const stored = JSON.parse(localStorage.getItem(AFFICHAGE_STORAGE_KEY) || '{}');
        if (stored.contraste === true || stored.contraste === false) contraste = stored.contraste;
    } catch {
        // Pas de stockage : on s'en tient à ce que montre la page.
    }
    return {
        taille: taille === 'grande' || taille === 'tres-grande' ? taille : 'normale',
        contraste: contraste ?? d.getAttribute('data-contraste') === 'renforce',
        animationsReduites: d.getAttribute('data-animations') === 'reduites',
    };
}

/** Applique sur <html> et mémorise. */
export function appliquerAffichage(a: Affichage): void {
    const d = document.documentElement;
    if (a.taille === 'normale') d.removeAttribute('data-taille-texte');
    else d.setAttribute('data-taille-texte', a.taille);
    if (a.contraste) d.setAttribute('data-contraste', 'renforce');
    else d.removeAttribute('data-contraste');
    if (a.animationsReduites) d.setAttribute('data-animations', 'reduites');
    else d.removeAttribute('data-animations');
    try {
        localStorage.setItem(AFFICHAGE_STORAGE_KEY, JSON.stringify(a));
    } catch {
        // Réglage appliqué pour cette visite seulement.
    }
}
