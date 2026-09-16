/**
 * READ-ONLY. Proves the two halves of the accent-insensitive person search
 * fold text the same way, against a real database.
 *
 *   pnpm tsx scripts/search-fold.e2e.ts
 *
 * The column `User.searchKey` is folded by Postgres (`search_fold`, kept up by
 * a trigger); the typed query is folded by `foldForSearchKey` in JavaScript.
 * Nothing forces those two to agree, and a character they fold differently is
 * a search that returns nothing without saying why. So this checks:
 *
 *   1. both folds over whole Unicode blocks (Basic Latin, Latin-1, Latin
 *      Extended-A) and every punctuation form normalizeSearchText knows;
 *   2. every stored key against the JavaScript fold of its own row — which
 *      also catches rows the trigger's fallback left un-dés-accentués;
 *   3. the search itself: a person with an accented name is found by the
 *      accented, unaccented and upper-case spellings alike.
 *
 * Runs SELECT statements only, so it is safe to point at production.
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { scriptDatabaseUrl, describeDatabase } from './db-url';
import { foldForSearchKey } from '@/lib/search-normalize';
import { buildOrderSearchWhere, buildUserNameSearch } from '@/lib/search';

console.log(`DB → ${describeDatabase(scriptDatabaseUrl())}\n`);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
    // ------------------------------------------------ 1. the folds, per character
    const samples: string[] = [];
    for (let cp = 0x20; cp <= 0x17f; cp++) {
        if (cp >= 0x7f && cp < 0xa0) continue; // C1 controls
        samples.push(String.fromCodePoint(cp));
    }
    samples.push(...'‘’‛ʼʹ′´`‐‑‒–—―−“”„«»…ẞ   ﻿'.split(''));
    samples.push('Œuvre', 'MÜLLER', 'Noël  Jean—Pierre', 'N’Diaye', '  deux   mots ');

    const rows = await prisma.$queryRawUnsafe<{ s: string; f: string }[]>(
        `SELECT s, search_fold(s) AS f FROM unnest($1::text[]) AS s`,
        samples,
    );
    const diverging = rows.filter((r) => r.f !== foldForSearchKey(r.s));
    check(
        `search_fold et foldForSearchKey d'accord sur ${rows.length} échantillons`,
        diverging.length === 0,
        diverging
            .slice(0, 15)
            .map((r) => `U+${r.s.codePointAt(0)!.toString(16).padStart(4, '0')} ${JSON.stringify(r.s)} pg=${JSON.stringify(r.f)} js=${JSON.stringify(foldForSearchKey(r.s))}`)
            .join(' | '),
    );

    // ------------------------------------------------ 2. every stored key
    const users = await prisma.$queryRawUnsafe<
        { id: number; firstName: string | null; lastName: string | null; name: string | null; email: string | null; searchKey: string }[]
    >(`SELECT id, "firstName", "lastName", name, email, "searchKey" FROM "User"`);
    const stale = users.filter(
        (u) => u.searchKey !== foldForSearchKey([u.firstName, u.lastName, u.name, u.email].filter((v) => v != null).join(' ')),
    );
    check(
        `searchKey conforme pour ${users.length} personnes`,
        stale.length === 0,
        stale.slice(0, 5).map((u) => `#${u.id} ${JSON.stringify(u.searchKey)}`).join(' | '),
    );

    // ------------------------------------------------ 3. the search itself
    const witness = await prisma.$queryRawUnsafe<{ id: number; lastName: string; firstName: string }[]>(
        `SELECT id, "firstName", "lastName" FROM "User"
         WHERE "deletedAt" IS NULL AND "firstName" IS NOT NULL AND "lastName" IS NOT NULL
           AND "firstName" <> immutable_unaccent("firstName")
         ORDER BY id LIMIT 1`,
    );
    if (witness.length === 0) throw new Error('aucune personne au prénom accentué en base');
    const { id, firstName, lastName } = witness[0];
    const plain = firstName.normalize('NFD').replace(/[̀-ͯ]/g, '');
    console.log(`\npersonne témoin  #${id}  « ${firstName} ${lastName} »\n`);

    const idsFor = async (term: string) =>
        (await prisma.user.findMany({ where: buildUserNameSearch(term)!, select: { id: true } }))
            .map((u) => u.id)
            .sort((a, b) => a - b);

    const accented = await idsFor(`${firstName} ${lastName}`);
    check('accentué : trouve le témoin', accented.includes(id));
    for (const term of [`${plain} ${lastName}`, `${plain.toUpperCase()} ${lastName.toLowerCase()}`]) {
        const got = await idsFor(term);
        check(`« ${term} » rend les mêmes personnes`, JSON.stringify(got) === JSON.stringify(accented), `${got.length} vs ${accented.length}`);
    }

    // Through a relation, the way the demandes bar reaches the auditeur.
    const withOrder = await prisma.$queryRawUnsafe<{ firstName: string; lastName: string }[]>(
        `SELECT u."firstName", u."lastName" FROM "User" u
         JOIN "Orders" o ON o."aveugleId" = u.id
         WHERE u."deletedAt" IS NULL AND u."firstName" IS NOT NULL AND u."lastName" IS NOT NULL
           AND concat(u."firstName", u."lastName") <> immutable_unaccent(concat(u."firstName", u."lastName"))
         LIMIT 1`,
    );
    if (withOrder.length > 0) {
        const w = withOrder[0];
        const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const count = async (term: string) =>
            prisma.orders.count({ where: { AND: buildOrderSearchWhere(term)! } });
        const [a, b] = await Promise.all([
            count(`${w.firstName} ${w.lastName}`),
            count(`${strip(w.firstName)} ${strip(w.lastName)}`),
        ]);
        check(`demandes de « ${w.firstName} ${w.lastName} » : accentué = sans accents`, a > 0 && a === b, `${a} vs ${b}`);
    }

    console.log(failures === 0 ? '\nTout est bon.' : `\n${failures} échec(s).`);
    process.exitCode = failures === 0 ? 0 : 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
