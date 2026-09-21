/**
 * La recherche du mode d'emploi : fonctions pures, partagées par le serveur
 * (qui découpe les sections) et le navigateur (qui cherche dedans).
 *
 * Pas de moteur de recherche, pas de route d'API : le guide entier fait une
 * douzaine de milliers de mots, il tient dans la page et se parcourt en une
 * fraction de milliseconde à chaque frappe.
 *
 * Trois choses font le travail qu'un simple « contient » ne ferait pas :
 * - les accents et la casse sont repliés (« recu » trouve « reçu ») ;
 * - un mot tapé trouve ceux qui COMMENCENT par lui, singulier et pluriel
 *   confondus (« factur » et « factures » trouvent « facture ») ;
 * - les SYNONYMES : on cherche avec ses mots, pas avec ceux de l'interface.
 *   Qui tape « commande » ou « bénévole » doit tomber sur Demandes et Lecteurs.
 */

/** Un morceau du guide : l'introduction d'une section, ou un de ses titres. */
export interface AideSearchEntry {
    slug: string;
    sectionTitle: string;
    /** Le titre `##`/`###` du morceau ; null pour l'introduction de la section. */
    heading: string | null;
    /** L'ancre du titre ; null pour l'introduction (on ouvre la section en haut). */
    anchor: string | null;
    /** Le texte du morceau, sans balisage Markdown. */
    text: string;
}

export interface AideSearchHit {
    entry: AideSearchEntry;
    score: number;
    /** Un extrait du texte autour du premier mot trouvé, découpé pour le surlignage. */
    snippet: { text: string; match: boolean }[];
}

/**
 * Les synonymes : un mot qu'on pourrait taper → les mots du GUIDE qu'il doit
 * trouver. Dans un seul sens, exprès : « reçu » doit trouver Paiements, mais
 * « paiement » ne doit pas se mettre à trouver les enregistrements audio.
 *
 * Clés et valeurs s'écrivent déjà repliées (sans accents, en minuscules), et
 * chaque valeur doit figurer dans le guide — un synonyme qui ne mène à aucun
 * mot du texte ne sert à rien. `pnpm aide:check` le vérifie.
 */
export const AIDE_SYNONYMS: Record<string, string[]> = {
    // L'ancien vocabulaire, renommé dans l'interface mais pas dans les têtes.
    commande: ['demande'],
    affectation: ['attribution'],
    affecter: ['attribution'],
    attribuer: ['attribution'],

    // Les personnes.
    admin: ['permanent'],
    administrateur: ['permanent'],
    salarie: ['permanent'],
    benevole: ['lecteur'],
    lectrice: ['lecteur'],
    narrateur: ['lecteur'],
    voix: ['lecteur'],
    aveugle: ['auditeur'],
    malvoyant: ['auditeur'],
    ecouteur: ['auditeur'],
    client: ['auditeur'],
    abonne: ['auditeur'],
    bienfaiteur: ['donateur'],
    mecene: ['donateur', 'don'],
    personne: ['membre', 'fiche'],
    utilisateur: ['membre', 'fiche'],
    adherent: ['membre', 'cotisation'],

    // L'argent.
    reglement: ['paiement'],
    recu: ['paiement'],
    cheque: ['paiement'],
    virement: ['paiement'],
    versement: ['paiement'],
    encaisser: ['paiement'],
    payer: ['paiement'],
    adhesion: ['cotisation'],
    invoice: ['facture'],
    devis: ['pro-forma'],
    proforma: ['pro-forma'],
    prix: ['tarif'],
    cout: ['tarif', 'prix'],
    montant: ['tarif', 'prix'],
    donation: ['don'],
    impaye: ['retard'],
    relance: ['retard'],
    imprimer: ['impression', 'imprim'],
    pdf: ['impression', 'imprim'],
    excel: ['csv', 'export'],
    tableur: ['csv', 'export'],

    // Les livres et le son.
    ouvrage: ['livre'],
    titre: ['livre'],
    categorie: ['genre'],
    theme: ['genre'],
    magazine: ['revue'],
    journal: ['revue', 'journal'],
    selection: ['liste', 'coup'],
    nouveaute: ['liste', 'nouveaute'],
    son: ['audio'],
    mp3: ['audio', 'mp3'],
    enregistrement: ['audio', 'enregistrement'],
    fichier: ['audio', 'fichier'],
    piste: ['audio', 'piste'],
    doublon: ['doublon', 'fusion'],
    fusionner: ['fusion'],
    double: ['doublon'],
    poubelle: ['corbeille'],
    efface: ['supprim', 'corbeille'],
    effacer: ['supprim', 'corbeille'],
    recuperer: ['restaur'],
    annuler: ['restaur'],

    // Le reste de l'outil.
    planning: ['disponibilite', 'calendrier'],
    agenda: ['disponibilite', 'calendrier'],
    absence: ['indisponibilite'],
    conge: ['indisponibilite'],
    vacances: ['indisponibilite'],
    passe: ['identifiant', 'passe'],
    password: ['identifiant', 'passe'],
    connexion: ['identifiant', 'connexion'],
    login: ['identifiant', 'connexion'],
    historique: ['historique', 'journal'],
    log: ['journal'],
    chiffre: ['indicateur', 'statistique'],
    stat: ['statistique', 'indicateur'],
    actualite: ['dernieres'],
    news: ['dernieres'],
    site: ['public'],
};

