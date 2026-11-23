import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { newErrorRef, OUTCOME_UNKNOWN } from '@/lib/user-error';

/**
 * Identifiant de route, ou `null` quand ce n'en est pas un.
 *
 * `parseInt('abc', 10)` vaut NaN, et un NaN passé dans un `where: { id }` fait
 * jeter Prisma : les routes qui ne validaient pas leur `[id]` répondaient 500
 * là où 400 est la réponse juste. Les routes plus récentes (livres, factures,
 * demandes…) le font déjà à la main ; ceci est la même règle, écrite une fois.
 */
export function parseRecordId(raw: string | undefined | null): number | null {
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
}

/** Réponse 400 standard pour un identifiant qui n'en est pas un. */
export function invalidIdResponse(): NextResponse {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
}

/**
 * Vrai quand Prisma dit « la ligne visée n'existe pas » (P2025).
 *
 * C'est le cas de la ligne déjà supprimée — deux onglets ouverts, ou un retour
 * en arrière du navigateur. Ce n'est pas une panne : l'appelant doit lire 404 et
 * pouvoir l'annoncer (« déjà supprimé »), pas un « Failed to delete » qui ne dit
 * rien et ressemble à un incident.
 */
export function isRecordNotFound(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
    );
}

/** Réponse 404 standard pour une ligne absente. */
export function notFoundResponse(message: string): NextResponse {
    return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Réponse 500 pour une exception que la route ne sait pas nommer.
 *
 * Le corps porte `unexpected: true` et une référence, journalisée ici avec
 * l'exception : le toast (lib/user-error.ts) dit que la cause est inconnue,
 * donne l'adresse à qui écrire et la référence à citer — qui retrouve la trace
 * exacte dans les journaux Vercel. Le texte est dans `error` ET `message`, les
 * deux clés que les clients existants lisent.
 *
 * `outcome` dit ce qu'on sait de l'état laissé derrière — n'affirmez « rien n'a
 * été modifié » que si c'est vrai à toutes les lignes où l'exception a pu
 * partir. Par défaut, on ne sait pas.
 */
export function unexpectedErrorResponse(opts: UnexpectedErrorInput): NextResponse {
    // Dev server only (lib/audio/bucket-core.ts): not an unknown fault but a
    // refusal by design, the same on every retry. A 409 the upload dialogue does
    // not retry, rather than a 500 it would try nine times over (three attempts
    // per pass, three passes), re-hashing the files each pass.
    if (isDevBucketRefusal(opts.error)) {
        const message = opts.error.message;
        return NextResponse.json({ error: message, message, devBucketRefused: true }, { status: 409 });
    }
    const { message, ref } = unexpectedErrorResult(opts);
    return NextResponse.json({ error: message, message, unexpected: true, ref }, { status: 500 });
}

/** By name, not instanceof: this module must not import the bucket client. */
function isDevBucketRefusal(error: unknown): error is Error {
    return error instanceof Error && error.name === 'DevBucketWriteRefused';
}

interface UnexpectedErrorInput {
    where: string;
    error: unknown;
    /** « La suppression du livre a échoué. » — ce qui a été tenté. */
    what?: string;
    outcome?: string;
}

/**
 * La même chose pour une server action, qui renvoie un objet plutôt qu'une
 * réponse HTTP : journalise avec une référence, et rend de quoi remplir
 * `{ ok: false, message, unexpected: true, ref }`.
 */
export function unexpectedErrorResult(opts: UnexpectedErrorInput): {
    message: string;
    unexpected: true;
    ref: string;
} {
    const ref = newErrorRef();
    console.error(`[${ref}] ${opts.where}`, opts.error);
    // Dev server only (lib/audio/bucket-core.ts): a refusal by design, which
    // explains itself — routes and server actions both end up here.
    const what = isDevBucketRefusal(opts.error) ? opts.error.message : opts.what;
    const message =
        `${what ?? 'Une erreur inattendue s’est produite sur le serveur.'} ` +
        `${opts.outcome ?? OUTCOME_UNKNOWN}`;
    return { message, unexpected: true, ref };
}
