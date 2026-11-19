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

// ─── Tant que la fenêtre d'impression est ouverte ───────────────────────────
//
// Chrome FERME sa fenêtre d'impression dès que la page qui l'a ouverte enregistre
// une navigation — y compris un simple `history.replaceState`. Or un
// `router.refresh()` de Next se termine justement par un replaceState. Envoyer
// une demande de paiement puis rafraîchir la liste derrière la fenêtre faisait
// donc apparaître l'aperçu et le refermait aussitôt — dès que le rafraîchissement
// arrivait après lui, c'est-à-dire en production, où le serveur répond moins
// vite qu'en local.
//
// `print()` sur l'iframe d'un PDF ne bloque pas : il rend la main pendant que la
// fenêtre est encore ouverte. Tout ce qui peut naviguer (router.refresh,
// router.push, fermer un modal qui modifie l'URL) attend donc `whenPrintDialogClosed`.
//
// La fermeture se devine : `afterprint` quand le navigateur l'émet ; sinon le
// premier clic ou la première touche dans la page — la fenêtre d'impression est
// modale, la page ne reçoit rien tant qu'elle est ouverte ; au pire, le délai
// de nettoyage.

let pendingDialog: Promise<void> | null = null;

const watchDialog = (win: Window): Promise<void> => {
    const closed = new Promise<void>((resolve) => {
        let timer = 0;
        const done = () => {
            window.clearTimeout(timer);
            win.removeEventListener('afterprint', done);
            window.removeEventListener('pointerdown', done, true);
            window.removeEventListener('keydown', done, true);
            resolve();
        };
        win.addEventListener('afterprint', done);
        window.addEventListener('pointerdown', done, true);
        window.addEventListener('keydown', done, true);
        timer = window.setTimeout(done, CLEANUP_TIMEOUT_MS);
    });
    const tracked = closed.then(() => {
        if (pendingDialog === tracked) pendingDialog = null;
    });
    pendingDialog = tracked;
    return tracked;
};

/**
 * Résout quand aucune fenêtre d'impression ouverte par printPdfBlob n'est plus
 * à l'écran — tout de suite s'il n'y en a pas. À attendre avant tout
 * `router.refresh()` (ou autre navigation) qui suit une impression.
 */
export const whenPrintDialogClosed = (): Promise<void> => pendingDialog ?? Promise.resolve();

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
                // Avant print() : là où print() bloque, afterprint part avant
                // qu'il ne rende la main.
                watchDialog(win);
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
