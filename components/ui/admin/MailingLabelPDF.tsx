// MailingLabelPDF.tsx
//
// Étiquette d'adresse — the address block that goes into the clear sleeve stuck
// on the return envelope.
//
// It carries the recipient's name and address, in bold, and nothing else: no
// mark, no expéditeur block, no phone number. That is the permanence's call,
// and the reason is postal rather than aesthetic — at label size, everything
// added around the address has to be set small to fit, and a sorting centre
// that reads a stray small line as part of the address downgrades the item.
// One address, set large and bold, is read right the first time.
//
// The geometry is not decorative either. The frame is 80 × 50 mm — the most the
// sleeve takes — and it sits at the top-left of the A4, flush left, so it comes
// off in two straight cuts. Anything printed below the frame is on the scrap:
// that's where the demande reference goes, so the packer can match envelope to
// package while the sheet is still whole, and it never reaches the auditeur.
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

/** Points per millimetre — PDF user space is 72 dpi. */
const MM = 72 / 25.4;

// Both dimensions are ceilings, and both are used in full: every millimetre
// spent here is a millimetre the address can be set larger in, and legibility
// at the sorting centre is the entire point of the change.
const LABEL_W = 80 * MM;
const LABEL_H = 50 * MM;

/** Cutting is done by hand — text never runs to an edge that may be trimmed. */
const PADDING = 3 * MM;
const BORDER = 1;
const USABLE_W = LABEL_W - (PADDING + BORDER) * 2;
const USABLE_H = LABEL_H - (PADDING + BORDER) * 2;

/** Top-left corner of the sheet, clear of the unprintable margin. */
const SHEET_MARGIN = 10 * MM;

const LINE_HEIGHT = 1.4;

// Type size is chosen at render time rather than fixed, because the box is
// fixed: a Parisian « 75015 PARIS » and a four-line address abroad cannot both
// be set at the same size inside 80 × 50 mm. Largest first — see fitFontSize.
const FONT_SIZES = [14, 13, 12, 11, 10, 9];

// Helvetica-Bold averages ≈0.6 em per character across the mixed case and caps
// an address uses. Only ever used to predict whether a line will wrap, so an
// approximation is enough; being slightly pessimistic is the safe direction.
const AVG_CHAR_EM = 0.6;

/** Helvetica-Bold's space, in em. Replaces the space split() removes below. */
const SPACE_EM = 0.278;

const rowsFor = (text: string, size: number) =>
    Math.max(1, Math.ceil((text.length * size * AVG_CHAR_EM) / USABLE_W));

/**
 * The largest size at which the whole block still fits the frame — preferring,
 * among those, the largest at which no line has to wrap at all. A wrapped rue
 * is harder to read than the same rue one point smaller, so a clean fit wins
 * over a big one; when nothing fits cleanly, height is what must give.
 */
function fitFontSize(texts: string[]): number {
    const fitsHeight = (size: number) =>
        texts.reduce((rows, t) => rows + rowsFor(t, size), 0) * size * LINE_HEIGHT <=
        USABLE_H;
    const noWrap = (size: number) => texts.every((t) => rowsFor(t, size) === 1);
    return (
        FONT_SIZES.find((size) => fitsHeight(size) && noWrap(size)) ??
        FONT_SIZES.find(fitsHeight) ??
        FONT_SIZES[FONT_SIZES.length - 1]
    );
}

export interface MailingLabelData {
    /** « Civilité Prénom NOM » — already postal-cased, see getPostalName. */
    recipient: string;
    /** Address lines, already postal-cased — see mailingAddressLines. */
    lines: string[];
    /**
     * Printed small, BELOW the frame, i.e. on the part that gets thrown away.
     * Used to tie the sheet to what's being shipped (« Demande #1234 — Titre »).
     * Never part of the address block.
     */
    reference?: string | null;
}

const styles = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        color: '#111827',
        paddingTop: SHEET_MARGIN,
        paddingLeft: SHEET_MARGIN,
    },

    // The frame: fixed at the sleeve's maximum, and the cutting guide. Grey and
    // dashed because it is an instruction to the person at the printer, not a
    // rule meant to be looked at — and a solid box around an address is one more
    // thing a sorting machine has to decide to ignore.
    label: {
        width: LABEL_W,
        height: LABEL_H,
        padding: PADDING,
        borderWidth: BORDER,
        borderColor: '#9ca3af',
        borderStyle: 'dashed',
        justifyContent: 'center',
    },

    // Each line is a wrapping row of one Text per word, not a single Text.
    // Handed a line too long for the width, react-pdf hyphenates it, and it
    // breaks *inside the word*: « Madame Marie-Christine DELAUNAY-BERDAI » came
    // out of a test render as « DELAU-NAY-BERDAI ». A patronyme cut in half is
    // not an address, and neither is a rue.
    //
    // One word per Text makes that structurally impossible — the row can only
    // break between words, which is what a human addressing the envelope would
    // do. The alternative, registerHyphenationCallback, is global to react-pdf's
    // Font module, so it would retypeset the facture too depending on which PDF
    // the admin printed first.
    line: { flexDirection: 'row', flexWrap: 'wrap' },

    // Everything below is on the scrap.
    scrap: { paddingTop: 6 * MM, width: LABEL_W },
    cutHint: { fontSize: 7.5, color: '#9ca3af' },
    reference: { fontSize: 8.5, color: '#6b7280', marginTop: 10 },
});

/**
 * One address line, set bold and unbreakable mid-word.
 *
 * The face is named outright rather than asked for with fontWeight: 'bold'.
 * react-pdf only synthesises a weight for a family registered with one, and the
 * built-in Helvetica is not — a fontWeight on it renders regular, silently, and
 * an étiquette that came out of the printer in book weight is exactly the thin
 * print this format exists to avoid.
 */
const LabelLine = ({ text, size }: { text: string; size: number }) => (
    <View style={styles.line}>
        {text
            .split(/\s+/)
            .filter(Boolean)
            .map((word, i) => (
                <Text
                    key={i}
                    style={{
                        fontFamily: 'Helvetica-Bold',
                        fontSize: size,
                        lineHeight: LINE_HEIGHT,
                        marginRight: size * SPACE_EM,
                    }}
                >
                    {word}
                </Text>
            ))}
    </View>
);

export const MailingLabelPDF = ({ label }: { label: MailingLabelData }) => {
    const texts = [label.recipient, ...label.lines];
    const size = fitFontSize(texts);

    return (
        <Document title={`Étiquette d'adresse — ${label.recipient}`}>
            <Page size="A4" style={styles.page}>
                <View style={styles.label}>
                    {texts.map((text, i) => (
                        <LabelLine key={i} text={text} size={size} />
                    ))}
                </View>

                <View style={styles.scrap}>
                    <Text style={styles.cutHint}>Découper le long du cadre.</Text>
                    {label.reference ? (
                        <Text style={styles.reference}>{label.reference}</Text>
                    ) : null}
                </View>
            </Page>
        </Document>
    );
};
