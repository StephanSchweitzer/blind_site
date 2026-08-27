// BillPDF.tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { BillingStatus } from '@/lib/billing-enums';
import { ORG } from '@/lib/org';

// ─── Brand ──────────────────────────────────────────────────────────────────
// The issuer block itself lives in lib/org.ts — shared with MailingLabelPDF.
const NAVY = '#15366b';

// Le bloc-marque en tête de facture.
// PNG et non le JPEG d'origine : celui-ci est encodé en progressif, que le filtre
// DCTDecode d'un PDF ne sait pas relire — et le PNG évite au passage les artefacts
// de compression sur les arêtes nettes du logotype. 1000 × 508 px pour une
// largeur imprimée de 96 à 176 pt, soit 400 à 750 dpi : largement au-dessus des
// 300 dpi attendus en impression. Le fond est blanc opaque : sur une page
// blanche, la transparence n'apporterait rien.
const LOGO_SRC = '/eca_logo_facture.png';
const LOGO_RATIO = 1000 / 508;

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

// ─── Adaptive vertical density ───────────────────────────────────────────────
// Few orders → roomy spacing (fills the page nicely).
// Many orders → tighter spacing, down to a floor reached at COUNT_TIGHT.
// The floor is deliberately a touch more generous than a hard squeeze, so at
// ~10 orders the page is dense but still legible (two pages then being expected).
const COUNT_ROOMY = 2;
const COUNT_TIGHT = 10;

const densityFor = (n: number) => {
    const t = Math.min(1, Math.max(0, (n - COUNT_ROOMY) / (COUNT_TIGHT - COUNT_ROOMY)));
    const L = (roomy: number, tight: number) => roomy + (tight - roomy) * t;
    return {
        // Le bloc-marque respire quand la facture est courte et se resserre quand
        // elle se remplit — sans jamais descendre sous une taille où le logotype
        // resterait lisible à l'impression.
        logoW: L(176, 96),
        logoMarB: L(14, 5),
        titleSize: L(26, 16),
        pageTop: L(34, 28),
        line: L(1.4, 1.3),
        headPadB: L(12, 9),
        headMarB: L(16, 11),
        billPadY: L(11, 8),
        billMarB: L(16, 11),
        metaMarB: L(9, 6),
        thPadY: L(9, 7),
        trPadY: L(11, 8),
        totalsTop: L(13, 9),
        grandTop: L(7, 5),
        grandPadT: L(9, 7),
        payTop: L(13, 10),
        payPad: L(10, 9),
        legalTop: L(12, 9),
        infoPad: L(11, 9),
        infoLineMarB: L(3, 2),
    };
};

type Density = ReturnType<typeof densityFor>;

