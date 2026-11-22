/**
 * Exercises the upload naming rules against the filename shapes that actually
 * occur in the bucket. No network, no database.
 *
 *   pnpm tsx scripts/audio-naming.test.ts
 *
 * The property that matters: a newly named file must sort AFTER every existing
 * file in its folder under naturalCompare. A track that sorts into the middle
 * plays an audiobook's chapters out of order.
 */
import {
    nextTrackName,
    sanitiseTrackTitle,
    canonicalFolderName,
    newBookFolderPrefix,
    commonLead,
    isAllowedAudioExtension,
    naturalCompare,
    alreadyUploadedFinder,
    byteOrderCompare,
    cdOrderConflict,
} from '../lib/audio/naming';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        attendu ${JSON.stringify(expected)}\n        obtenu  ${JSON.stringify(actual)}`),
    );
}

function checkSortsLast(label: string, existing: string[], produced: string) {
    const worst = existing.filter((e) => naturalCompare(produced, e) <= 0);
    const ok = worst.length === 0;
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        « ${produced} » ne se classe pas après ${JSON.stringify(worst)}`),
    );
}

/** What a CD burner or player does: compare the UTF-8 bytes, nothing else. */
const bytes = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function checkBytesLast(label: string, existing: string[], produced: string) {
    const worst = existing.filter((e) => bytes(produced, e) <= 0);
    const ok = worst.length === 0;
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        « ${produced} » ne se classe pas après ${JSON.stringify(worst)} (octets)`),
    );
}

// --------------------------------------------------------------- sanitisation

check('apostrophe droite retirée', sanitiseTrackTitle("L'assommoir"), 'Lassommoir');
check('point d exclamation retiré (substitut d apostrophe)', sanitiseTrackTitle('l!abbé'), 'labbé');
check('accents conservés', sanitiseTrackTitle('Émile à Saunière'), 'Émile à Saunière');
check('séparateurs de chemin neutralisés', sanitiseTrackTitle('a/b\\c:d'), 'a b c d');
check('espaces multiples réduits', sanitiseTrackTitle('Le   secret'), 'Le secret');

check('extension acceptée', isAllowedAudioExtension('x.mp3'), true);
check('extension majuscule acceptée', isAllowedAudioExtension('x.MP3'), true);
check('extension refusée', isAllowedAudioExtension('x.exe'), false);
check('sans extension refusée', isAllowedAudioExtension('x'), false);

// ---------------------------------------------------------------------- leads

check('lead commun détecté', commonLead(['1000 01 a.mp3', '1000 02 b.mp3']), '1000');
check('leads divergents → null', commonLead(['1000 01 a.mp3', '1001 02 b.mp3']), null);
check('pas de lead → null', commonLead(['01 a.mp3', '02 b.mp3']), null);
// Régression : « 001 Titre.mp3 » est un numéro de piste suivi d'un titre, pas un
// lead. Le confondre rendait tout dossier créé par nos propres envois
// inextensible — le deuxième fichier ne pouvait plus être numéroté.
check('numéro de piste seul n’est pas un lead', commonLead(['001 Chapitre.mp3']), null);
check(
    'numéro de piste seul, plusieurs fichiers',
    commonLead(['001 Chapitre.mp3', '002 Suite.mp3']),
    null,
);

// ------------------------------------------------------------- dossier neuf

check(
    'dossier vide → séquence propre sans lead',
    nextTrackName([], 'Chapitre 1.mp3'),
    { filename: '001 Chapitre 1.mp3', strategy: 'premier-fichier' },
);
check(
    'titre nettoyé à l envoi',
    nextTrackName([], "L'assommoir — part 1.mp3").filename,
    '001 Lassommoir — part 1.mp3',
);

// Un dossier créé par nos propres envois doit rester extensible, y compris quand
// le fichier suivant porte exactement le même nom d'origine.
{
    const existing = ['001 Essai.mp3'];
    const out = nextTrackName(existing, 'Essai.mp3');
    check('deuxième envoi dans un dossier créé par nous', out.filename, '002 Essai.mp3');
    checkSortsLast('le deuxième envoi se classe après le premier', existing, out.filename);
    const third = nextTrackName([...existing, out.filename], 'Essai.mp3');
    check('troisième envoi', third.filename, '003 Essai.mp3');
}

// Régression (novembre 2026, « La villa rose ») : le lecteur numérote lui-même
// ses fichiers « 01 Titre ». Le premier devenait « 001 01 Titre » et les
// suivants « 001 002 02 Titre » : bon ordre dans le portail, mais un graveur de
// CD trie octet par octet et jouait la présentation juste avant le chapitre 10.
{
    const originals = Array.from({ length: 28 }, (_, i) => `${String(i + 1).padStart(2, '0')} LA VILLA ROSE.mp3`);
    originals.push('29PND 2109.mp3'); // numéro collé au titre
    const folder: string[] = [];
    for (const o of originals) folder.push(nextTrackName(folder, o).filename);
    check('titre numéroté : premier fichier au même format', folder[0], '001 001 01 LA VILLA ROSE.mp3');
    check('titre numéroté : deuxième fichier', folder[1], '001 002 02 LA VILLA ROSE.mp3');
    check('ordre octet par octet (CD) = ordre d’envoi', [...folder].sort(), folder);
    check(
        'ordre naturel (portail) = ordre d’envoi',
        [...folder].sort(naturalCompare),
        folder,
    );
    check(
        'numéro collé au titre',
        nextTrackName([], '01PND 2109.mp3').filename,
        '001 001 01PND 2109.mp3',
    );
}

// ------------------------------------------- avertissement ordre CD (panneau)

{
    const sample = ['1000 9 Chagrin.mp3', '1000 10 Chagrin.mp3', 'É.mp3', 'e.mp3', 'Z 😀.mp3', 'Z �.mp3', '1000  01.mp3'];
    check(
        'byteOrderCompare = ordre des octets UTF-8',
        [...sample].sort(byteOrderCompare),
        [...sample].sort(bytes),
    );

    const lagging = ['1000 01 A.mp3', '1000 02 B.mp3'];
    check('largeur gardée : pas d’avertissement', cdOrderConflict(lagging, ['C.mp3', '04 D.mp3']), null);

    const full = Array.from({ length: 9 }, (_, i) => `1000 ${i + 1} Chagrin.mp3`);
    check(
        'passage 9 → 10 : avertissement nommant la piste et sa voisine sur le CD',
        cdOrderConflict(full, ['Suite.mp3']),
        { newName: '1000 010 Suite.mp3', playsBefore: '1000 1 Chagrin.mp3' },
    );
    check(
        'passage 9 → 10 au milieu d’un lot',
        cdOrderConflict(full.slice(0, 7), ['8 A.mp3', '9 B.mp3', '10 C.mp3'])?.newName,
        '1000 010 10 C.mp3',
    );
    const already = ['1000 1 A.mp3', '1000 10 B.mp3', '1000 2 C.mp3'].sort(naturalCompare);
    check('dossier déjà hors ordre CD : pas d’avertissement', cdOrderConflict(already, ['D.mp3']), null);
    check('dossier vide : pas d’avertissement', cdOrderConflict([], ['01 A.mp3', '02 B.mp3']), null);
    check('envoi que le serveur refuserait : pas d’avertissement', cdOrderConflict(lagging, ['x.exe']), null);
}

// ------------------------------------------------- dossier existant, tiret

{
    // The real shape from dirt/2022/21525: `1000 22- Le secret de l’abbé Saunière.mp3`
    const existing = [
        '1000 01- Le secret de l’abbé Saunière.mp3',
        '1000 02- Le secret de l’abbé Saunière.mp3',
        '1000 22- Le secret de l’abbé Saunière.mp3',
    ];
    const out = nextTrackName(existing, 'Suite.mp3');
    check('lead réutilisé, largeur du dossier gardée', out.filename, '1000 23 Suite.mp3');
    check('stratégie', out.strategy, 'suite-numerotation');
    checkSortsLast('nouvelle piste après toutes les anciennes (tiret)', existing, out.filename);
    checkBytesLast('… et aussi sur un CD (octet par octet)', existing, out.filename);
}

// ---------------------------------------- largeur de numérotation du dossier

// Régression (novembre 2026) : l'envoi écrivait toujours trois chiffres. Dans un
// ancien dossier « 1000 01 … 1000 17 », la piste suivante devenait « 1000 018 » :
// bon ordre dans le portail, mais un graveur de CD la jouait entre 09 et 10.
// 7 075 dossiers vivants étaient dans ce cas.
{
    const existing = Array.from({ length: 17 }, (_, i) => `1000 ${String(i + 1).padStart(2, '0')} P ${i * 15} STEINER.mp3`);
    const out = nextTrackName(existing, 'Chapitre.mp3');
    check('deux chiffres : la suite garde deux chiffres', out.filename, '1000 18 Chapitre.mp3');
    checkBytesLast('deux chiffres : en dernier sur un CD', existing, out.filename);
    const numbered = nextTrackName(existing, '18 Chapitre.mp3');
    check('titre numéroté par le lecteur, deux chiffres', numbered.filename, '1000 18 18 Chapitre.mp3');
    checkBytesLast('titre numéroté : en dernier sur un CD', existing, numbered.filename);

    // Un lot entier, numéroté fichier après fichier comme le fait upload-url.
    const folder = [...existing];
    for (let i = 18; i <= 40; i++) folder.push(nextTrackName(folder, `${i} Chapitre.mp3`).filename);
    check('lot de 23 envois : ordre CD = ordre portail', [...folder].sort(bytes), [...folder].sort(naturalCompare));
}
{
    const existing = ['1000 1 Intro.mp3', '1000 2 Suite.mp3', '1000 7 Fin.mp3'];
    const out = nextTrackName(existing, 'Annexe.mp3');
    check('un chiffre : la suite garde un chiffre', out.filename, '1000 8 Annexe.mp3');
    checkBytesLast('un chiffre : en dernier sur un CD', existing, out.filename);
}
{
    const existing = ['1000 0001 Lacan.mp3', '1000 0002 Lacan.mp3'];
    const out = nextTrackName(existing, 'Lacan.mp3');
    check('quatre chiffres : la suite garde quatre chiffres', out.filename, '1000 0003 Lacan.mp3');
    checkBytesLast('quatre chiffres : en dernier sur un CD', existing, out.filename);
}
{
    // Nos propres dossiers (« 001 NNN … ») restent à trois chiffres.
    const existing = ['001 001 01 Titre.mp3', '001 002 02 Titre.mp3'];
    check('dossier du portail : trois chiffres', nextTrackName(existing, '03 Titre.mp3').filename, '001 003 03 Titre.mp3');
}
{
    // Le numéro suivant ne tient plus dans la largeur du dossier (9 → 10), ou le
    // dossier mêle deux largeurs : aucun nom ne se classe juste dans les deux
    // ordres sans renommer les autres. On garde trois chiffres, comme avant —
    // l'ordre du portail, lui, reste garanti.
    const full = Array.from({ length: 9 }, (_, i) => `1000 ${i + 1} Chagrin.mp3`);
    const out = nextTrackName(full, 'Suite.mp3');
    check('largeur dépassée (9 → 10) : trois chiffres', out.filename, '1000 010 Suite.mp3');
    checkSortsLast('largeur dépassée : en dernier dans le portail', full, out.filename);
    const mixed = ['1000 001 Présentation.mp3', '1000 02 Chapitre.mp3', '1000 53 bibliographie.mp3'];
    const outMixed = nextTrackName(mixed, 'Suite.mp3');
    check('largeurs mêlées : trois chiffres', outMixed.filename, '1000 054 Suite.mp3');
    checkSortsLast('largeurs mêlées : en dernier dans le portail', mixed, outMixed.filename);
}

// ---------------------------------------------- dossier existant, double espace

{
    const existing = ['1000  01 Wisigoths intro.mp3', '1000   03 Wisigoths.mp3'];
    const out = nextTrackName(existing, 'Wisigoths fin.mp3');
    checkSortsLast('espaces irréguliers gérés', existing, out.filename);
    check('numérotation poursuivie malgré les espaces', out.filename, '1000 04 Wisigoths fin.mp3');
}

// -------------------------------------------------- dossier numéroté par date

{
    // `1000 141201_1224.MP3` — "plus haut + 1" serait une date, pas une position.
    const existing = ['1000 141201_1224.MP3', '1000 141203_1226.MP3'];
    const out = nextTrackName(existing, 'suite.mp3');
    checkSortsLast('horodatage : la nouvelle piste passe en dernier', existing, out.filename);
    check('stratégie de repli utilisée', out.strategy, 'suite-numerotation');
}

// ------------------------------------------------------------ dossier sans n°

{
    const existing = ['intro.mp3', 'partie deux.mp3'];
    let threw = false;
    let produced = '';
    try {
        produced = nextTrackName(existing, 'fin.mp3').filename;
    } catch {
        threw = true;
    }
    // Either it produces something that genuinely sorts last, or it refuses.
    // Silently producing a mis-ordered name is the one unacceptable outcome.
    if (threw) {
        console.log('ok    dossier non numéroté → refus explicite');
    } else {
        checkSortsLast('dossier non numéroté', existing, produced);
    }
}

// ------------------------------------------------------------ extension refusée

{
    let msg = '';
    try {
        nextTrackName([], 'malware.exe');
    } catch (e) {
        msg = (e as Error).message;
    }
    check('extension non audio rejetée', msg.startsWith('Extension non autorisée'), true);
}

// ------------------------------------------------------- fichiers déjà envoyés

{
    // The October 2026 incident: the same 39 files picked three times became
    // 117 tracks. Replays the first pick through nextTrackName, then checks the
    // second pick finds every file already there.
    const originals = Array.from({ length: 39 }, (_, i) => ({
        name: `${String(i + 1).padStart(2, '0')} D'un soleil à l'autre.mp3`,
        size: 4_000_000 + i,
    }));
    const folder: { name: string; sizeBytes: number }[] = [];
    for (const f of originals) {
        const { filename } = nextTrackName(folder.map((t) => t.name), f.name);
        folder.push({ name: filename, sizeBytes: f.size });
    }
    const find = alreadyUploadedFinder(folder);
    check(
        'second choix du même dossier : les 39 fichiers sont reconnus',
        originals.filter((f) => find(f) !== null).length,
        39,
    );
    check('reconnu sous son nom stocké', find(originals[0]), folder[0].name);
    check('reconnu malgré la numérotation de tête', find(originals[38]), folder[38].name);
    check(
        'même nom, autre taille : pas un doublon (nouvelle prise)',
        find({ name: originals[4].name, size: originals[4].size + 1 }),
        null,
    );
    check(
        'même taille, autre titre : pas un doublon',
        find({ name: '05 Autre titre.mp3', size: originals[4].size }),
        null,
    );
    check(
        'extension en majuscules et accents décomposés (macOS)',
        find({ name: originals[2].name.replace('.mp3', '.MP3').normalize('NFD'), size: originals[2].size }),
        folder[2].name,
    );
    check(
        'dossier ancien avec lead : « 1000 22- Titre.mp3 » ← « 22- Titre.mp3 »',
        alreadyUploadedFinder([{ name: '1000 22- Titre.mp3', sizeBytes: 10 }])({
            name: '22- Titre.mp3',
            size: 10,
        }),
        '1000 22- Titre.mp3',
    );
    check(
        'nom identique sans numéro, même taille : doublon',
        alreadyUploadedFinder([{ name: 'Titre.mp3', sizeBytes: 10 }])({ name: 'Titre.mp3', size: 10 }),
        'Titre.mp3',
    );
    check('dossier vide : rien de présent', alreadyUploadedFinder([])(originals[0]), null);
}

// ------------------------------------------------------------------- dossiers

check('nom de dossier canonique', canonicalFolderName(21525, "Le secret de l'abbé Saunière"), '21525 Le secret de labbé Saunière');
check(
    'préfixe pour un livre sans audio (id Access)',
    newBookFolderPrefix({ id: 7, title: 'Germinal', source_access_id: 21999 }, 2026),
    'dirt/2026/21999 Germinal/',
);
check(
    'repli sur Book.id quand source_access_id est absent',
    newBookFolderPrefix({ id: 7, title: 'Germinal', source_access_id: null }, 2026),
    'dirt/2026/7 Germinal/',
);

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent.');
process.exitCode = failures ? 1 : 0;
