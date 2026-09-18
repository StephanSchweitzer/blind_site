/**
 * Ce qu'un permanent lit quand une action échoue — et surtout, ce qu'il lit
 * quand PERSONNE ne sait pourquoi elle a échoué.
 *
 * Le toast d'erreur est souvent le seul témoin d'un incident : un message qui
 * affirme « le fichier est intact » alors que la panne est survenue APRÈS le
 * déplacement, ou un « Échec de la suppression » générique sur une réponse vide,
 * coûte des heures à démêler après coup. D'où trois familles, et une règle :
 *
 *  - `known` : le serveur a refusé pour une raison qu'il a formulée (409 d'un
 *    doublon, pistes en corbeille, session expirée…). On affiche sa phrase.
 *  - `unexpected` : un plantage, un 500, une réponse illisible, un délai
 *    dépassé. On ne PRÉTEND pas savoir ce qui s'est passé : le message le dit,
 *    et donne l'adresse à qui écrire, avec la référence que le serveur a
 *    journalisée (voir unexpectedErrorResponse, lib/api-errors.ts).
 *  - `network` : la requête n'a pas atteint le serveur, ou sa réponse ne nous
 *    est pas parvenue. L'action a pu aboutir quand même — le message le dit.
 *
 * Module sans dépendance serveur : lu par les composants clients comme par les
 * routes.
 */

/** À qui écrire quand la cause d'une erreur est inconnue. Aussi affichée sur /admin/aide. */
export const TECH_CONTACT_EMAIL = 'steezefanschweitzer@gmail.com';

/** Ce qu'une requête qui a échoué en plein milieu a pu laisser derrière elle. */
export const OUTCOME_NOTHING_CHANGED = 'Rien n’a été modifié.';
export const OUTCOME_UNKNOWN =
    'L’opération a pu aboutir en tout ou en partie : rechargez la page pour voir où elle en est ' +
    'avant de recommencer.';

export type UserErrorKind = 'known' | 'unexpected' | 'network';

export class UserFacingError extends Error {
    readonly kind: UserErrorKind;
    /** Référence journalisée côté serveur (« ERR-7K2Q9D »), quand il y en a une. */
    readonly ref?: string;
    /** Code HTTP, pour le courriel — absent quand la requête n'a pas abouti. */
    readonly status?: number;
    /**
     * Texte technique d'origine (souvent en anglais, écrit par le navigateur) :
     * mis dans le courriel, JAMAIS dans le toast, qui reste entièrement en français.
     */
    readonly detail?: string;

    constructor(
        message: string,
        kind: UserErrorKind,
        extra: { ref?: string; status?: number; detail?: string } = {},
    ) {
        super(message);
        this.name = 'UserFacingError';
        this.kind = kind;
        this.ref = extra.ref;
        this.status = extra.status;
        this.detail = extra.detail;
    }
}

