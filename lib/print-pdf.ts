// lib/print-pdf.ts
//
// Envoyer un PDF fraîchement généré directement à la boîte de dialogue
// d'impression du navigateur, sans passer par le dossier Téléchargements.
//
// Pourquoi une iframe et pas `window.open` : le PDF est produit *après* le clic
// (le rendu @react-pdf/renderer est asynchrone), et une fenêtre ouverte hors du
// geste utilisateur est bloquée par les bloqueurs de pop-ups. Une iframe cachée
// n'est jamais bloquée.
//
// Deux pièges, tous deux traités ici :
//  1. Révoquer l'URL blob trop tôt vide l'aperçu d'impression — le document est
//     encore lu pendant que la boîte de dialogue est ouverte. On ne nettoie donc
//     qu'après `afterprint`, ou au bout d'un long délai pour les navigateurs qui
//     ne l'émettent jamais.
//  2. Une iframe en `display:none` n'est pas garantie d'instancier le lecteur
//     PDF. Elle est donc bien dans le flux, simplement invisible.
//
// Si l'impression échoue (navigateur sans lecteur PDF intégré, iOS…), on
// retombe sur le téléchargement : mieux vaut un fichier dans les téléchargements
// qu'un bouton qui ne fait rien.

/** Délai avant de renoncer si l'iframe ne charge jamais le document. */
const LOAD_TIMEOUT_MS = 20_000;

/** Filet de sécurité pour les navigateurs qui n'émettent pas `afterprint`. */
const CLEANUP_TIMEOUT_MS = 5 * 60_000;

/** iOS et Safari n'impriment pas de manière fiable depuis une iframe. */
const printsFromIframe = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua);
    return !isIOS && !isSafari;
};

/** Repli : déposer le fichier dans les téléchargements. */
const downloadBlobUrl = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
};

const printViaIframe = (url: string) =>
    new Promise<void>((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('tabindex', '-1');
        // Visible pour le moteur de rendu, invisible pour l'utilisateur — voir
        // le piège n°2 en tête de fichier.
        iframe.style.cssText =
            'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;';

        let done = false;
        let cleanupTimer = 0;

        const cleanup = () => {
            window.clearTimeout(cleanupTimer);
            iframe.remove();
            URL.revokeObjectURL(url);
        };

        const loadTimer = window.setTimeout(() => {
            if (done) return;
            done = true;
            iframe.remove();
            reject(new Error("Le document n'a pas pu être chargé pour l'impression."));
        }, LOAD_TIMEOUT_MS);

        iframe.onload = () => {
            if (done) return;
            window.clearTimeout(loadTimer);
            try {
                const win = iframe.contentWindow;
                if (!win) throw new Error("Fenêtre d'impression indisponible.");
                win.addEventListener('afterprint', cleanup, { once: true });
                cleanupTimer = window.setTimeout(cleanup, CLEANUP_TIMEOUT_MS);
                win.focus();
                win.print();
                done = true;
                resolve();
            } catch (err) {
                done = true;
                window.clearTimeout(cleanupTimer);
                iframe.remove();
                reject(err instanceof Error ? err : new Error("Impression impossible."));
            }
        };

        iframe.onerror = () => {
            if (done) return;
            done = true;
            window.clearTimeout(loadTimer);
            iframe.remove();
            reject(new Error("Le document n'a pas pu être chargé pour l'impression."));
        };

        iframe.src = url;
        document.body.appendChild(iframe);
    });

/**
 * Ouvre la boîte de dialogue d'impression sur `blob`.
 *
 * `fileName` ne sert qu'au repli téléchargement — le nom de la tâche
 * d'impression vient du titre du PDF lui-même (`<Document title=…>`).
 *
 * Ne rejette jamais pour un simple problème d'impression : le repli
 * téléchargement est considéré comme un succès du point de vue de l'appelant.
 */
export const printPdfBlob = async (blob: Blob, fileName: string): Promise<void> => {
    const url = URL.createObjectURL(blob);

    if (!printsFromIframe()) {
        // Safari / iOS : le fichier s'ouvre dans l'aperçu, où ⌘P fonctionne.
        downloadBlobUrl(url, fileName);
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }

    try {
        await printViaIframe(url);
    } catch (err) {
        console.error('Print failed, falling back to download:', err);
        downloadBlobUrl(url, fileName);
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
};
