'use client';

import { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Action = 'telechargement' | 'impression' | null;

async function fabriquerPdf(): Promise<Blob> {
    const reponse = await fetch('/admin/aide/pdf');
    if (!reponse.ok) throw new Error(`statut ${reponse.status}`);
    return reponse.blob();
}

/**
 * Télécharge ou imprime le mode d'emploi complet en PDF.
 *
 * Le document est engendré à la demande (/admin/aide/pdf), donc l'attente est
 * réelle : une centaine de captures y passent. Un simple lien laisserait croire
 * au clic que rien ne se passe — d'où le passage par `fetch`, qui permet
 * d'afficher « Préparation… » puis de remettre les boutons en état.
 *
 * La route est derrière l'authentification : le `fetch` embarque le cookie de
 * session comme n'importe quelle navigation.
 *
 * « Imprimer » ouvre l'onglet de manière synchrone, dans le clic lui-même,
 * puis le fait pointer vers le PDF une fois prêt — un `window.open` lancé
 * après un `await` se fait bloquer comme popup par la plupart des
 * navigateurs. Le `print()` automatique est du confort en plus : s'il ne se
 * déclenche pas, l'onglet reste ouvert avec le PDF et son icône imprimante.
 */
export function AidePdfButton({ className }: { className?: string }) {
    const [enCours, setEnCours] = useState<Action>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const telecharger = async () => {
        setEnCours('telechargement');
        setErreur(null);
        try {
            const blob = await fabriquerPdf();
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
            setEnCours(null);
        }
    };

    const imprimer = async () => {
        setEnCours('impression');
        setErreur(null);
        const onglet = window.open('', '_blank');
        try {
            const blob = await fabriquerPdf();
            const url = URL.createObjectURL(blob);
            if (onglet) {
                onglet.addEventListener('load', () => onglet.print());
                onglet.location.href = url;
            }
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
        } catch {
            onglet?.close();
            setErreur("Le PDF n'a pas pu être produit. Réessayez dans un instant.");
        } finally {
            setEnCours(null);
        }
    };

    return (
        <div className={className}>
            <div className="flex items-center gap-2 sm:justify-end">
                <Button
                    type="button"
                    onClick={telecharger}
                    disabled={enCours !== null}
                    className="flex items-center gap-2"
                >
                    {enCours === 'telechargement' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Download className="h-4 w-4" aria-hidden="true" />
                    )}
                    {enCours === 'telechargement' ? 'Préparation…' : 'Télécharger en PDF'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={imprimer}
                    disabled={enCours !== null}
                    className="flex items-center gap-2"
                >
                    {enCours === 'impression' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Printer className="h-4 w-4" aria-hidden="true" />
                    )}
                    {enCours === 'impression' ? 'Préparation…' : 'Imprimer'}
                </Button>
            </div>
            <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                {erreur
                    ? erreur
                    : enCours
                      ? 'Le document est en cours de fabrication, cela prend quelques secondes.'
                      : ''}
            </p>
        </div>
    );
}
