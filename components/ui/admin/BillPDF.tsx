// BillPDF.tsx
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { BillingStatus, getBillingStatusLabel } from '@/lib/billing-enums';

// ─── Brand / issuer (edit in one place) ─────────────────────────────────────
const NAVY = '#15366b';
const ORG = {
    name: 'ECA — Enregistrements à la Carte pour les Aveugles',
    addr: ['Association loi 1901', 'Paris, France'],
    phone: '01 88 32 31 47 / 48',
    email: 'ecapermanence@gmail.com',
};

// ─── Shape this component needs (kept local to stay decoupled) ───────────────
interface BillOrderLite {
    id: number;
    requestReceivedDate: string;
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
    client: { id: number; name: string | null; email: string | null };
    orders: BillOrderLite[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const formatCurrency = (a: number | string | null) =>
    a == null
        ? '—'
        : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
            typeof a === 'string' ? parseFloat(a) : a
        );

const STATUS_TINT: Record<BillingStatus, { bg: string; fg: string }> = {
    [BillingStatus.DRAFT]: { bg: '#eceff3', fg: '#4b5563' },
    [BillingStatus.BILLED]: { bg: '#fff4e0', fg: '#b45309' },
    [BillingStatus.PAID]: { bg: '#e6f4ea', fg: '#1e7d3a' },
    [BillingStatus.SOLDE]: { bg: '#e9f0fb', fg: NAVY },
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: { paddingVertical: 34, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', lineHeight: 1.3 },

    band: { backgroundColor: NAVY, borderRadius: 6, paddingVertical: 13, paddingHorizontal: 22, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    bandOrg: { color: '#ffffff', fontSize: 11, maxWidth: 280 },
    bandRight: { alignItems: 'flex-end' },
    bandTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
    bandNo: { color: '#cdd9ee', fontSize: 11, marginTop: 9 },

    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
    metaCol: { width: '47%' },
    metaLabel: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    metaName: { fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
    metaLine: { fontSize: 9.5, color: '#4b5563' },

    infoStrip: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingVertical: 7, marginBottom: 13 },
    infoCell: { flex: 1 },
    badge: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, fontSize: 9, fontWeight: 'bold' },

    th: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    thText: { color: '#ffffff', fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: '#eef1f6' },
    trAlt: { backgroundColor: '#f8fafc' },

    cId: { width: 42 },
    cDesc: { flex: 1, paddingRight: 8 },
    cDate: { width: 70 },
    cAmt: { width: 78, textAlign: 'right' },

    bookTitle: { fontSize: 10, color: '#111827' },
    bookAuthor: { fontSize: 8.5, color: '#6b7280', marginTop: 1 },

    totals: { marginTop: 11, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: '#4b5563' },
    totalValue: { fontSize: 10, color: '#111827' },
    grandRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderColor: NAVY },
    grandLabel: { fontSize: 12, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5 },
    grandValue: { fontSize: 14, fontWeight: 'bold', color: NAVY },

    payBox: { marginTop: 13, backgroundColor: '#f6f9fd', borderRadius: 4, padding: 10 },
    payLabel: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
    payValue: { fontSize: 10, color: '#1f2937', fontFamily: 'Helvetica' },

    legal: { marginTop: 11, fontSize: 8.5, color: '#9ca3af' },
    draftNote: { marginTop: 11, fontSize: 9, color: '#b45309', fontWeight: 'bold' },
    watermark: { position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontWeight: 'bold', color: NAVY, opacity: 0.06, transform: 'rotate(-24deg)' },
    footer: { position: 'absolute', bottom: 22, left: 48, right: 48, textAlign: 'center', fontSize: 9, color: NAVY, borderTopWidth: 1, borderColor: '#e5e7eb', paddingTop: 8 },
});

