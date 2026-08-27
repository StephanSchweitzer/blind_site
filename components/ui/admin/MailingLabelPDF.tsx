// MailingLabelPDF.tsx
//
// Étiquette d'adresse — the address block that goes into the clear sleeve stuck
// on the return envelope, reproducing the old Arbre Vert sheet.
//
// Geometry matters here and is not decorative: A4 is 841.89pt tall, so the
// label occupies the top 280.63pt (99mm × 210mm) and the cut line sits exactly
// on that boundary. Cut along it and what comes off is a strip that fits a
// standard pochette porte-documents. Anything printed below the line is on the
// scrap half — that's where the demande reference goes, so the packer can match
// envelope to package while it's still one sheet, and it never reaches the
// auditeur.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { ORG } from '@/lib/org';

const NAVY = '#15366b';

// The mark alone — not the full logotype the facture heads with. That one
// carries « enregistrements à la carte pour les aveugles » and « Délégation des
// Auxiliaires des Aveugles », which are ORG.name's tail and ORG.delegation, i.e.
// two lines this label already prints as text three millimetres away. At the
// width a label affords, that lettering would render around 2pt: illegible, and
// therefore pure ink for no information. So the asset is cropped to the « eca »
// glyphs and the orange dot.
//
// 550 × 491 px for a printed width of 44pt — about 900 dpi, well past the 300
// print wants, and it stays the source resolution rather than being resampled.
// Opaque white field: on a white label, transparency buys nothing.
const MARK_SRC = '/eca_mark.png';
const MARK_RATIO = 550 / 491;
// Ink is the constraint here — unlike the facture, a label prints once per
// shipment. At 44pt the mark covers ~0.12% of the sheet (a page of text is
// nearer 5%), and it is short enough to sit inside the sender block's own
// height, so it costs no vertical space either.
const MARK_W = 44;

/** A4 in points, and the third of it the label occupies. */
const A4_HEIGHT = 841.89;
const LABEL_HEIGHT = A4_HEIGHT / 3;

export interface MailingLabelData {
    /** « Civilité Prénom NOM » — already postal-cased, see getPostalName. */
    recipient: string;
    /** Address lines, already postal-cased — see mailingAddressLines. */
    lines: string[];
    /**
     * Printed small, BELOW the cut line, i.e. on the part that gets thrown
     * away. Used to tie the sheet to what's being shipped
     * (« Demande #1234 — Titre »). Never part of the address block.
     */
    reference?: string | null;
}

const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', color: '#111827' },

    // The label strip: fixed height so the cut line lands on the exact third.
    label: {
        height: LABEL_HEIGHT,
        paddingTop: 30,
        paddingHorizontal: 46,
        borderBottomWidth: 1,
        // Darker than the surrounding hairlines on purpose: this one is a
        // cutting guide on an office printer, not a rule to be looked at.
        borderBottomColor: '#6b7280',
        borderBottomStyle: 'dashed',
    },

    // Expéditeur — mark to the left of the address, the corner French envelopes
    // put it in. Deliberately small: the block is there so an undeliverable
    // envelope comes back to ECA, not to be read.
    sender: { flexDirection: 'row', alignItems: 'flex-start' },
    mark: { width: MARK_W, height: MARK_W / MARK_RATIO, marginRight: 10 },
    senderText: { paddingTop: 1 },
    senderName: { fontSize: 8, fontWeight: 'bold', color: NAVY },
    senderLine: { fontSize: 7.5, color: '#4b5563', lineHeight: 1.35 },

    // Destinataire — indented and dropped down the strip, which is roughly
    // where a window envelope expects it and where a sleeve shows it best.
    //
    // The indent is 32%, not the 38% it started at, and the name is 15pt rather
    // than 16. Both because « Civilité Prénom NOM » is one line under the norme
    // d'adressage and react-pdf, run out of width, breaks it *inside the word*:
    // a « Madame Marie-Christine DELAUNAY-BERDAI » came out as « DELAU-NAY-
    // BERDAI ». These numbers fit ~41 characters, which covers the composite
    // first names and hyphenated surnames that actually occur. Beyond that it
    // still hyphenates — the only complete fix is registerHyphenationCallback,
    // and that is global to react-pdf's Font module, so it would silently
    // retypeset the facture too depending on which PDF the admin printed first.
    recipientBlock: { marginTop: 34, paddingLeft: '32%' },
    recipientName: { fontSize: 15, fontWeight: 'bold', lineHeight: 1.5 },
    recipientLine: { fontSize: 14, lineHeight: 1.5 },

    // Everything below is on the scrap.
    scrap: { paddingTop: 8, paddingHorizontal: 46 },
    cutHint: { fontSize: 7.5, color: '#9ca3af' },
    reference: { fontSize: 8.5, color: '#6b7280', marginTop: 10 },
});

export const MailingLabelPDF = ({ label }: { label: MailingLabelData }) => (
    <Document title={`Étiquette d'adresse — ${label.recipient}`}>
        <Page size="A4" style={styles.page}>
            <View style={styles.label}>
                <View style={styles.sender}>
                    {/* jsx-a11y sees an <img> ; react-pdf's Image takes no alt —
                        a PDF's alternative text goes through its structure, not
                        through this component. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={MARK_SRC} style={styles.mark} />
                    <View style={styles.senderText}>
                        <Text style={styles.senderName}>{ORG.name}</Text>
                        <Text style={styles.senderLine}>{ORG.delegation}</Text>
                        {ORG.addr.map((line, i) => (
                            <Text key={i} style={styles.senderLine}>{line}</Text>
                        ))}
                        <Text style={styles.senderLine}>Tél. {ORG.phone}</Text>
                    </View>
                </View>

                <View style={styles.recipientBlock}>
                    <Text style={styles.recipientName}>{label.recipient}</Text>
                    {label.lines.map((line, i) => (
                        <Text key={i} style={styles.recipientLine}>{line}</Text>
                    ))}
                </View>
            </View>

            <View style={styles.scrap}>
                <Text style={styles.cutHint}>Découper le long du pointillé.</Text>
                {label.reference ? (
                    <Text style={styles.reference}>{label.reference}</Text>
                ) : null}
            </View>
        </Page>
    </Document>
);
