import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

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
