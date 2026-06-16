// BillPDF.tsx
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { BillingStatus, getBillingStatusLabel } from '@/lib/billing-enums';

// ─── Brand / issuer (edit in one place) ─────────────────────────────────────
const NAVY = '#15366b';
const ORG = {
    name: 'ECA — Enregistrements à la Carte pour les Aveugles',
    delegation: 'Délégation des Auxiliaires des Aveugles',
    addr: ['71 avenue de Breteuil', '75015 PARIS'],
    phone: '01 88 32 31 47 / 48',
    email: 'ecapermanence@gmail.com',
};

// ─── Shape this component needs (kept local to stay decoupled) ───────────────
interface BillOrderLite {
    id: number;
    requestReceivedDate: string;
    sentDate?: string | null;       // date d'envoi au lecteur
    isDuplicate?: boolean;          // true => Dupliqué, false/undefined => Enregistré
    cost: number | string | null;
    catalogue: { title: string; author: string };
}
export interface BillPDFData {
    id: number;
    state: BillingStatus;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    paymentReference: string | null;
    invoiceAmount: number | string;
    client: {
        id: number;
        name: string | null;
        email: string | null;
        civility?: string | null;   // 'Madame' | 'Monsieur'
        firstName?: string | null;
        lastName?: string | null;
        address?: string[] | null;  // adresse postale, une ligne par entrée
    };
    orders: BillOrderLite[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const formatCurrency = (a: number | string | null) =>
    a == null
        ? '—'
        : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
            typeof a === 'string' ? parseFloat(a) : a
        );

const orderDate = (o: BillOrderLite) => o.sentDate ?? o.requestReceivedDate;

const STATUS_TINT: Record<BillingStatus, { bg: string; fg: string }> = {
    [BillingStatus.DRAFT]: { bg: '#eceff3', fg: '#374151' },
    [BillingStatus.BILLED]: { bg: '#fff4e0', fg: '#92400e' },
    [BillingStatus.PAID]: { bg: '#e6f4ea', fg: '#166534' },
    [BillingStatus.SOLDE]: { bg: '#e9f0fb', fg: NAVY },
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: { paddingVertical: 34, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#111827', lineHeight: 1.35 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderColor: NAVY, paddingBottom: 12, marginBottom: 14 },
    headerOrg: { maxWidth: 320 },
    orgName: { color: NAVY, fontSize: 12, fontWeight: 'bold', marginBottom: 3 },
    orgLine: { color: '#1f2937', fontSize: 9.5 },
    headerRight: { alignItems: 'flex-end' },
    docTitle: { color: NAVY, fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
    docNo: { color: '#1f2937', fontSize: 11, marginTop: 12, fontWeight: 'bold' },

    billToWrap: { alignItems: 'flex-end', marginBottom: 13 },
    billToCol: { width: '52%' },
    alignRight: { textAlign: 'right' },
    metaLabel: { fontSize: 8.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 'bold' },
    metaName: { fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
    metaLine: { fontSize: 9.5, color: '#1f2937' },

    infoStrip: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 7, marginBottom: 13 },
    infoCell: { flex: 1 },
    badge: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, fontSize: 9, fontWeight: 'bold' },

    th: { flexDirection: 'row', borderBottomWidth: 1.5, borderColor: NAVY, paddingVertical: 6, paddingHorizontal: 4 },
    thText: { color: NAVY, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#d1d5db' },

    cId: { width: 36 },
    cDesc: { flex: 1, paddingRight: 8 },
    cDate: { width: 60 },
    cType: { width: 66 },
    cAmt: { width: 70, textAlign: 'right' },

    bookTitle: { fontSize: 10, color: '#111827' },
    bookAuthor: { fontSize: 8.5, color: '#374151', marginTop: 1 },

    totals: { marginTop: 11, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: '#1f2937' },
    totalValue: { fontSize: 10, color: '#111827' },
    grandRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderColor: NAVY },
    grandLabel: { fontSize: 12, fontWeight: 'bold', color: NAVY, letterSpacing: 0.5 },
    grandValue: { fontSize: 14, fontWeight: 'bold', color: NAVY },

    payBox: { marginTop: 13, borderWidth: 1, borderColor: '#9ca3af', borderRadius: 4, padding: 10 },
    payLabel: { fontSize: 8, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 'bold' },
    payValue: { fontSize: 10, color: '#111827' },

    legal: { marginTop: 11, fontSize: 9, color: '#374151' },
    draftNote: { marginTop: 11, fontSize: 9, color: '#92400e', fontWeight: 'bold' },

    payInfoBox: { marginTop: 18, borderWidth: 1, borderColor: NAVY, borderRadius: 4, padding: 12, alignItems: 'center' },
    payInfoLine: { fontSize: 9.5, color: '#111827', textAlign: 'center', marginBottom: 3 },

    watermark: { position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontWeight: 'bold', color: NAVY, opacity: 0.06, transform: 'rotate(-24deg)' },
});

export const BillPDF = ({ bill, draft = false }: { bill: BillPDFData; draft?: boolean }) => {
    if (!bill) return null;
    const tint = STATUS_TINT[bill.state] ?? STATUS_TINT[BillingStatus.DRAFT];

    const auditeurName =
        [bill.client.civility, bill.client.firstName, bill.client.lastName].filter(Boolean).join(' ')
        || bill.client.name
        || 'Auditeur';

    // Date de création = date du 1er titre (envoi/réception) figurant sur la facture
    const titleDates = bill.orders.map(orderDate).filter(Boolean) as string[];
    const creationDate = titleDates.length
        ? [...titleDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
        : bill.creationDate;

    return (
        <Document title={`${draft ? 'Brouillon — ' : ''}Facture n°${bill.id} — ${auditeurName}`}>
            <Page size="A4" style={s.page} wrap>
                {draft && <Text style={s.watermark} fixed>BROUILLON</Text>}

                {/* Header (sans bandeau) */}
                <View style={s.header} wrap={false}>
                    <View style={s.headerOrg}>
                        <Text style={s.orgName}>{ORG.name}</Text>
                        <Text style={s.orgLine}>{ORG.delegation}</Text>
                        {ORG.addr.map((l, i) => <Text key={i} style={s.orgLine}>{l}</Text>)}
                        <Text style={s.orgLine}>Tél. {ORG.phone}</Text>
                        <Text style={s.orgLine}>{ORG.email}</Text>
                    </View>
                    <View style={s.headerRight}>
                        <Text style={s.docTitle}>FACTURE</Text>
                        <Text style={s.docNo}>N° {bill.id}</Text>
                    </View>
                </View>

                {/* Facturé à (auditeur) */}
                <View style={s.billToWrap}>
                    <View style={s.billToCol}>
                        <Text style={[s.metaLabel, s.alignRight]}>FACTURÉ À</Text>
                        <Text style={[s.metaName, s.alignRight]}>{auditeurName}</Text>
                        {bill.client.address?.filter(Boolean).map((l, i) => (
                            <Text key={i} style={[s.metaLine, s.alignRight]}>{l}</Text>
                        ))}
                        <Text style={[s.metaLine, s.alignRight]}>Réf. Auditeur : #{bill.client.id}</Text>
                    </View>
                </View>

                {/* Info strip */}
                <View style={s.infoStrip} wrap={false}>
                    <View style={s.infoCell}>
                        <Text style={s.metaLabel}>Date de création</Text>
                        <Text style={s.metaLine}>{formatDate(creationDate)}</Text>
                    </View>
                    <View style={s.infoCell}>
                        <Text style={s.metaLabel}>Date d&apos;émission</Text>
                        <Text style={s.metaLine}>{formatDate(bill.issueDate)}</Text>
                    </View>
                    <View style={s.infoCell}>
                        <Text style={s.metaLabel}>Statut</Text>
                        <Text style={[s.badge, { backgroundColor: tint.bg, color: tint.fg }]}>
                            {getBillingStatusLabel(bill.state)}
                        </Text>
                    </View>
                </View>

                {/* Line items table */}
                <View style={s.th} wrap={false}>
                    <Text style={[s.thText, s.cId]}>Réf.</Text>
                    <Text style={[s.thText, s.cDesc]}>Désignation</Text>
                    <Text style={[s.thText, s.cDate]}>Date d&apos;envoi</Text>
                    <Text style={[s.thText, s.cType]}>Type</Text>
                    <Text style={[s.thText, s.cAmt]}>Montant</Text>
                </View>

                {bill.orders.length === 0 ? (
                    <View style={s.tr}><Text style={s.metaLine}>Aucune demande rattachée à cette facture.</Text></View>
                ) : (
                    bill.orders.map((o) => (
                        <View key={o.id} style={s.tr} wrap={false}>
                            <Text style={[s.metaLine, s.cId]}>#{o.id}</Text>
                            <View style={s.cDesc}>
                                <Text style={s.bookTitle}>{o.catalogue.title}</Text>
                                <Text style={s.bookAuthor}>{o.catalogue.author}</Text>
                            </View>
                            <Text style={[s.metaLine, s.cDate]}>{formatDate(orderDate(o))}</Text>
                            <Text style={[s.metaLine, s.cType]}>{o.isDuplicate ? 'Dupliqué' : 'Enregistré'}</Text>
                            <Text style={[s.bookTitle, s.cAmt]}>{formatCurrency(o.cost)}</Text>
                        </View>
                    ))
                )}

                {/* Totals */}
                <View style={s.totals}>
                    <View style={s.totalRow}>
                        <Text style={s.totalLabel}>TVA</Text>
                        <Text style={s.totalValue}>Non applicable</Text>
                    </View>
                    <View style={s.grandRow}>
                        <Text style={s.grandLabel}>TOTAL À RÉGLER</Text>
                        <Text style={s.grandValue}>{formatCurrency(bill.invoiceAmount)}</Text>
                    </View>
                </View>

                {/* Paiement reçu (affiché si pertinent) */}
                {(bill.paymentReference || bill.paymentDate) && (
                    <View style={s.payBox} wrap={false}>
                        {bill.paymentReference && (
                            <>
                                <Text style={s.payLabel}>Référence de paiement</Text>
                                <Text style={s.payValue}>{bill.paymentReference}</Text>
                            </>
                        )}
                        {bill.paymentDate && (
                            <>
                                <Text style={[s.payLabel, { marginTop: bill.paymentReference ? 8 : 0 }]}>Date de paiement</Text>
                                <Text style={s.payValue}>{formatDate(bill.paymentDate)}</Text>
                            </>
                        )}
                    </View>
                )}

                {draft ? (
                    <Text style={s.draftNote}>Document provisoire — non valable comme facture.</Text>
                ) : (
                    <Text style={s.legal}>TVA non applicable, art. 293 B du CGI.</Text>
                )}

                {/* Encadré paiement (bas de page, centré) */}
                <View style={s.payInfoBox} wrap={false}>
                    <Text style={s.payInfoLine}>Association (loi 1901) non assujettie à la TVA.</Text>
                    <Text style={s.payInfoLine}>Règlement par chèque ou par virement bancaire :</Text>
                    <Text style={s.payInfoLine}>IBAN : FR76 1820 6004 6565 0607 5246 408</Text>
                    <Text style={s.payInfoLine}>BIC : AGRIFRPP882</Text>
                    <Text style={s.payInfoLine}>Merci de reporter le numéro de la facture au dos du chèque ou en référence du virement.</Text>
                </View>
            </Page>
        </Document>
    );
};