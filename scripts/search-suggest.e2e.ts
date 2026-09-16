/**
 * READ-ONLY. Proves the « Vouliez-vous dire … ? » suggestions against a real
 * database (lib/search-suggest.ts).
 *
 *   pnpm tsx scripts/search-suggest.e2e.ts
 *
 * Checks, picking its own witnesses from the data rather than hard-coding ids:
 *
 *   1. spelling — a person's name and a book title, each misspelt, come back
 *      corrected, and the correction finds the row;
 *   2. drops — a real query plus a word that names nothing proposes the query
 *      without that word;
 *   3. filters — a suggestion is verified under the list's filters, so a
 *      correction that only exists outside them is never offered;
 *   4. privacy — a word found only in HIDDEN books is proposed to the back
 *      office but never to the public catalogue;
 *   5. cost — a whole suggestion round stays well under a second, measured
 *      on warm connections (opening one to Supabase from a laptop costs more
 *      than the round itself, and the deployed app keeps its pool open).
 *
 * Runs SELECT statements only, so it is safe to point at production.
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import { buildOrderSearchWhere, buildUserNameSearch } from '@/lib/search';
import { suggestSearches, suggestionCandidates } from '@/lib/search-suggest';
import { foldForSearchKey } from '@/lib/search-normalize';
import { listAdminBooks, listPublicBooks } from '@/lib/books/bookList';

console.log(`DB → ${describeDatabase(scriptDatabaseUrl())}\n`);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

/** « hubert » → « hubrt »: drop the second-to-last letter, a typical slip. */
const misspell = (word: string) => word.slice(0, -2) + word.slice(-1);

const countUsers = (q: string) => prisma.user.count({ where: buildUserNameSearch(q) ?? {} });
const countOrders = (q: string) => prisma.orders.count({ where: { AND: buildOrderSearchWhere(q) ?? [] } });

async function main() {
    const [{ words }] = await prisma.$queryRawUnsafe<{ words: bigint }[]>(
        'SELECT count(*) AS words FROM search_vocabulary',
    );
    check('search_vocabulary est remplie', Number(words) > 0, `${words} mots`);

    // Open the whole pool (lib/prisma.ts holds 3) before anything is timed.
    await Promise.all([1, 2, 3].map(() => prisma.$queryRawUnsafe('SELECT 1')));

    // ------------------------------------------------------------ 1. spelling
    const person = await prisma.user.findFirst({
        where: { lastName: { not: null }, firstName: { not: null } },
        select: { firstName: true, lastName: true },
        orderBy: { id: 'asc' },
    });
    const personWord = (person?.lastName ?? '').split(/[\s'-]+/).find((w) => w.length >= 6);
    if (personWord) {
        const typo = misspell(personWord.toLowerCase());
        const started = Date.now();
        const suggestions = await suggestSearches(typo, ['people'], countUsers);
        const ms = Date.now() - started;
        const hit = suggestions.find((s) => foldForSearchKey(s.query) === foldForSearchKey(personWord));
        check(`personne : « ${typo} » propose « ${personWord.toLowerCase()} »`, !!hit && (hit.count ?? 0) > 0,
            JSON.stringify(suggestions));
        check('coût d’un tour de suggestions (personnes) < 1 s', ms < 1000, `${ms} ms`);
    }

    const order = await prisma.orders.findFirst({
        where: { catalogue: { title: { not: '' } } },
        select: { catalogue: { select: { title: true } }, aveugle: { select: { lastName: true } } },
        orderBy: { id: 'desc' },
    });
    const titleWord = order?.catalogue.title.split(/[\s'’,.:;!?-]+/).find((w) => w.length >= 7);
    if (titleWord) {
        const typo = misspell(titleWord.toLowerCase());
        const started = Date.now();
        const suggestions = await suggestSearches(typo, ['people', 'books'], countOrders);
        const ms = Date.now() - started;
        const hit = suggestions.find((s) => foldForSearchKey(s.query) === foldForSearchKey(titleWord));
        check(`demandes : « ${typo} » propose « ${titleWord.toLowerCase()} »`, !!hit, JSON.stringify(suggestions));
        check('coût d’un tour de suggestions (demandes) < 1 s', ms < 1000, `${ms} ms`);
    }

    // --------------------------------------------------------------- 2. drops
    if (order?.aveugle.lastName && titleWord) {
        const base = `${order.aveugle.lastName} ${titleWord}`;
        const query = `${base} zzqxw`;
        check(`« ${query} » ne trouve rien`, (await countOrders(query)) === 0);
        const suggestions = await suggestSearches(query, ['people', 'books'], countOrders);
        const drop = suggestions.find((s) => s.dropped === 'zzqxw');
        check('propose de retirer le mot en trop', !!drop && (drop.count ?? 0) > 0, JSON.stringify(suggestions));
    }

    // ------------------------------------------------------------- 3. filters
    if (personWord) {
        const typo = misspell(personWord.toLowerCase());
        const nobody = await suggestSearches(typo, ['people'], async () => 0);
        check('un filtre qui exclut tout ne laisse aucune suggestion', nobody.length === 0);
        const candidates = await suggestionCandidates(typo, ['people']);
        check('mais la correction existe bien comme candidat', candidates.length > 0);
    }

    // ------------------------------------------------------------- 4. privacy
    const hiddenOnly = await prisma.$queryRawUnsafe<{ word: string; fold: string }[]>(
        `SELECT v.word, v.fold FROM search_vocabulary v
         WHERE v.domain = 'books' AND length(v.fold) >= 8 AND v.fold ~ '^[a-z]+$'
           AND EXISTS (SELECT 1 FROM "Book" b WHERE b."deletedAt" IS NULL AND b."hiddenFromCatalogue"
                       AND position(v.fold IN search_fold(b.title)) > 0)
           AND NOT EXISTS (SELECT 1 FROM "Book" b WHERE b."deletedAt" IS NULL AND NOT b."hiddenFromCatalogue"
                       AND position(v.fold IN search_fold(concat_ws(' ', b.title, b.subtitle, b.author, b.publisher, b.isbn, b.description))) > 0)
         LIMIT 1`,
    );
    if (hiddenOnly.length === 0) {
        console.log('(aucun mot propre aux livres masqués sur cette base — test de confidentialité sauté)');
    } else {
        const { word, fold } = hiddenOnly[0];
        const typo = misspell(fold);
        const query = { search: typo, filter: 'all', genres: [], page: 1, limit: 9, suggest: true };
        const pub = await listPublicBooks(query);
        const admin = await listAdminBooks({ ...query, recent: false, since: null });
        const leaks = (pub.searchSuggestions ?? []).some((s) => foldForSearchKey(s.query).includes(fold));
        check(`catalogue public : « ${typo} » ne révèle pas « ${word} » (livre masqué)`, pub.total === 0 && !leaks,
            JSON.stringify(pub.searchSuggestions));
        const offered = (admin.searchSuggestions ?? []).some((s) => foldForSearchKey(s.query).includes(fold));
        check(`back-office : « ${typo} » propose « ${word} »`, admin.total > 0 || offered,
            JSON.stringify(admin.searchSuggestions));
    }

    // -------------------------------------------- 5. nothing for a real result
    const noSuggest = await listAdminBooks({
        search: 'a', filter: 'all', genres: [], page: 1, limit: 1, suggest: true, recent: false, since: null,
    });
    check('une recherche qui trouve ne calcule aucune suggestion', noSuggest.searchSuggestions === undefined);

    console.log(failures === 0 ? '\nTout est bon.' : `\n${failures} échec(s).`);
    process.exitCode = failures === 0 ? 0 : 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
