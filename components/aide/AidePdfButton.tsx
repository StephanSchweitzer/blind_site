'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Télécharge le mode d'emploi complet en PDF.
 *
 * Le document est engendré à la demande (/admin/aide/pdf), donc l'attente est
 * réelle : une centaine de captures y passent. Un simple lien laisserait croire
 * au clic que rien ne se passe — d'où le passage par `fetch`, qui permet
 * d'afficher « Préparation… » puis de remettre le bouton en état.
 *
 * La route est derrière l'authentification : le `fetch` embarque le cookie de
 * session comme n'importe quelle navigation.
 */
export function AidePdfButton({ className }: { className?: string }) {
    const [enCours, setEnCours] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    const telecharger = async () => {
        setEnCours(true);
        setErreur(null);
        try {
            const reponse = await fetch('/admin/aide/pdf');
            if (!reponse.ok) throw new Error(`statut ${reponse.status}`);

            const blob = await reponse.blob();
            const url = URL.createObjectURL(blob);
            const lien = document.createElement('a');
            lien.href = url;
            lien.download = `mode-d-emploi-arbre-rose-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(lien);
            lien.click();
            lien.remove();
            // Révoquer tout de suite viderait le téléchargement en cours sur
            // certains navigateurs ; quelques secondes suffisent largement.
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
        } catch {
            setErreur("Le PDF n'a pas pu être produit. Réessayez dans un instant.");
        } finally {
            setEnCours(false);
        }
    };

    return (
        <div className={className}>
            <Button
                type="button"
                onClick={telecharger}
                disabled={enCours}
                className="flex items-center gap-2"
            >
                {enCours ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {enCours ? 'Préparation…' : 'Télécharger en PDF'}
            </Button>
            <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                {erreur
                    ? erreur
                    : enCours
                      ? 'Le document est en cours de fabrication, cela prend quelques secondes.'
                      : "Le guide entier, captures comprises, dans un fichier à imprimer ou à garder."}
            </p>
        </div>
    );
}