export const BillPDF = ({ bill, draft = false }: { bill: BillPDFData; draft?: boolean }) => {
    if (!bill) return null;
    const tint = STATUS_TINT[bill.state] ?? STATUS_TINT[BillingStatus.DRAFT];

    return (
        <Document title={`${draft ? 'Brouillon — ' : ''}Facture n°${bill.id} — ${bill.client.name ?? ''}`}>
            <Page size="A4" style={s.page} wrap>
                {draft && <Text style={s.watermark} fixed>BROUILLON</Text>}

                {/* Header band */}
                <View style={s.band} wrap={false}>
                    <Text style={s.bandOrg}>{ORG.name}</Text>
                    <View style={s.bandRight}>
                        <Text style={s.bandTitle}>FACTURE</Text>
                        <Text style={s.bandNo}>N° {bill.id}</Text>
                    </View>
                </View>

                {/* Émetteur / Facturé à */}
                <View style={s.metaRow}>
                    <View style={s.metaCol}>
                        <Text style={s.metaLabel}>Émetteur</Text>
                        <Text style={s.metaName}>{ORG.name}</Text>
                        {ORG.addr.map((l, i) => <Text key={i} style={s.metaLine}>{l}</Text>)}
                        <Text style={s.metaLine}>{ORG.phone}</Text>
                        <Text style={s.metaLine}>{ORG.email}</Text>
                    </View>
                    <View style={s.metaCol}>
                        <Text style={s.metaLabel}>Facturé à</Text>
                        <Text style={s.metaName}>{bill.client.name || 'Client'}</Text>
                        {bill.client.email && <Text style={s.metaLine}>{bill.client.email}</Text>}
                        <Text style={s.metaLine}>Réf. client : #{bill.client.id}</Text>
                    </View>
                </View>

                {/* Info strip */}
                <View style={s.infoStrip} wrap={false}>
                    <View style={s.infoCell}>
                        <Text style={s.metaLabel}>Date de création</Text>
                        <Text style={s.metaLine}>{formatDate(bill.creationDate)}</Text>
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
                    <Text style={[s.thText, s.cDate]}>Date</Text>
                    <Text style={[s.thText, s.cAmt]}>Montant</Text>
                </View>

                {bill.orders.length === 0 ? (
                    <View style={s.tr}><Text style={s.metaLine}>Aucune demande rattachée à cette facture.</Text></View>
                ) : (
                    bill.orders.map((o, i) => (
                        <View key={o.id} style={[s.tr, ...(i % 2 ? [s.trAlt] : [])]} wrap={false}>
                            <Text style={[s.metaLine, s.cId]}>#{o.id}</Text>
                            <View style={s.cDesc}>
                                <Text style={s.bookTitle}>{o.catalogue.title}</Text>
                                <Text style={s.bookAuthor}>{o.catalogue.author}</Text>
                            </View>
                            <Text style={[s.metaLine, s.cDate]}>{formatDate(o.requestReceivedDate)}</Text>
                            <Text style={[s.bookTitle, s.cAmt]}>{formatCurrency(o.cost)}</Text>
                        </View>
                    ))
                )}

                {/* Totals */}
                <View style={s.totals}>
                    <View style={s.totalRow}>
                        <Text style={s.totalLabel}>Sous-total</Text>
                        <Text style={s.totalValue}>{formatCurrency(bill.invoiceAmount)}</Text>
                    </View>
                    <View style={s.totalRow}>
                        <Text style={s.totalLabel}>TVA</Text>
                        <Text style={s.totalValue}>Non applicable</Text>
                    </View>
                    <View style={s.grandRow}>
                        <Text style={s.grandLabel}>Total à régler</Text>
                        <Text style={s.grandValue}>{formatCurrency(bill.invoiceAmount)}</Text>
                    </View>
                </View>

                {/* Payment details (shown once relevant) */}
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

                {/* Legal mention — remove if not applicable to your structure */}
                {draft ? (
                    <Text style={s.draftNote}>Document provisoire — non valable comme facture.</Text>
                ) : (
                    <Text style={s.legal}>TVA non applicable, art. 293 B du CGI.</Text>
                )}

                <Text style={s.footer} fixed>
                    À régler auprès de l&apos;ECA  ·  {ORG.phone}  ·  {ORG.email}
                </Text>
            </Page>
        </Document>
    );
};