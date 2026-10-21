import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Le bouton d'enregistrement d'un long formulaire, collé au bas de ce qui
 * défile — la fenêtre de dialogue, ou la page quand le formulaire y est posé.
 *
 * Les fiches s'ouvrent dans une fenêtre qui défile d'un bloc : sur un écran de
 * 800 px, « Mettre à jour la personne » tombait à 1 900 px, « Mettre à jour la
 * demande » à 1 400. Il fallait descendre tout le formulaire pour enregistrer
 * une seule correction faite en haut. Seul le bouton principal se colle ; une
 * suppression reste en fin de formulaire, là où on ne clique pas par mégarde.
 *
 * Deux conditions pour qu'il se colle :
 * - être un enfant direct du formulaire (ou d'un bloc aussi haut) : un élément
 *   collant ne sort jamais de son parent, et dans une petite boîte qui ne
 *   contient que les boutons, il n'avait nulle part où aller ;
 * - aucun parent jusqu'à ce qui défile ne porte d'`overflow` : un
 *   `overflow-y-auto` sans hauteur maximale ne défile pas, mais retient quand
 *   même le bouton.
 *
 * Collé, il s'arrête au-dessus du rembourrage de la fenêtre (p-6), et le
 * formulaire défilait dans ces 24 px sous lui. L'ombre pleine, couleur de la
 * carte, couvre exactement cette bande ; le `mb-6` l'empêche de recouvrir le
 * bouton de suppression qui suit quand il n'est pas collé.
 */
export function StickySubmitBar({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('sticky bottom-0 z-10 -mx-1 mb-6 border-t border-border bg-card px-1 py-3 shadow-[0_1.5rem_0_0_hsl(var(--card))]', className)}>
            {children}
        </div>
    );
}
