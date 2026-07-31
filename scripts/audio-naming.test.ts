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

// ------------------------------------------------- dossier existant, tiret

{
    // The real shape from dirt/2022/21525: `1000 22- Le secret de l’abbé Saunière.mp3`
    const existing = [
        '1000 01- Le secret de l’abbé Saunière.mp3',
        '1000 02- Le secret de l’abbé Saunière.mp3',
        '1000 22- Le secret de l’abbé Saunière.mp3',
    ];
    const out = nextTrackName(existing, 'Suite.mp3');
    check('lead réutilisé', out.filename, '1000 023 Suite.mp3');
    check('stratégie', out.strategy, 'suite-numerotation');
    checkSortsLast('nouvelle piste après toutes les anciennes (tiret)', existing, out.filename);
}

// ---------------------------------------------- dossier existant, double espace

{
    const existing = ['1000  01 Wisigoths intro.mp3', '1000   03 Wisigoths.mp3'];
    const out = nextTrackName(existing, 'Wisigoths fin.mp3');
    checkSortsLast('espaces irréguliers gérés', existing, out.filename);
    check('numérotation poursuivie malgré les espaces', out.filename, '1000 004 Wisigoths fin.mp3');
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
