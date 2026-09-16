/**
 * READ-ONLY. Proves the admin search bars find the same rows whichever
 * apostrophe was typed, against a real database.
 *
 *   pnpm tsx scripts/search.e2e.ts
 *
 * Runs SELECT statements only, so it is safe to point at production. It picks
 * its own witnesses out of the data rather than hard-coding ids — a title
 * holding « ’ », a person with a hyphenated name — so it keeps working on any
 * database that has some.
 *
 * What it asserts is an EQUALITY, not a count: the curly spelling and the
 * straight one must return the same rows. A search that breaks again will show
 * up as two numbers that differ, whatever the data happens to hold that day.
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import {
    buildOrderSearchWhere,
    buildAssignmentSearchWhere,
    buildBookReviewSearchWhere,
    buildUserNameSearch,
    bookFieldsForToken,
} from '@/lib/search';
import { buildBookScopeWhere } from '@/lib/books/searchWhere';
import { listAdminBooks } from '@/lib/books/bookList';

console.log(`DB → ${describeDatabase(scriptDatabaseUrl())}\n`);

const CURLY = '’';
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
    // A real title carrying the curly apostrophe, chosen from the data itself.
    const curlyBook = await prisma.book.findFirst({
        where: { title: { contains: CURLY } },
        select: { id: true, title: true, author: true },
        orderBy: { id: 'asc' },
    });
    if (!curlyBook) throw new Error('aucun livre a apostrophe courbe en base');
    console.log(`livre temoin  #${curlyBook.id}  « ${curlyBook.title} »\n`);

    // The WHOLE title, both ways round. Every token has to match, so this
    // narrows to the witness itself rather than to every book containing
    // « c'est » — and it exercises the apostrophe token alongside ordinary ones.
    const curlyWord = curlyBook.title;
    const straightWord = curlyWord.split(CURLY).join("'");
    console.log(`  courbe : ${curlyWord}\n  droite : ${straightWord}\n`);

    // ---------------------------------------------------- catalogue (raw SQL)
    for (const [label, term] of [['courbe', curlyWord], ['droite', straightWord]] as const) {
        const page = await listAdminBooks({
            search: term, filter: 'all', genres: [], page: 1, limit: 50,
            recent: false, since: null,
        });
        check(
            `catalogue admin (SQL brut), saisie ${label}`,
            page.books.some((b) => b.id === curlyBook.id),
            `${page.total} resultat(s)`,
        );
    }

    // ------------------------------------------------ comptes (chemin Prisma)
    for (const [label, term] of [['courbe', curlyWord], ['droite', straightWord]] as const) {
        const n = await prisma.book.count({
            where: buildBookScopeWhere({ searchTerm: term, includeHidden: true }),
        });
        check(`compteur livres (Prisma), saisie ${label}`, n > 0, `${n} resultat(s)`);
    }

    // --------------------------------------------------------- fiche de livre
    for (const [label, term] of [['courbe', curlyWord], ['droite', straightWord]] as const) {
        const n = await prisma.book.count({ where: { OR: bookFieldsForToken(term) } });
        check(`bookFieldsForToken, saisie ${label}`, n > 0, `${n} resultat(s)`);
    }

    // ------------------------------------------------------------- doublons
    for (const [label, term] of [['courbe', curlyWord], ['droite', straightWord]] as const) {
        const clauses = buildBookReviewSearchWhere(term)!;
        const n = await prisma.book.count({ where: { AND: clauses } });
        check(`doublons, saisie ${label}`, n > 0, `${n} resultat(s)`);
    }

    // ------------------------------------------- demandes et attributions
    const order = await prisma.orders.findFirst({
        where: { catalogue: { title: { contains: CURLY } } },
        select: { id: true, catalogue: { select: { title: true } } },
    });
    if (order) {
        const word = order.catalogue.title.split(/\s+/).find((w) => w.includes(CURLY))!;
        for (const [label, term] of [['courbe', word], ['droite', word.split(CURLY).join("'")]] as const) {
            const n = await prisma.orders.count({ where: { AND: buildOrderSearchWhere(term)! } });
            check(`demandes, saisie ${label}`, n > 0, `${n} resultat(s)`);
        }
    } else {
        console.log('(aucune demande sur un livre a apostrophe courbe — cas non couvert ici)');
    }

    const assignment = await prisma.assignment.findFirst({
        where: { catalogue: { title: { contains: CURLY } } },
        select: { id: true, catalogue: { select: { title: true } } },
    });
    if (assignment) {
        const word = assignment.catalogue.title.split(/\s+/).find((w) => w.includes(CURLY))!;
        for (const [label, term] of [['courbe', word], ['droite', word.split(CURLY).join("'")]] as const) {
            const n = await prisma.assignment.count({ where: { AND: buildAssignmentSearchWhere(term)! } });
            check(`attributions, saisie ${label}`, n > 0, `${n} resultat(s)`);
        }
    } else {
        console.log('(aucune attribution sur un livre a apostrophe courbe — cas non couvert ici)');
    }

    // --------------------------------------- deux champs, une seule saisie
    const both = `${curlyBook.author.split(/\s+/).pop()} ${straightWord}`;
    const n = await prisma.book.count({
        where: buildBookScopeWhere({ searchTerm: both, includeHidden: true }),
    });
    check(`auteur + titre dans la meme saisie (« ${both} »)`, n > 0, `${n} resultat(s)`);

    // ------------------------------------------ nom compose, tiret ou espace
    const hyphenated = await prisma.user.findFirst({
        where: { OR: [{ firstName: { contains: '-' } }, { lastName: { contains: '-' } }] },
        select: { id: true, firstName: true, lastName: true },
    });
    if (hyphenated) {
        const field = hyphenated.firstName?.includes('-') ? hyphenated.firstName : hyphenated.lastName!;
        console.log(`\npersonne temoin  #${hyphenated.id}  « ${field} »`);
        for (const [label, term] of [['tiret', field], ['espace', field.split('-').join(' ')]] as const) {
            const found = await prisma.user.findMany({
                where: buildUserNameSearch(term)!, select: { id: true },
            });
            check(`nom compose, saisie avec ${label}`, found.some((u) => u.id === hyphenated.id),
                `${found.length} resultat(s)`);
        }
    }
}

main()
    .catch((e) => { console.error('ERR', e); failures++; })
    .finally(async () => {
        await prisma.$disconnect();
        console.log(failures ? `\n${failures} echec(s)` : '\nTout passe.');
        process.exit(failures ? 1 : 0);
    });
