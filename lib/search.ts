import { Prisma } from '@prisma/client';

/**
 * Build a case-insensitive, multi-token name search over a User relation.
 *
 * The search is split on whitespace and the tokens are AND-ed together, so a
 * full-name query like "steffy ref" matches firstName="Steffy" + lastName="Ref"
 * — which a single `contains "steffy ref"` never could, because no one column
 * holds both words. Each token must match at least one of firstName / lastName /
 * name / email.
 *
 * Returns null when the term has no usable tokens (empty / whitespace only), so
 * callers can skip adding a person clause entirely.
 */
export function buildUserNameSearch(searchTerm: string): Prisma.UserWhereInput | null {
    const tokens = searchTerm.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    const mode = Prisma.QueryMode.insensitive;
    return {
        AND: tokens.map((token) => ({
            OR: [
                { firstName: { contains: token, mode } },
                { lastName: { contains: token, mode } },
                { name: { contains: token, mode } },
                { email: { contains: token, mode } },
            ],
        })),
    };
}