/**
 * Les mots vides, qu'on ignore dans la requête : « comment faire une facture »
 * ne doit pas exiger « comment » ni « faire » dans le texte.
 */
const STOPWORDS = new Set([
    'a', 'au', 'aux', 'avec', 'ce', 'ces', 'cette', 'comment', 'd', 'dans', 'de', 'des', 'du',
    'en', 'est', 'et', 'faire', 'fait', 'il', 'je', 'l', 'la', 'le', 'les', 'ma', 'mes', 'mon',
    'n', 'ne', 'on', 'ou', 'par', 'pas', 'peut', 'pour', 'qu', 'que', 'quel', 'quelle', 'qui',
    'quoi', 's', 'sa', 'se', 'ses', 'sur', 'un', 'une', 'y',
]);

const WORD_RE = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

/** Accents et casse repliés, comme `slugifyHeading`. */
export function foldText(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[œŒ]/g, 'oe')
        .replace(/[æÆ]/g, 'ae')
        .toLowerCase();
}

/**
 * La racine grossière d'un mot : le pluriel retiré. Assez pour que « factures »
 * et « facture » se confondent ; le reste, la recherche par début de mot s'en
 * charge (« attribu » trouve « attribution » comme « attribuée »).
 *
 * Pas en dessous de six lettres : le mot tronqué sert de DÉBUT de mot, et
 * « devis » devenu « devi » se mettait à trouver « devient ».
 */
function stem(word: string): string {
    if (word.length > 5 && /[sx]$/.test(word)) return word.slice(0, -1);
    return word;
}

const SYNONYM_KEYS = Object.keys(AIDE_SYNONYMS);

/**
 * Les synonymes d'un mot tapé. La recherche se fait à chaque frappe : sans la
 * correspondance par début de mot, « comman » ne trouverait rien et il faudrait
 * finir « commande » pour voir apparaître les demandes. Quatre lettres au moins,
 * pour que « co » ne tire pas la moitié de la liste.
 */
function synonymsOf(word: string): string[] {
    const exact = AIDE_SYNONYMS[word] ?? AIDE_SYNONYMS[stem(word)];
    if (exact) return exact;
    if (word.length < 4) return [];
    return SYNONYM_KEYS.filter((k) => k.startsWith(word)).flatMap((k) => AIDE_SYNONYMS[k]);
}

/** Les mots de la requête, chacun avec les formes qui le satisfont. */
function queryTerms(query: string): { direct: string; synonyms: string[] }[] {
    const words = foldText(query).match(WORD_RE) ?? [];
    return words
        .filter((w) => !STOPWORDS.has(w))
        .map((w) => {
            const direct = stem(w);
            const synonyms = [...new Set(synonymsOf(w).map(stem))].filter((s) => s !== direct);
            return { direct, synonyms };
        });
}

/**
 * Un mot du texte répond à une forme cherchée s'il commence par elle. Sauf
 * pour les formes de deux lettres (« cd »), qui doivent tomber juste :
 * « cd » ne doit pas trouver tous les mots qui commencent par ces lettres.
 */
