/**
 * Exercises the rule-derivation logic against synthetic reproductions of the
 * ways a NAS sync job mangles filenames. No network, no database.
 *
 *   pnpm tsx scripts/audio-match-rules.test.ts
 */
import {
    deriveRules,
    topPrefixes,
    toKey,
    similarity,
    normalise,
    parseFolder,
    parseSection,
    orderSections,
    inspectFolder,
    groupByFolder,
    canonicalFolderName,
    dbPathToPrefix,
    naturalCompare,
} from './audio-match-rules';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`}`);
}

/** French titles with the accents that make this whole problem interesting. */
const TITLES = [
    'Émile Zola - Germinal.mp3',
    "L'Étranger - Camus.mp3",
    'À la recherche du temps perdu.mp3',
    'Le Père Goriot.mp3',
    'Voyage au bout de la nuit.mp3',
    'Les Misérables - Tome 1.mp3',
    'Bonjour tristesse.mp3',
    'La Peste - Camus.mp3',
];

/** Build a bucket from the titles under `prefix`, transformed by `mangle`. */
const bucketOf = (prefix: string, mangle: (s: string) => string) =>
    new Map(TITLES.map((t) => [prefix + mangle(t), prefix + mangle(t)]));

const storedPlain = TITLES.map((t) => t); // what the DB holds: bare filenames

