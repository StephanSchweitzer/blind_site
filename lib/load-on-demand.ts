// lib/load-on-demand.ts
//
// Charger à la demande un module lourd (@react-pdf/renderer et les documents
// PDF) sans laisser filer l'erreur brute quand la page a été ouverte avant un
// déploiement.
//
// Pourquoi : un `import()` dynamique ne télécharge son fichier qu'au clic. Une
// page ouverte depuis la veille garde en mémoire les noms de fichiers de
// l'ancienne version ; chaque déploiement en publie d'autres et l'ancien ne
// répond plus. Le clic sur « Imprimer » échoue alors avec « Failed to load
// chunk /_next/static/chunks/….js » — incompréhensible pour un permanent.
// Recharger la page récupère la version en ligne et l'impression repart ; une
// navigation dans le back-office le fait aussi, Next rechargeant de lui-même
// quand il voit que la version a changé. D'où une panne « qui passe toute
// seule ».

export const STALE_PAGE_MESSAGE =
    "Le portail a été mis à jour depuis l'ouverture de cette page. Rechargez la page (touche F5), puis recommencez.";

/**
 * Turbopack : « Failed to load chunk … from module … ». Webpack : ChunkLoadError
 * « Loading chunk … failed ». Navigateurs (import natif) : « Failed to fetch
 * dynamically imported module » / « Importing a module script failed ».
 */
export const isChunkLoadError = (err: unknown): boolean =>
    err instanceof Error &&
    (err.name === 'ChunkLoadError' ||
        /Failed to load chunk|Loading chunk .* failed|dynamically imported module|Importing a module script failed/i.test(
            err.message,
        ));

/** `loader` fait les `import()` ; une page périmée lève STALE_PAGE_MESSAGE. */
export const loadOnDemand = async <T>(loader: () => Promise<T>): Promise<T> => {
    try {
        return await loader();
    } catch (err) {
        if (isChunkLoadError(err)) {
            console.error('Module à la demande introuvable (page antérieure au déploiement) :', err);
            throw new Error(STALE_PAGE_MESSAGE);
        }
        throw err;
    }
};