function wordMatches(word: string, form: string): boolean {
    return form.length < 3 ? word === form : word.startsWith(form);
}

function matchesAny(word: string, forms: string[]): boolean {
    return forms.some((f) => wordMatches(word, f));
}

export function foldedWords(text: string): string[] {
    return foldText(text).match(WORD_RE) ?? [];
}

const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 200;

/** L'extrait à afficher : une fenêtre autour du premier mot trouvé, surligné. */
function buildSnippet(text: string, forms: string[]): AideSearchHit['snippet'] {
    const words = [...text.matchAll(WORD_RE)];
    const first = words.find((m) => matchesAny(foldText(m[0]), forms));

    let start = 0;
    if (first?.index !== undefined && first.index > SNIPPET_BEFORE) {
        // On recule jusqu'à une frontière de mot, pour ne pas couper le premier.
        start = text.lastIndexOf(' ', first.index - SNIPPET_BEFORE) + 1;
    }
    let end = Math.min(text.length, start + SNIPPET_LENGTH);
    if (end < text.length) {
        const space = text.lastIndexOf(' ', end);
        if (space > start) end = space;
    }

    const parts: AideSearchHit['snippet'] = [];
    if (start > 0) parts.push({ text: '… ', match: false });

    let cursor = start;
    for (const m of words) {
        const at = m.index ?? 0;
        if (at < start || at + m[0].length > end) continue;
        if (!matchesAny(foldText(m[0]), forms)) continue;
        if (at > cursor) parts.push({ text: text.slice(cursor, at), match: false });
        parts.push({ text: m[0], match: true });
        cursor = at + m[0].length;
    }
    if (cursor < end) parts.push({ text: text.slice(cursor, end), match: false });
    if (end < text.length) parts.push({ text: ' …', match: false });
    return parts;
}

/** Ce qu'un mot rapporte selon l'endroit où il est trouvé. */
const WEIGHT = { heading: 10, section: 6, body: 1 };
/** Un mot trouvé par synonyme compte un peu moins que le mot tapé lui-même. */
const SYNONYM_FACTOR = 0.7;

/** Les entrées prêtes à chercher : le texte replié une fois, pas à chaque frappe. */
export interface PreparedAideEntry {
    entry: AideSearchEntry;
    headingWords: string[];
    sectionWords: string[];
    bodyWords: string[];
}

export function prepareAideEntries(entries: AideSearchEntry[]): PreparedAideEntry[] {
    return entries.map((entry) => ({
        entry,
        headingWords: foldedWords(entry.heading ?? ''),
        sectionWords: foldedWords(entry.sectionTitle),
        bodyWords: foldedWords(entry.text),
    }));
}

function fieldScore(words: string[], forms: string[], weight: number, perWordCap: number): number {
    let hits = 0;
    for (const w of words) {
        if (matchesAny(w, forms) && ++hits >= perWordCap) break;
    }
    return hits * weight;
}

/**
 * Les morceaux qui répondent à la requête, du plus pertinent au moins
 * pertinent. Chaque mot de la requête doit être trouvé — par lui-même ou par un
 * synonyme : « facture brouillon » ne remonte que ce qui parle des deux.
 */
export function searchAide(prepared: PreparedAideEntry[], query: string, limit = 12): AideSearchHit[] {
    const terms = queryTerms(query);
    if (terms.length === 0) return [];

    const hits: AideSearchHit[] = [];
    for (const p of prepared) {
        let score = 0;
        let allFound = true;
        for (const { direct, synonyms } of terms) {
            const scoreFor = (forms: string[]) =>
                fieldScore(p.headingWords, forms, WEIGHT.heading, 1) +
                fieldScore(p.sectionWords, forms, WEIGHT.section, 1) +
                fieldScore(p.bodyWords, forms, WEIGHT.body, 5);
            const termScore = Math.max(
                scoreFor([direct]),
                synonyms.length > 0 ? scoreFor(synonyms) * SYNONYM_FACTOR : 0,
            );
            if (termScore === 0) {
                allFound = false;
                break;
            }
            score += termScore;
        }
        if (!allFound) continue;

        const forms = terms.flatMap((t) => [t.direct, ...t.synonyms]);
        hits.push({ entry: p.entry, score, snippet: buildSnippet(p.entry.text, forms) });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
