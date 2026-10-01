// ProformaPDF.tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { BillingStatus } from '@/lib/billing-enums';
import { ORG } from '@/lib/org';
import { parisDate } from '@/lib/paris-day';
import type { BillPDFData } from './BillPDF';

// La facture pro-forma suit la charpente de BillPDF — en-tête filé avec logotype et
// titre, bande « Facturé à » / numéro et date, tableau de lignes, totaux, encadré de
// règlement, coordonnées en pied de page — pour que les deux documents se
// reconnaissent d'un coup d'œil. Seul le contenu change : une pro-forma porte UNE
// demande, avec sa ligne de lecture à la page et, s'il y en a, ses frais d'envoi par
// WeTransfer.
//
// Une seule page, sans densité adaptative : une pro-forma porte UNE demande, donc
// une longueur presque constante. BillPDF, lui, a besoin de sa densité pour tenir
// jusqu'à sept titres sur une feuille.

const NAVY = '#15366b';
// Même remarque que BillPDF : la graisse se demande par la police, pas par
// fontWeight, que la Helvetica intégrée ignore sans rien dire.
const BOLD = 'Helvetica-Bold';
// Le pied de page est en position absolue et ne reçoit pas le padding de la Page :
// une seule constante pour les deux, comme dans BillPDF.
const PAGE_PAD_X = 48;
const LOGO_SRC = '/eca_logo_facture.png';
const LOGO_RATIO = 1000 / 508;

const num = (v: number | string | null | undefined): number | null =>
    v == null || v === '' ? null : Number(v);

const eur = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

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

    bookTitle: { fontSize: 10, color: '#111827' },
    bookAuthor: { fontSize: 8.5, color: '#374151', marginTop: 1 },

    totals: { marginTop: 13, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: '#1f2937' },
    totalValue: { fontSize: 10, color: '#111827' },
    grandRow: { flexDirection: 'row', width: 240, justifyContent: 'space-between', marginTop: 7, paddingTop: 9, borderTopWidth: 1.5, borderColor: NAVY },
    grandLabel: { fontSize: 12, fontFamily: BOLD, color: NAVY, letterSpacing: 0.5 },
    grandValue: { fontSize: 14, fontFamily: BOLD, color: NAVY },

    settledBox: { marginTop: 13, borderWidth: 1.5, borderColor: NAVY, borderRadius: 4, padding: 10 },
    settledTitle: { fontSize: 11, fontFamily: BOLD, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' },

    legal: { marginTop: 12, fontSize: 9, color: '#374151' },
    draftNote: { marginTop: 12, fontSize: 9, color: '#92400e', fontFamily: BOLD },

    payInfoBox: { marginTop: 13, borderWidth: 1, borderColor: NAVY, borderRadius: 4, padding: 11, alignItems: 'center' },
    payInfoLine: { fontSize: 9.5, color: '#111827', textAlign: 'center', marginBottom: 3 },

    watermark: { position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontFamily: BOLD, color: NAVY, opacity: 0.06, transform: 'rotate(-24deg)' },
});

