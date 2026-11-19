// PaymentPDF.tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { ORG } from '@/lib/org';
import { parisDate } from '@/lib/paris-day';
import { getPaymentMethodLabel, PaymentType, type PaymentMethod } from '@/lib/payment-enums';
import { displayReceiptNumber } from '@/lib/payments/status';

// Les trois papiers d'un paiement — pro-forma, demande de paiement, reçu — sur la
// charpente de la facture pro-forma (ProformaPDF) : en-tête filé avec logotype et
// titre, bande « Adressé à » / numéro et date, tableau, total, encadré, coordonnées
// en pied de page. Un auditeur qui reçoit une facture et un appel de cotisation
// doit reconnaître le même expéditeur.
//
// Une seule page, sans densité adaptative : un paiement porte UNE ligne. BillPDF
// a besoin de sa densité pour sept titres ; ici, rien ne déborde.
//
// Le document suit le geste, pas seulement le statut : la pro-forma s'imprime
// tant que rien n'est parti, la demande une fois datée, le reçu une fois numéroté
// (lib/payments/documents.ts). Le composant ne décide rien — il imprime ce qu'on
// lui dit d'imprimer, avec les dates déjà posées.
//
// LE REÇU N'EST PAS UN REÇU FISCAL. Il atteste un encaissement, rien de plus : pas
// de Cerfa 11580, pas de mention de réduction d'impôt. Savoir si les ECA peuvent en
// émettre est une question ouverte, à régler avec la trésorière avant d'ajouter
// quoi que ce soit ici.

export type PaymentDocumentKind = 'PROFORMA' | 'REQUEST' | 'RECEIPT';

export interface PaymentPDFData {
    id: number;
    type: PaymentType;
    amount: string | number;
    paymentMethod: PaymentMethod | null;
    paymentReference: string | null;
    creationDate: string;
    requestDate: string | null;
    paymentDate: string | null;
    receiptNumber: string | null;
    issueDate: string | null;
    cotisationYear: number | null;
    bill: { id: number } | null;
    client: {
        civility: string | null;
        firstName: string | null;
        lastName: string | null;
        address: string[];
    } | null;
}

const NAVY = '#15366b';
// Même remarque que BillPDF : la graisse se demande par la police, pas par
// fontWeight, que la Helvetica intégrée ignore sans rien dire.
const BOLD = 'Helvetica-Bold';
const PAGE_PAD_X = 48;
const LOGO_SRC = '/eca_logo_facture.png';
const LOGO_RATIO = 750 / 381;

const eur = (v: number | string) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(typeof v === 'string' ? parseFloat(v) : v);
const day = (d: string | null | undefined) => (d ? parisDate(d) : '—');

