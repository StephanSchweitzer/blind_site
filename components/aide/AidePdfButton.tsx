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

function ecrireDansOnglet(onglet: Window, html: string) {
    onglet.document.open();
    onglet.document.write(html);
    onglet.document.close();
}

const PAGE_PREPARATION = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Mode d'emploi — préparation…</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f8fafc;
    color: #334155;
  }
  .conteneur { text-align: center; }
  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 16px;
    border: 4px solid hsl(221 83% 53% / 0.2);
    border-top-color: hsl(221 83% 53%);
    border-radius: 50%;
    animation: tourner 0.8s linear infinite;
  }
  @keyframes tourner { to { transform: rotate(360deg); } }
  p { margin: 0; font-size: 0.95rem; }
  .discret { margin-top: 6px; color: #94a3b8; font-size: 0.85rem; }
</style>
</head>
<body>
  <div class="conteneur">
    <div class="spinner" role="status" aria-label="Génération en cours"></div>
    <p>Génération du mode d'emploi en cours…</p>
    <p class="discret">Une centaine de pages à mettre en forme, quelques secondes suffisent.</p>
  </div>
</body>
</html>`;

function pageImpression(url: string) {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Mode d'emploi — impression</title>
<style>
  html, body { height: 100%; margin: 0; }
  iframe { border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
  <iframe src="${url}" id="pdf" title="Mode d'emploi"></iframe>
  <script>
    var frame = document.getElementById('pdf');
    frame.addEventListener('load', function () {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {}
    });
  </script>
</body>
</html>`;
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
 * « Imprimer » ouvre l'onglet de manière synchrone, dans le clic lui-même —
 * un `window.open` lancé après un `await` se fait bloquer comme popup par la
 * plupart des navigateurs. En attendant le PDF, l'onglet affiche tout de
 * suite une page d'attente (même esprit que le bouton « Préparation… ») pour
 * qu'il ne reste pas blanc pendant les quelques secondes de fabrication.
 * Une fois le blob prêt, l'onglet est réécrit avec un `<iframe>` plein cadre
 * pointant vers le PDF ; `contentWindow.print()` sur ce cadre ouvre
 * directement la boîte d'impression du PDF (naviguer l'onglet lui-même vers
 * le blob puis appeler `print()` dessus ne déclenche pas toujours
 * l'impression — le visualiseur PDF intégré l'avale). Si l'impression
 * automatique ne se déclenche pas, l'onglet reste ouvert avec le PDF affiché
 * et son icône imprimante.
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
        if (onglet) ecrireDansOnglet(onglet, PAGE_PREPARATION);
        try {
            const blob = await fabriquerPdf();
            const url = URL.createObjectURL(blob);
            if (onglet && !onglet.closed) {
                ecrireDansOnglet(onglet, pageImpression(url));
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