export const ProformaPDF = ({ bill, draft = false }: { bill: BillPDFData; draft?: boolean }) => {
    if (!bill) return null;

    const order = bill.orders[0] ?? null;
    const settled = bill.state === BillingStatus.PAID || bill.state === BillingStatus.SOLDE;

    const clientName =
        [bill.client.civility, bill.client.firstName, bill.client.lastName].filter(Boolean).join(' ')
        || bill.client.name
        || 'Auditeur';
    const address = bill.client.address?.filter(Boolean) ?? [];

    const pages = order?.pages ?? null;
    const billedPages = order?.billedPages ?? null;
    const price = num(order?.pricePerPage);
    const fee = num(order?.transferFee);
    const feeAmount = fee != null && fee > 0 ? fee : null;
    const counted = billedPages ?? pages;
    // Le montant de la ligne de lecture est celui du coût, débarrassé des frais :
    // ce que la facture additionne est toujours ce que la demande a calculé.
    const total = num(bill.invoiceAmount) ?? 0;
    const readingAmount = total - (feeAmount ?? 0);

    // « Envoi de fichiers audio par We Transfer à : … » : quand des fichiers partent
    // par WeTransfer — un envoi payant, ou un format de média qui le dit — vers
    // l'adresse de l'auditeur (chaque contact d'une association a sa propre fiche).
    const sentByTransfer =
        feeAmount != null || /wetransfer/i.test(order?.mediaFormat?.name ?? '');

    const number = bill.id;

    return (
        <Document title={`${draft ? 'Brouillon — ' : ''}Facture pro-forma n°${number} — ${clientName}`}>
            <Page size="A4" style={styles.page}>
                {draft && <Text style={styles.watermark} fixed>BROUILLON</Text>}

                <Text style={styles.footer} fixed>
                    {ORG.addr.join(' — ')} — Tél. {ORG.phone} — {ORG.email}
                </Text>

                {/* En-tête centré, filé en marine : le logotype puis l'objet du document,
                    comme sur la facture. Le numéro descend dans la bande ci-dessous. */}
                <View style={styles.header} wrap={false}>
                    {/* jsx-a11y voit un <img> ; l'Image de react-pdf n'accepte pas d'attribut alt. */}
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={LOGO_SRC} style={styles.logo} />
                    <Text style={styles.docTitle}>FACTURE PRO-FORMA</Text>
                </View>

                {/* Facturé à (gauche) + numéro et date (droite) sur une même bande */}
                <View style={styles.billRow} wrap={false}>
                    <View style={styles.billToCol}>
                        <Text style={styles.metaLabel}>FACTURÉ À</Text>
                        <Text style={styles.metaName}>{clientName}</Text>
                        {address.map((l, i) => <Text key={i} style={styles.metaLine}>{l}</Text>)}
                    </View>
                    <View style={styles.billMetaCol}>
                        <View style={styles.metaItem}>
                            <Text style={[styles.metaLabel, styles.alignRight]}>Pro-forma n°</Text>
                            <Text style={[styles.metaNumber, styles.alignRight]}>{number}</Text>
                        </View>
                        <View>
                            <Text style={[styles.metaLabel, styles.alignRight]}>Date d&apos;émission</Text>
                            <Text style={[styles.metaLine, styles.alignRight]}>
                                {bill.issueDate ? parisDate(bill.issueDate) : '—'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Tableau de lignes : la même tête que la facture, deux colonnes. */}
                <View style={styles.th} wrap={false}>
                    <Text style={[styles.thText, styles.cDesc]}>Désignation</Text>
                    <Text style={[styles.thText, styles.cAmt]}>Montant</Text>
                </View>

                {order ? (
                    <>
                        <View style={styles.tr} wrap={false}>
                            <View style={styles.cDesc}>
                                <Text style={styles.bookTitle}>Enregistrement de « {order.catalogue.title} »</Text>
                                {order.catalogue.author ? <Text style={styles.bookAuthor}>{order.catalogue.author}</Text> : null}
                                {sentByTransfer && bill.client.email && (
                                    <Text style={styles.bookAuthor}>
                                        Envoi de fichiers audio par We Transfer à : {bill.client.email.toLowerCase()}
                                    </Text>
                                )}
                            </View>
                            <Text style={styles.cAmt} />
                        </View>

                        {pages != null && counted != null && price != null && (
                            <View style={styles.tr} wrap={false}>
                                <Text style={[styles.metaLine, styles.cDesc]}>
                                    {billedPages != null && billedPages !== pages
                                        ? `Lecture de ${pages} pages, comptées comme ${billedPages} pages à ${eur(price)}`
                                        : `Lecture de ${pages} page${pages > 1 ? 's' : ''} à ${eur(price)} par page`}
                                </Text>
                                <Text style={[styles.bookTitle, styles.cAmt]}>{eur(readingAmount)}</Text>
                            </View>
                        )}

                        {feeAmount != null && (
                            <View style={styles.tr} wrap={false}>
                                <Text style={[styles.metaLine, styles.cDesc]}>Envoi par We Transfer</Text>
                                <Text style={[styles.bookTitle, styles.cAmt]}>{eur(feeAmount)}</Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={styles.tr}>
                        <Text style={styles.metaLine}>Aucune demande rattachée à cette facture.</Text>
                    </View>
                )}

                {/* Totaux */}
                <View style={styles.totals} wrap={false}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>TVA</Text>
                        <Text style={styles.totalValue}>Non applicable</Text>
                    </View>
                    <View style={styles.grandRow}>
                        <Text style={styles.grandLabel}>TOTAL À RÉGLER</Text>
                        <Text style={styles.grandValue}>{eur(total)}</Text>
                    </View>
                </View>

                {draft ? (
                    <Text style={styles.draftNote}>Document provisoire — non valable comme facture.</Text>
                ) : (
                    <Text style={styles.legal}>TVA non applicable, art. 293 B du CGI.</Text>
                )}

                {settled ? (
                    <View style={styles.settledBox} wrap={false}>
                        <Text style={styles.settledTitle}>
                            {bill.state === BillingStatus.PAID ? 'Facture acquittée' : 'Facture soldée'}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.payInfoBox} wrap={false}>
                        <Text style={styles.payInfoLine}>Association (loi 1901) non assujettie à la TVA.</Text>
                        <Text style={styles.payInfoLine}>
                            Règlement par chèque à l’ordre de ECA – {ORG.delegation}, ou par virement bancaire :
                        </Text>
                        <Text style={styles.payInfoLine}>IBAN : {ORG.iban}</Text>
                        <Text style={styles.payInfoLine}>BIC : {ORG.bic}</Text>
                        <Text style={styles.payInfoLine}>
                            Merci de reporter le numéro de la pro-forma (n° {number}) au dos du chèque ou en référence du virement.
                        </Text>
                    </View>
                )}
            </Page>
        </Document>
    );
};