const styles = StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: PAGE_PAD_X, fontFamily: 'Helvetica', fontSize: 10, color: '#111827', lineHeight: 1.4 },

    header: { alignItems: 'center', borderBottomWidth: 2, borderColor: NAVY, paddingBottom: 12, marginBottom: 16 },
    logo: { width: 176, height: 176 / LOGO_RATIO, marginBottom: 14 },
    docTitle: { color: NAVY, fontSize: 22, fontFamily: BOLD, letterSpacing: 3, textAlign: 'center' },

    footer: { position: 'absolute', bottom: 22, left: PAGE_PAD_X, right: PAGE_PAD_X, textAlign: 'center', fontSize: 8, color: '#4b5563' },

    billRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 11, marginBottom: 20 },
    billToCol: { width: '52%' },
    billMetaCol: { width: '42%' },
    metaItem: { marginBottom: 9 },
    alignRight: { textAlign: 'right' },
    metaLabel: { fontSize: 8.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: BOLD },
    metaName: { fontSize: 11, fontFamily: BOLD, color: '#111827', marginBottom: 2 },
    metaNumber: { fontSize: 13, fontFamily: BOLD, color: NAVY },
    metaLine: { fontSize: 9.5, color: '#1f2937' },

    th: { flexDirection: 'row', borderBottomWidth: 1.5, borderColor: NAVY, paddingVertical: 9, paddingHorizontal: 4 },
    thText: { color: NAVY, fontSize: 9, fontFamily: BOLD, textTransform: 'uppercase', letterSpacing: 0.5 },
    tr: { flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#d1d5db' },
    cDesc: { flex: 1, paddingRight: 12 },
    cAmt: { width: 90, textAlign: 'right' },
    lineText: { fontSize: 10, color: '#111827' },

    totals: { marginTop: 13, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: '#1f2937' },
    totalValue: { fontSize: 10, color: '#111827' },
    grandRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', marginTop: 7, paddingTop: 9, borderTopWidth: 1.5, borderColor: NAVY },
    grandLabel: { fontSize: 12, fontFamily: BOLD, color: NAVY, letterSpacing: 0.5 },
    grandValue: { fontSize: 14, fontFamily: BOLD, color: NAVY },

    legal: { marginTop: 12, fontSize: 9, color: '#374151' },
    note: { marginTop: 12, fontSize: 9.5, color: '#1f2937' },

    settledBox: { marginTop: 13, borderWidth: 1.5, borderColor: NAVY, borderRadius: 4, padding: 10 },
    settledTitle: { fontSize: 11, fontFamily: BOLD, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' },
    payRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    payLabel: { fontSize: 8, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontFamily: BOLD },
    payValue: { fontSize: 10, color: '#111827' },

    payInfoBox: { marginTop: 13, borderWidth: 1, borderColor: NAVY, borderRadius: 4, padding: 11, alignItems: 'center' },
    payInfoLine: { fontSize: 9.5, color: '#111827', textAlign: 'center', marginBottom: 3 },
});

/** Ce que la ligne du tableau dit de la somme. */
function designation(p: PaymentPDFData): string {
    switch (p.type) {
        case PaymentType.COTISATION:
            return p.cotisationYear ? `Cotisation ${p.cotisationYear}` : 'Cotisation';
        case PaymentType.ENREGISTREMENT:
            return p.bill ? `Règlement de la facture n° ${p.bill.id}` : 'Enregistrement';
        case PaymentType.DON:
            return 'Don';
        default:
            return 'Divers';
    }
}

const TITLES: Record<PaymentDocumentKind, string> = {
    PROFORMA: 'PRO-FORMA',
    REQUEST: 'DEMANDE DE PAIEMENT',
    RECEIPT: 'REÇU',
};

