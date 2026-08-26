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
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { ORG } from '@/lib/org';
import { PRINT_CECOGRAMME_MENTION } from '@/lib/feature-flags';

const NAVY = '#15366b';

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
    /**
     * Print the « CÉCOGRAMME » postal mention. Unlike the reference this one is
     * ABOVE the cut, on the strip that actually reaches La Poste — it is a
     * franking marking, not a packing note. Only set for an envelope carrying a
     * recording; a generic label (a facture, a letter to a donateur) must never
     * claim the franchise. Gated by PRINT_CECOGRAMME_MENTION.
     */
    cecogramme?: boolean;
}

const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', color: '#111827' },

    // The label strip: fixed height so the cut line lands on the exact third.
    label: {
        height: LABEL_HEIGHT,
        paddingTop: 30,
        paddingHorizontal: 46,
        borderBottomWidth: 1,
        borderBottomColor: '#9ca3af',
        borderBottomStyle: 'dashed',
    },

    // Sender left, franking mention right — the corner where a stamp would go.
    labelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cecogramme: {
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        color: NAVY,
        borderWidth: 1,
        borderColor: NAVY,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },

    // Expéditeur — deliberately small. It is there so an undeliverable envelope
    // comes back to ECA, not to be read.
    senderName: { fontSize: 8, fontWeight: 'bold', color: NAVY },
    senderLine: { fontSize: 7.5, color: '#4b5563', lineHeight: 1.35 },

    // Destinataire — indented and dropped down the strip, which is roughly
    // where a window envelope expects it and where a sleeve shows it best.
    recipientBlock: { marginTop: 34, paddingLeft: '38%' },
    recipientName: { fontSize: 16, fontWeight: 'bold', lineHeight: 1.5 },
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
                <View style={styles.labelHead}>
                    <View>
                        <Text style={styles.senderName}>{ORG.name}</Text>
                        <Text style={styles.senderLine}>{ORG.delegation}</Text>
                        {ORG.addr.map((line, i) => (
                            <Text key={i} style={styles.senderLine}>{line}</Text>
                        ))}
                        <Text style={styles.senderLine}>Tél. {ORG.phone}</Text>
                    </View>
                    {PRINT_CECOGRAMME_MENTION && label.cecogramme ? (
                        <Text style={styles.cecogramme}>CÉCOGRAMME</Text>
                    ) : null}
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