/** « ERR-7K2Q9D » : assez court pour être recopié à la main, assez long pour être unique dans les journaux. */
export function newErrorRef(): string {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans 0/O ni 1/I : recopiable
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return 'ERR-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Le corps d'erreur, sous les deux formes que les routes emploient (`error` ou `message`). */
function textOf(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return null;
}

/**
 * L'erreur à montrer pour une réponse non-OK.
 *
 * `body` est le JSON déjà lu (ou null s'il n'y en avait pas) : la plupart des
 * appelants l'ont lu pour y chercher autre chose (`requiresTargetReplaceConfirm`,
 * `mergedInto`…), il ne se relit pas.
 */
export function userErrorFromResponse(res: Response, body: unknown): UserFacingError {
    const status = res.status;
    const text = textOf(body);
    const flagged = !!body && typeof body === 'object' && (body as { unexpected?: unknown }).unexpected === true;
    const ref =
        flagged && typeof (body as { ref?: unknown }).ref === 'string'
            ? (body as { ref: string }).ref
            : undefined;

    if (flagged) {
        return new UserFacingError(
            text ?? `Une erreur inattendue s’est produite sur le serveur. ${OUTCOME_UNKNOWN}`,
            'unexpected',
            { ref, status },
        );
    }

    // Les gardes (lib/auth/guards.ts) répondent en anglais technique ou pas du
    // tout ; le cas est connu, la phrase doit l'être aussi.
    if (status === 401) {
        return new UserFacingError(
            `Votre session a expiré. Rechargez la page pour vous reconnecter, puis recommencez. ${OUTCOME_NOTHING_CHANGED}`,
            'known',
            { status },
        );
    }
    if (status === 403) {
        return new UserFacingError(
            text && text !== 'Permissions insuffisantes'
                ? text
                : `Vous n’avez pas les droits nécessaires pour cette action. ${OUTCOME_NOTHING_CHANGED}`,
            'known',
            { status },
        );
    }

    // Délai dépassé ou passerelle en panne : la page d'erreur de l'hébergeur,
    // pas notre JSON. La fonction a pu travailler jusqu'à la coupure.
    if (status === 504 || ((status === 502 || status === 503) && !text)) {
        return new UserFacingError(
            `Le serveur n’a pas répondu à temps (code ${status}). ${OUTCOME_UNKNOWN}`,
            'unexpected',
            { status },
        );
    }

    // 500 = une exception que la route n'a pas su nommer, quel que soit le texte
    // qui l'accompagne. Un 502/503 avec une phrase est un cas traité (stockage
    // injoignable, déplacement à relancer) et reste « connu ».
    if (status >= 500 && (status === 500 || !text)) {
        return new UserFacingError(
            text ?? `Une erreur inattendue s’est produite sur le serveur (code ${status}). ${OUTCOME_UNKNOWN}`,
            'unexpected',
            { status },
        );
    }

    if (text) return new UserFacingError(text, 'known', { status });

    return new UserFacingError(
        `Le serveur a refusé la demande (code ${status}) sans en donner la raison.`,
        'unexpected',
        { status },
    );
}

/**
 * Lit une réponse non-OK et renvoie l'erreur à lancer. Pour les appelants qui
 * n'ont besoin de rien d'autre dans le corps.
 */
export async function readUserError(res: Response): Promise<UserFacingError> {
    const body = await res.json().catch(() => null);
    return userErrorFromResponse(res, body);
}

/**
 * Le rejet de `fetch` quand la requête n'a pas abouti. C'est un TypeError, mais
 * un bogue de la page (`null.message`) en est un aussi : seul le texte les
 * distingue — Chrome « Failed to fetch », Firefox « NetworkError when
 * attempting to fetch resource », Safari « Load failed ».
 */
function isFetchFailure(err: unknown): boolean {
    return (
        err instanceof TypeError &&
        /failed to fetch|networkerror|load failed|network request failed/i.test(err.message)
    );
}

/**
 * N'importe quoi rattrapé dans un `catch` côté client, rendu montrable.
 *
 * Quand la requête n'a pas abouti (réseau coupé, serveur injoignable), la
 * réponse, si elle existe, ne nous est pas parvenue : on ne sait pas si
 * l'action a eu lieu, et le message le dit.
 */
export function toUserFacingError(err: unknown): UserFacingError {
    if (err instanceof UserFacingError) return err;
    if (isFetchFailure(err)) {
        return new UserFacingError(
            'La connexion au serveur a échoué : vérifiez votre connexion internet. ' +
                'Si vous étiez en train d’enregistrer, de supprimer ou de déplacer quelque chose, ' +
                'rechargez la page pour vérifier si c’est fait avant de recommencer.',
            'network',
        );
    }
    // Le message du navigateur (« Cannot read properties of null… ») est en
    // anglais : il part dans le courriel via `detail`, pas dans le toast.
    return new UserFacingError(
        `Une erreur inattendue s’est produite dans la page. ${OUTCOME_UNKNOWN}`,
        'unexpected',
        { detail: err instanceof Error && err.message ? `${err.name}: ${err.message}` : String(err) },
    );
}