// ─── Styles (built per-bill so spacing can adapt to the order count) ─────────
const makeStyles = (d: Density) => StyleSheet.create({
    page: { paddingTop: d.pageTop, paddingBottom: d.pageTop, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#111827', lineHeight: d.line },

    header: { alignItems: 'center', borderBottomWidth: 2, borderColor: NAVY, paddingBottom: d.headPadB, marginBottom: d.headMarB },
    logo: { width: d.logoW, height: d.logoW / LOGO_RATIO, marginBottom: d.logoMarB },
    docTitle: { color: NAVY, fontSize: d.titleSize, fontWeight: 'bold', letterSpacing: 3, textAlign: 'center' },
    // Les coordonnées de l'émetteur vivent dans la marge basse, répétées sur
    // chaque page : l'en-tête reste un vrai papier à en-tête (marque + objet du
    // document), et les ~35 pt ainsi rendus au flux valent deux lignes de
    // tableau — soit une facture de plus qui tient sur une seule feuille.
    footer: { position: 'absolute', bottom: 14, left: 48, right: 48, textAlign: 'center', fontSize: 8, color: '#4b5563' },

    billRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: d.billPadY, marginBottom: d.billMarB },
    billToCol: { width: '52%' },
    billMetaCol: { width: '42%' },
    metaItem: { marginBottom: d.metaMarB },
    alignRight: { textAlign: 'right' },
    metaLabel: { fontSize: 8.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 'bold' },
    metaName: { fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
    metaNumber: { fontSize: 13, fontWeight: 'bold', color: NAVY },
    metaLine: { fontSize: 9.5, color: '#1f2937' },

    th: { flexDirection: 'row', borderBottomWidth: 1.5, borderColor: NAVY, paddingVertical: d.thPadY, paddingHorizontal: 4 },
    thText: { color: NAVY, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    tr: { flexDirection: 'row', paddingVertical: d.trPadY, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#d1d5db' },

    cId: { width: 36 },
    cDesc: { flex: 1, paddingRight: 8 },
    cDate: { width: 92 },
    cType: { width: 66 },
    cAmt: { width: 70, textAlign: 'right' },

    bookTitle: { fontSize: 10, color: '#111827' },
    bookAuthor: { fontSize: 8.5, color: '#374151', marginTop: 1 },

    totals: { marginTop: d.totalsTop, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: '#1f2937' },
    totalValue: { fontSize: 10, color: '#111827' },
    grandRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', marginTop: d.grandTop, paddingTop: d.grandPadT, borderTopWidth: 1.5, borderColor: NAVY },
    grandLabel: { fontSize: 12, fontWeight: 'bold', color: NAVY, letterSpacing: 0.5 },
    grandValue: { fontSize: 14, fontWeight: 'bold', color: NAVY },

    payBox: { marginTop: d.payTop, borderWidth: 1, borderColor: '#9ca3af', borderRadius: 4, padding: d.payPad },
    payLabel: { fontSize: 8, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 'bold' },
    payValue: { fontSize: 10, color: '#111827' },

    legal: { marginTop: d.legalTop, fontSize: 9, color: '#374151' },
    draftNote: { marginTop: d.legalTop, fontSize: 9, color: '#92400e', fontWeight: 'bold' },

    // Flows once at the very end of the document (last page only).
    payInfoBox: { marginTop: d.payTop, borderWidth: 1, borderColor: NAVY, borderRadius: 4, padding: d.infoPad, alignItems: 'center' },
    payInfoLine: { fontSize: 9.5, color: '#111827', textAlign: 'center', marginBottom: d.infoLineMarB },

    watermark: { position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontWeight: 'bold', color: NAVY, opacity: 0.06, transform: 'rotate(-24deg)' },
});

export const BillPDF = ({ bill, draft = false }: { bill: BillPDFData; draft?: boolean }) => {
    if (!bill) return null;
    const s = makeStyles(densityFor(bill.orders.length));

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

                {/* Coordonnées de l'émetteur : bas de page, sur chaque feuille. */}
                <Text style={s.footer} fixed>
                    {ORG.addr.join(' — ')} — Tél. {ORG.phone} — {ORG.email}
                </Text>

                {/* En-tête centré : le logotype, puis l'objet du document.
                    Le logotype porte déjà « enregistrements à la carte pour les
                    aveugles » et « Délégation des Auxiliaires des Aveugles » :
                    ORG.name et ORG.delegation seraient redits une deuxième fois,
                    on ne les répète donc pas ici. Le numéro de facture descend
                    dans la bande de métadonnées, en face du « Facturé à »,
                    plutôt que de concurrencer le titre. */}
                <View style={s.header} wrap={false}>
                    {/* jsx-a11y voit un <img> ; l'Image de react-pdf n'accepte
                        pas d'attribut alt — le texte alternatif d'un PDF passe
                        par sa structure, pas par ce composant. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={LOGO_SRC} style={s.logo} />
                    <Text style={s.docTitle}>FACTURE</Text>
                </View>

                {/* Facturé à (gauche) + méta facture (droite) sur une même bande */}
                <View style={s.billRow} wrap={false}>
                    <View style={s.billToCol}>
                        <Text style={s.metaLabel}>FACTURÉ À</Text>
                        <Text style={s.metaName}>{auditeurName}</Text>
                        {(() => {
                            const addr = bill.client.address?.filter(Boolean) ?? [];
                            return addr.length
                                ? addr.map((l, i) => <Text key={i} style={s.metaLine}>{l}</Text>)
                                : null;
                        })()}
                    </View>
                    <View style={s.billMetaCol}>
                        <View style={s.metaItem}>
                            <Text style={[s.metaLabel, s.alignRight]}>Facture n°</Text>
                            <Text style={[s.metaNumber, s.alignRight]}>{bill.id}</Text>
                        </View>
                        <View style={s.metaItem}>
                            <Text style={[s.metaLabel, s.alignRight]}>Date de création</Text>
                            <Text style={[s.metaLine, s.alignRight]}>{formatDate(creationDate)}</Text>
                        </View>
                        <View>
                            <Text style={[s.metaLabel, s.alignRight]}>Date d&apos;émission</Text>
                            <Text style={[s.metaLine, s.alignRight]}>{formatDate(bill.issueDate)}</Text>
                        </View>
                    </View>
                </View>

                {/* Line items table */}
                <View style={s.th} wrap={false}>
                    <Text style={[s.thText, s.cId]}>Réf.</Text>
                    <Text style={[s.thText, s.cDesc]}>Désignation</Text>
                    <Text style={[s.thText, s.cDate]}>ENVOI LECTEUR</Text>
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

                {/* Encadré paiement — une seule fois, en fin de dernière page */}
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