export const PaymentPDF = ({ payment, kind }: { payment: PaymentPDFData; kind: PaymentDocumentKind }) => {
    const isReceipt = kind === 'RECEIPT';
    const name = payment.client
        ? [payment.client.civility, payment.client.firstName, payment.client.lastName].filter(Boolean).join(' ')
        : '';
    const address = payment.client?.address.filter(Boolean) ?? [];
    const label = designation(payment);

    // Le numéro et la date de la bande : ceux du document imprimé, pas du paiement.
    const meta: { numberLabel: string; number: string; dateLabel: string; date: string | null } = isReceipt
        ? {
            numberLabel: 'Reçu n°',
            number: payment.receiptNumber ? displayReceiptNumber(payment.receiptNumber) : '—',
            dateLabel: 'Date d’émission',
            date: payment.issueDate,
        }
        // « Paiement n° », pas « Demande n° » : aux ECA, une demande est la demande
        // d'un livre (Orders), et son numéro n'est pas celui-ci.
        : kind === 'REQUEST'
            ? { numberLabel: 'Paiement n°', number: String(payment.id), dateLabel: 'Date de la demande', date: payment.requestDate }
            : { numberLabel: 'Paiement n°', number: String(payment.id), dateLabel: 'Date', date: payment.creationDate };

    const docName = isReceipt ? `Reçu n°${meta.number}` : `${kind === 'REQUEST' ? 'Demande de paiement' : 'Pro-forma'} n°${payment.id}`;

    return (
        <Document title={`${docName}${name ? ` — ${name}` : ''}`}>
            <Page size="A4" style={styles.page}>
                <Text style={styles.footer} fixed>
                    {ORG.addr.join(' — ')} — Tél. {ORG.phone} — {ORG.email}
                </Text>

                <View style={styles.header} wrap={false}>
                    {/* jsx-a11y voit un <img> ; l'Image de react-pdf n'accepte pas d'attribut alt. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={LOGO_SRC} style={styles.logo} />
                    <Text style={styles.docTitle}>{TITLES[kind]}</Text>
                </View>

                <View style={styles.billRow} wrap={false}>
                    <View style={styles.billToCol}>
                        <Text style={styles.metaLabel}>{isReceipt ? 'Reçu de' : 'Adressé à'}</Text>
                        {/* Un « Divers » peut être anonyme : la bande le dit plutôt que de laisser un blanc. */}
                        <Text style={styles.metaName}>{name || 'Anonyme'}</Text>
                        {address.map((l, i) => <Text key={i} style={styles.metaLine}>{l}</Text>)}
                    </View>
                    <View style={styles.billMetaCol}>
                        <View style={styles.metaItem}>
                            <Text style={[styles.metaLabel, styles.alignRight]}>{meta.numberLabel}</Text>
                            <Text style={[styles.metaNumber, styles.alignRight]}>{meta.number}</Text>
                        </View>
                        <View>
                            <Text style={[styles.metaLabel, styles.alignRight]}>{meta.dateLabel}</Text>
                            <Text style={[styles.metaLine, styles.alignRight]}>{day(meta.date)}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.th} wrap={false}>
                    <Text style={[styles.thText, styles.cDesc]}>Désignation</Text>
                    <Text style={[styles.thText, styles.cAmt]}>Montant</Text>
                </View>
                <View style={styles.tr} wrap={false}>
                    <Text style={[styles.lineText, styles.cDesc]}>{label}</Text>
                    <Text style={[styles.lineText, styles.cAmt]}>{eur(payment.amount)}</Text>
                </View>

                <View style={styles.totals} wrap={false}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>TVA</Text>
                        <Text style={styles.totalValue}>Non applicable</Text>
                    </View>
                    <View style={styles.grandRow}>
                        <Text style={styles.grandLabel}>{isReceipt ? 'MONTANT REÇU' : 'TOTAL À RÉGLER'}</Text>
                        <Text style={styles.grandValue}>{eur(payment.amount)}</Text>
                    </View>
                </View>

                <Text style={styles.legal}>TVA non applicable, art. 293 B du CGI.</Text>

                {isReceipt ? (
                    <>
                        <View style={styles.settledBox} wrap={false}>
                            <Text style={styles.settledTitle}>Paiement reçu</Text>
                            <View style={styles.payRow}>
                                <View>
                                    <Text style={styles.payLabel}>Date du règlement</Text>
                                    <Text style={styles.payValue}>{day(payment.paymentDate)}</Text>
                                </View>
                                {payment.paymentMethod && (
                                    <View>
                                        <Text style={styles.payLabel}>Mode</Text>
                                        <Text style={styles.payValue}>{getPaymentMethodLabel(payment.paymentMethod)}</Text>
                                    </View>
                                )}
                                {payment.paymentReference && (
                                    <View>
                                        <Text style={[styles.payLabel, styles.alignRight]}>Référence</Text>
                                        <Text style={[styles.payValue, styles.alignRight]}>{payment.paymentReference}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        <Text style={styles.note}>
                            Les ECA attestent avoir reçu la somme de {eur(payment.amount)} au titre de : {label.toLowerCase()}.
                        </Text>
                    </>
                ) : (
                    <>
                        {kind === 'PROFORMA' && (
                            <Text style={styles.note}>Document établi à titre d’information, avant la demande de paiement.</Text>
                        )}
                        <View style={styles.payInfoBox} wrap={false}>
                            <Text style={styles.payInfoLine}>Association (loi 1901) non assujettie à la TVA.</Text>
                            <Text style={styles.payInfoLine}>
                                Règlement par chèque à l’ordre de ECA – {ORG.delegation}, ou par virement bancaire :
                            </Text>
                            <Text style={styles.payInfoLine}>IBAN : {ORG.iban}</Text>
                            <Text style={styles.payInfoLine}>BIC : {ORG.bic}</Text>
                            <Text style={styles.payInfoLine}>
                                Merci de reporter le numéro de paiement (n° {payment.id}) au dos du chèque ou en référence du virement.
                            </Text>
                        </View>
                    </>
                )}
            </Page>
        </Document>
    );
};
