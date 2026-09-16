/**
 * Exercises the typographic folding the admin search bars depend on.
 * No network, no database.
 *
 *   pnpm tsx scripts/search-normalize.test.ts
 */
import {
    foldForSearchKey,
    normalizeApostrophes,
    normalizeSearchText,
    searchKeyVariants,
    searchVariants,
} from '../lib/search-normalize';
import { searchTokens } from '../lib/search';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`}`);
}

// ------------------------------------------------------------- apostrophes

check('apostrophe courbe droite', normalizeApostrophes('L’étranger'), "L'étranger");
check('apostrophe courbe gauche', normalizeApostrophes('L‘étranger'), "L'étranger");
check('accent aigu AZERTY', normalizeApostrophes('L´étranger'), "L'étranger");
check('accent grave AZERTY', normalizeApostrophes('L`étranger'), "L'étranger");
check('apostrophe modificative', normalizeApostrophes('Lʼétranger'), "L'étranger");
check('apostrophe droite inchangée', normalizeApostrophes("L'étranger"), "L'étranger");
check('accents préservés', normalizeApostrophes('César'), 'César');

// --------------------------------------------------------------- le reste

check('espace insécable', normalizeSearchText('Jean Valjean'), 'Jean Valjean');
check('tiret cadratin', normalizeSearchText('Jean—Pierre'), 'Jean-Pierre');
check('guillemets français', normalizeSearchText('«cœur»'), '"cœur"');
check('espaces rognés', normalizeSearchText('  deux   mots  '), 'deux mots');

// ------------------------------------------------------------- les variantes

check('mot simple : une seule variante', searchVariants('etranger'), ['etranger']);
check(
    'apostrophe : les formes stockées, « ! » du bucket compris',
    searchVariants("l’étranger"),
    ["l'étranger", 'l’étranger', 'l‘étranger', 'l!étranger'],
);
check(
    'saisie droite : trouve aussi la forme courbe',
    searchVariants("d'éternité"),
    ["d'éternité", 'd’éternité', 'd‘éternité', 'd!éternité'],
);
// L'asymétrie : « ! » tapé reste « ! », il ne devient pas une apostrophe.
check('« ! » tapé se cherche tel quel', searchVariants('Cours!'), ['Cours!']);
check(
    'trait d’union : tiret, espace, rien',
    searchVariants('Jean-Pierre'),
    ['Jean-Pierre', 'Jean Pierre', 'JeanPierre'],
);
check('les deux : borné à douze', searchVariants("l'abbé-pierre").length, 12);
check('chaîne vide', searchVariants('   '), []);
check('tiret seul ne produit pas de motif vide', searchVariants('-'), ['-', ' ']);

// ------------------------------------------------------ clé de recherche

check('accents repliés', foldForSearchKey('Thérèse CLAVIÉ'), 'therese clavie');
check('tréma', foldForSearchKey('Müller'), 'muller');
check('ligature œ comme unaccent', foldForSearchKey('Œuvre'), 'oeuvre');
check('ligature æ', foldForSearchKey('Lætitia'), 'laetitia');
check('ß et ø translittérés', foldForSearchKey('Straße Østergaard'), 'strasse ostergaard');
check('ł polonais', foldForSearchKey('Łukasz'), 'lukasz');
check('apostrophe AZERTY repliée', foldForSearchKey('N´Diaye'), "n'diaye");
check('espaces réduits', foldForSearchKey('  Noël   Jean '), 'noel jean');
check('variantes : les apostrophes courbes se confondent', searchKeyVariants("N'Diaye"), ["n'diaye", 'n!diaye']);
check('variantes : tirets conservés', searchKeyVariants('Jean-Pierre'), ['jean-pierre', 'jean pierre', 'jeanpierre']);
check('variantes : mot simple', searchKeyVariants('Noël'), ['noel']);

// --------------------------------------------------------------- tokenisation

check('découpage simple', searchTokens('camus etranger'), ['camus', 'etranger']);
check('dièse retiré partout', searchTokens('morvan #25485'), ['morvan', '25485']);
check('espace insécable découpe', searchTokens('Jean Valjean'), ['Jean', 'Valjean']);
check('espaces multiples', searchTokens('  a   b  '), ['a', 'b']);

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent.');
process.exit(failures ? 1 : 0);
