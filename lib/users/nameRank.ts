import { foldForSearchKey } from '@/lib/search-normalize';
import { searchTokens } from '@/lib/search';

/**
 * People found by a name search, best match first.
 *
 * The person searches used to sort their matches alphabetically and THEN keep
 * the first 20 (picker) or 5 (Ctrl+K). « jean » matches 55 people — every Jean,
 * Jeanne, Jean-Pierre — and Mme Yvonne JEAN, sorted under Y, was always past the
 * cut: searching her by her nom alone, the way the secrétariat looks people up,
 * gave « pas de réponse ». Matching was never the problem; the order was.
 *
 * So every match is ranked first and only then cut. A typed word ranks, best
 * first, as:
 *   0  the nom itself (or one part of a compound nom),
 *   1  the prénom itself (or one part of « Jean-Pierre »),
 *   2  the start of a word of the name or e-mail,
 *   3  anywhere else (« jean » inside « Jeannine »).
 * A person's score is the sum over the words typed; ties go nom, prénom, id.
 *
 * Folded with `foldForSearchKey`, the same fold the `searchKey` column the
 * matching runs on is built with, so « Noel » ranks « Noël » as an exact nom.
 */

export interface NameRankable {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email?: string | null;
}

/** The whole field and each of its parts, folded: « Le Goff-Morvan » → le goff-morvan, le, goff, morvan. */
function nameParts(value: string | null): string[] {
    const folded = foldForSearchKey(value ?? '');
    if (!folded) return [];
    return [folded, ...folded.split(/[\s'-]+/).filter(Boolean)];
}

function tokenRank(token: string, person: NameRankable): number {
    const last = nameParts(person.lastName);
    if (last.includes(token)) return 0;
    const first = nameParts(person.firstName);
    if (first.includes(token)) return 1;
    const emailWords = foldForSearchKey(person.email ?? '').split(/[@._+\s-]+/);
    if ([...last, ...first, ...emailWords].some((word) => word.startsWith(token))) return 2;
    return 3;
}

export function rankByNameMatch<T extends NameRankable>(people: T[], query: string): T[] {
    const tokens = searchTokens(query).map(foldForSearchKey).filter(Boolean);
    const scored = people.map((person) => ({
        person,
        score: tokens.reduce((sum, token) => sum + tokenRank(token, person), 0),
    }));
    const byName = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'fr');
    scored.sort(
        (a, b) =>
            a.score - b.score ||
            byName(a.person.lastName, b.person.lastName) ||
            byName(a.person.firstName, b.person.firstName) ||
            a.person.id - b.person.id,
    );
    return scored.map((s) => s.person);
}