// --- 1. Unicode normalisation: DB is NFC, the NAS wrote NFD ------------------
{
    const bucket = bucketOf('audio/', (s) => s.normalize('NFD'));
    const ranked = deriveRules(storedPlain.map((s) => s.normalize('NFC')), bucket, ['audio/']);
    check('NFD + préfixe explique tout', ranked[0].hits, TITLES.length);
    check('règle nommée NFD', /NFD/.test(ranked[0].name), true);
    check('préfixe détecté', /audio\//.test(ranked[0].name), true);
}

// --- 2. Mojibake: UTF-8 bytes read as latin-1 somewhere along the way -------
{
    const mangle = (s: string) => Buffer.from(s, 'utf8').toString('latin1');
    const bucket = bucketOf('', mangle);
    const ranked = deriveRules(storedPlain, bucket, []);
    check('mojibake expliqué', ranked[0].hits, TITLES.length);
    check('règle nommée mojibake', /mojibake/.test(ranked[0].name), true);
}

// --- 3. Spaces replaced by underscores, everything lowercased ---------------
{
    const bucket = bucketOf('livres/', (s) => s.replace(/ /g, '_').toLowerCase());
    const ranked = deriveRules(storedPlain, bucket, ['livres/']);
    check('séparateurs + casse expliqués', ranked[0].hits, TITLES.length);
}

// --- 4. Partial match: one file genuinely missing from the bucket -----------
{
    const bucket = bucketOf('audio/', (s) => s.normalize('NFD'));
    const missingKey = [...bucket.keys()][0];
    bucket.delete(missingKey);
    const ranked = deriveRules(storedPlain.map((s) => s.normalize('NFC')), bucket, ['audio/']);
    check('règle domine malgré un absent', ranked[0].hits, TITLES.length - 1);
}

// --- 5. No relationship at all: the rule must NOT claim a false win ---------
{
    const bucket = new Map([['autre/chose.mp3', 'autre/chose.mp3']]);
    const ranked = deriveRules(storedPlain, bucket, ['autre/']);
    check('aucune règle inventée', ranked[0].hits, 0);
}

// --- 5b. Two-pass sampling reports FULL-catalogue hits, not sample hits -----
{
    // 800 rows, far more than the 400-row sample, all following one rule.
    const many = Array.from({ length: 800 }, (_, i) => `Livre ${i} - Émile.mp3`);
    const bucket = new Map(many.map((t) => [`audio/${t.normalize('NFD')}`, t]));
    const ranked = deriveRules(many.map((s) => s.normalize('NFC')), bucket, ['audio/']);
    check('hits = catalogue entier, pas l’échantillon', ranked[0].hits, 800);

    // Same, but a tenth of the rows are absent from the bucket.
    for (const t of many.slice(0, 80)) bucket.delete(`audio/${t.normalize('NFD')}`);
    const ranked2 = deriveRules(many.map((s) => s.normalize('NFC')), bucket, ['audio/']);
    check('hits exacts malgré 10% d’absents', ranked2[0].hits, 720);
}

// --- 6. Prefix discovery ----------------------------------------------------
{
    const objects = [
        { key: 'audio/a.mp3' },
        { key: 'audio/b.mp3' },
        { key: 'audio/c.mp3' },
        { key: 'dirt/x.mp3' },
    ];
    check('préfixe le plus peuplé en premier', topPrefixes(objects)[0], 'audio/');
}

// --- 7. toKey normalises the shapes audio_filepath can hold -----------------
{
    check('URL amicale B2', toKey('https://f003.backblazeb2.com/file/eca/audio/x.mp3', 'eca'), 'audio/x.mp3');
    check('URL style S3', toKey('https://eca.s3.eu-central-003.backblazeb2.com/audio/x.mp3', 'eca'), 'audio/x.mp3');
    check('chemin Windows', toKey('audio\\sous\\x.mp3', 'eca'), 'audio/sous/x.mp3');
    check('échappement %20', toKey('audio/le%20p%C3%A8re.mp3', 'eca'), 'audio/le père.mp3');
    check('slash initial', toKey('/audio/x.mp3', 'eca'), 'audio/x.mp3');
}

// --- 8. Similarity behaves sanely at the threshold --------------------------
{
    const a = normalise('germinal-emile-zola');
    check('quasi-identique > 0.82', similarity(a, normalise('germinal-emile-zola-1')) > 0.82, true);
    check('sans rapport < 0.82', similarity(a, normalise('bonjour-tristesse-sagan')) < 0.82, true);
}

// --- 9. The real dirt/ layout ----------------------------------------------
// Verbatim from the bucket: note the four apostrophe variants (’ ' !), the
// trailing space before .mp3 on tracks 5/6/29, and the stray space after the
// dash on tracks 22/23.
{
    const FOLDER = 'dirt/2022/21525 Le secret de l!abbé Saunière/';
    const raw = [
        ...Array.from({ length: 39 }, (_, i) => `1000 ${i + 1}-Le secret de l’abbé Saunière.mp3`),
    ];
    // Apply the real irregularities on top.
    raw[21] = '1000 22- Le secret de l’abbé Saunière.mp3';
    raw[22] = '1000 23- Le secret de l’abbé Saunière.mp3';
    raw[28] = '1000 29-Le secret de l’abbé Saunière .mp3';
    raw[37] = "1000 38-Le secret de l'abbé Saunière.mp3";
    raw[4] = '1000 5-Le secret de l’abbé Saunière .mp3';
    raw[5] = '1000 6-Le secret de l’abbé Saunière .mp3';

    const objects = raw.map((n) => ({ key: FOLDER + n, size: 10_000_000 }));

    const folders = groupByFolder(objects);
    check('un seul dossier', folders.size, 1);

    const parsed = parseFolder(FOLDER);
    check('année extraite', parsed.year, 2022);
    check('numéro de dossier extrait', parsed.num, 21525);
    check('titre de dossier extrait', parsed.title, 'Le secret de l!abbé Saunière');

    const sections = folders.get(FOLDER)!;
    const info = inspectFolder(sections);
    check('39 pistes', info.count, 39);
    check('aucun trou', info.gaps, []);
    check('aucun doublon', info.duplicates, []);
    check('aucun fichier illisible', info.unparsed, []);
    check('un seul jeton de tête', info.leads, [1000]);

    // Ordering is the whole point: S3 would give 1, 10, 11, … 2, 20.
    const ordered = orderSections(sections);
    check('ordre naturel 1,2,3', ordered.slice(0, 3).map((s) => s.section), [1, 2, 3]);
    check('piste 10 en 10e position', ordered[9].section, 10);
    check('dernière piste = 39', ordered[38].section, 39);

    // The folder's `l!abbé` must collapse onto the files' `l’abbé` and `l'abbé`.
    const fromFolder = normalise(parsed.title);
    check(
        'dossier ↔ fichiers, apostrophes confondues',
        [normalise(ordered[21].title), normalise(ordered[37].title), normalise(ordered[28].title)],
        [fromFolder, fromFolder, fromFolder],
    );

    // A gap must actually be reported when one exists.
    const holed = sections.filter((s) => s.section !== 12 && s.section !== 13);
    check('trous détectés', inspectFolder(holed).gaps, [12, 13]);

    // And a duplicated track number.
    const duped = [...sections, parseSection(FOLDER + '1000 7-Le secret (copie).mp3')];
    check('doublon détecté', inspectFolder(duped).duplicates, [7]);
}

// --- 10. Folder-name edge cases --------------------------------------------
{
    check('dossier sans numéro', parseFolder('dirt/2019/Sans numéro/').num, null);
    check('parent non-année', parseFolder('dirt/divers/123 Titre/').year, null);
    check('séparateur point', parseFolder('dirt/2020/4242.Titre/').num, 4242);
    check('fichier sans jeton de tête', parseSection('x/7-Titre.mp3').section, 7);
    check('fichier illisible', parseSection('x/notes.txt').section, null);
}

// --- 11. Canonical (clean) folder name --------------------------------------
{
    const c = canonicalFolderName(4821, 'Le secret de l’abbé Saunière');
    check('apostrophe supprimée, pas remplacée', c, '4821 Le secret de labbé Saunière');
    check('accents conservés', /è/.test(c), true);
    check('les 4 variantes convergent', [
        canonicalFolderName(1, "Le secret de l'abbé"),
        canonicalFolderName(1, 'Le secret de l’abbé'),
        canonicalFolderName(1, 'Le secret de l!abbé'),
    ], ['1 Le secret de labbé', '1 Le secret de labbé', '1 Le secret de labbé']);
    check('séparateur de chemin neutralisé', canonicalFolderName(2, 'A/B:C'), '2 A B C');
    check('antislash neutralisé', canonicalFolderName(3, 'A\\B'), '3 A B');
    check('tiret légitime conservé', canonicalFolderName(4, 'Tome 1 - Suite'), '4 Tome 1 - Suite');
    check('caractère de contrôle neutralisé', canonicalFolderName(5, 'AB'), '5 A B');
}

// --- 12. THE LINK: audio_filepath → préfixe de bucket -----------------------
// Chaînes réelles, copiées de la base et du bucket.
{
    check(
        'chemin NAS → préfixe bucket',
        dbPathToPrefix('T:\\2022\\21525  Le secret de l!abbé Saunière'),
        'dirt/2022/21525  Le secret de l!abbé Saunière/',
    );
    check(
        'double espace préservé',
        dbPathToPrefix('T:\\2016\\17450  Navigations en écriture'),
        'dirt/2016/17450  Navigations en écriture/',
    );
    check(
        '! préservé des deux côtés',
        dbPathToPrefix("T:\\2012\\11527  L!aventure et l!espérance"),
        'dirt/2012/11527  L!aventure et l!espérance/',
    );
    check('autre lettre de lecteur', dbPathToPrefix('Z:\\2013\\1  X'), 'dirt/2013/1  X/');
    check('barre oblique déjà correcte', dbPathToPrefix('T:/2013/1  X'), 'dirt/2013/1  X/');
    check('barre finale non doublée', dbPathToPrefix('T:\\2013\\1  X\\'), 'dirt/2013/1  X/');
    check('racine paramétrable', dbPathToPrefix('T:\\2013\\1  X', ''), '2013/1  X/');
    check('chaîne vide', dbPathToPrefix('   '), '');

    // Après le backfill la colonne contient déjà la clé du bucket : réappliquer
    // la fonction ne doit rien changer (sinon on obtiendrait dirt/dirt/…).
    const migrated = 'dirt/2022/21525  Le secret de l!abbé Saunière/';
    check('idempotent sur valeur déjà migrée', dbPathToPrefix(migrated), migrated);
    check('idempotent deux fois', dbPathToPrefix(dbPathToPrefix(migrated)), migrated);
    check(
        'idempotent sans barre finale',
        dbPathToPrefix('dirt/2022/21525  Le secret de l!abbé Saunière'),
        migrated,
    );
    check(
        'les deux formats convergent',
        dbPathToPrefix('T:\\2022\\21525  Le secret de l!abbé Saunière'),
        migrated,
    );
}

// --- 13. Les deux formats de piste réels ------------------------------------
{
    const dash = parseSection('d/1000 22- Le secret de l’abbé Saunière.mp3');
    check('format tiret', [dash.lead, dash.section, dash.title], [1000, 22, 'Le secret de l’abbé Saunière']);

    const space = parseSection('d/1000    01 Wisigoths intro.mp3');
    check('format espaces', [space.lead, space.section, space.title], [1000, 1, 'Wisigoths intro']);

    const pageNum = parseSection('d/1000   02 Wisigoths page  37.mp3');
    check('titre contenant des chiffres', [pageNum.section, pageNum.title], [2, 'Wisigoths page  37']);

    check('sans jeton de tête, tiret', parseSection('d/7-Titre.mp3').section, 7);
    check('sans jeton de tête, espace', parseSection('d/07 Titre.mp3').section, 7);
}

// --- 14. Tri naturel sur les trois formats réels ----------------------------
{
    const order = (names: string[]) =>
        orderSections(names.map((n) => parseSection('d/' + n))).map((s) => s.key.slice(2));

    check(
        'format tiret : 2 avant 10',
        order(['1000 10-T.mp3', '1000 2-T.mp3', '1000 1-T.mp3']),
        ['1000 1-T.mp3', '1000 2-T.mp3', '1000 10-T.mp3'],
    );
    check(
        'format zéro-préfixé',
        order(['1000   03 T.mp3', '1000    01 T.mp3', '1000   02 T.mp3']),
        ['1000    01 T.mp3', '1000   02 T.mp3', '1000   03 T.mp3'],
    );
    check(
        'format horodaté',
        order(['1000 141203_1226.MP3', '1000 141201_1225.MP3', '1000 141201_1224.MP3']),
        ['1000 141201_1224.MP3', '1000 141201_1225.MP3', '1000 141203_1226.MP3'],
    );
    check('comparaison naturelle nue', naturalCompare('x2', 'x10') < 0, true);
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent.');
process.exit(failures ? 1 : 0);
