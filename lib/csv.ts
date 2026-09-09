/**
 * Écriture de CSV pour un tableur FRANÇAIS.
 *
 * Le format « CSV » qu'attend Excel en locale française n'est pas celui du
 * RFC 4180, et l'écart n'est pas cosmétique : un fichier séparé par des virgules
 * s'ouvre entièrement dans la colonne A, et sans BOM les accents deviennent du
 * charabia. Les deux défauts sont invisibles à la relecture du code et
 * immédiats à l'ouverture du fichier, d'où ce module plutôt qu'un `join(',')`
 * recopié à chaque export.
 */

/** Excel en français attend le point-virgule ; la virgule y sépare les décimales. */
export const CSV_SEPARATOR = ';';

/** CRLF : ce qu'attendent Excel et le RFC. */
const CSV_NEWLINE = '\r\n';

/**
 * Sans lui, Excel lit le fichier en codepage système et « Cotisation réglée »
 * devient « Cotisation rÃ©glÃ©e ». Trois octets qui décident si l'export est
 * utilisable.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);

/**
 * Les caractères par lesquels un tableur reconnaît une FORMULE.
 *
 * Une cellule qui commence par l'un d'eux est évaluée à l'ouverture : une
 * observation saisie « =2+3 » s'affiche « 5 », et des formes moins innocentes
 * atteignent d'autres cellules ou des liens externes. Le champ « Observations »
 * est du texte libre saisi par des permanents, donc exactement le vecteur
 * concerné, et un export se transmet par courriel — il s'ouvre ailleurs que
 * chez celui qui l'a produit.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise une cellule TEXTE.
 *
 * L'apostrophe en tête est la parade reconnue des tableurs : elle force la
 * lecture littérale et ne s'affiche pas. Réservée aux champs venant de la
 * saisie — les nombres et les dates sont produits ici même et n'ont pas à être
 * défigurés parce qu'un montant négatif commence par un tiret.
 */
function defuseFormula(value: string): string {
    return FORMULA_PREFIXES.some((p) => value.startsWith(p)) ? `'${value}` : value;
}

export type CsvCell = string | number | null | undefined;

/**
 * Une cellule, échappée.
 *
 * `untrusted` distingue le texte saisi (à neutraliser) de ce que l'export
 * fabrique lui-même. Les guillemets internes se doublent, et toute cellule
 * portant un séparateur, un guillemet ou un saut de ligne est entourée — sans
 * quoi une observation sur deux lignes casserait le fichier en deux.
 */
export function csvCell(value: CsvCell, untrusted = false): string {
    if (value === null || value === undefined) return '';

    let text = String(value);
    if (untrusted) text = defuseFormula(text);

    const mustQuote =
        text.includes(CSV_SEPARATOR) ||
        text.includes('"') ||
        text.includes('\n') ||
        text.includes('\r');

    return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Une ligne complète. `untrustedColumns` désigne les colonnes issues de la saisie. */
export function csvRow(cells: CsvCell[], untrustedColumns: ReadonlySet<number> = new Set()): string {
    return cells.map((cell, i) => csvCell(cell, untrustedColumns.has(i))).join(CSV_SEPARATOR) + CSV_NEWLINE;
}

/** Un nombre au format français : virgule décimale, sans séparateur de milliers. */
export function csvNumber(value: number | string | null | undefined, digits = 2): string {
    if (value === null || value === undefined) return '';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return Number.isFinite(n) ? n.toFixed(digits).replace('.', ',') : '';
}
