// ProformaPDF.tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { BillingStatus } from '@/lib/billing-enums';
import { ORG } from '@/lib/org';
import type { BillPDFData } from './BillPDF';

// La facture pro-forma reproduit les deux documents que les permanents faisaient
// à la main (Lumen n° 42, Colin Maillard n° 99) : logo, bloc destinataire à droite,
// « Paris, le … », titre, une ligne de lecture, l'envoi par WeTransfer s'il y en a
// un, le total, la mention de TVA et les modalités de règlement.
//
// Une seule page, sans densité adaptative : une pro-forma porte UNE demande, donc
// une longueur presque constante. BillPDF, lui, a besoin de sa densité pour tenir
// jusqu'à sept titres sur une feuille.

const NAVY = '#15366b';
// Même remarque que BillPDF : la graisse se demande par la police, pas par
// fontWeight, que la Helvetica intégrée ignore sans rien dire.
const BOLD = 'Helvetica-Bold';
const PAGE_PAD_X = 56;
const LOGO_SRC = '/eca_logo_facture.png';
const LOGO_RATIO = 1000 / 508;

const num = (v: number | string | null | undefined): number | null =>
    v == null || v === '' ? null : Number(v);

// « 20 juillet 2026 », comme sur les documents d'origine — en heure française,
// jamais celle de la machine (voir la règle « Dates affichées »).
const longDate = (d: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));

const eur = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

const styles = StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: PAGE_PAD_X, fontFamily: 'Helvetica', fontSize: 11, color: '#111827', lineHeight: 1.45 },
    logoWrap: { alignItems: 'center', marginBottom: 26 },
    logo: { width: 176, height: 176 / LOGO_RATIO },

    // Le bloc destinataire s'aligne sur la moitié droite de la page, comme sur le papier.
    recipient: { marginLeft: 'auto', width: '52%', marginBottom: 18 },
    recipientName: { fontFamily: BOLD, fontSize: 12, marginBottom: 2 },
    dateLine: { marginLeft: 'auto', width: '52%', marginBottom: 30 },

    title: { textAlign: 'center', color: NAVY, fontFamily: BOLD, fontSize: 14, letterSpacing: 1, marginBottom: 26 },

    descLine: { marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    rowLabel: { flex: 1, paddingRight: 16 },
    rowAmount: { width: 90, textAlign: 'right' },
    totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: NAVY },
    totalText: { fontFamily: BOLD, color: NAVY, fontSize: 12 },

    legal: { marginTop: 34 },
    payBox: { marginTop: 16, borderWidth: 1, borderColor: NAVY, borderRadius: 4, padding: 10 },
    payLine: { fontSize: 10, marginBottom: 2 },
    settled: { marginTop: 16, borderWidth: 1.5, borderColor: NAVY, borderRadius: 4, padding: 10, color: NAVY, fontFamily: BOLD, fontSize: 11, textAlign: 'center' },
    thanks: { marginTop: 14 },

    footer: { position: 'absolute', bottom: 22, left: PAGE_PAD_X, right: PAGE_PAD_X, textAlign: 'center', fontSize: 8, color: '#4b5563' },
    watermark: { position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontFamily: BOLD, color: NAVY, opacity: 0.06, transform: 'rotate(-24deg)' },
    draftNote: { marginTop: 14, fontSize: 9, color: '#92400e', fontFamily: BOLD },
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
    const title = order
        ? `« ${order.catalogue.title} »${order.catalogue.author ? ` (${order.catalogue.author})` : ''}`
        : null;

    return (
        <Document title={`${draft ? 'Brouillon — ' : ''}Facture pro-forma n°${number} — ${clientName}`}>
            <Page size="A4" style={styles.page}>
                {draft && <Text style={styles.watermark} fixed>BROUILLON</Text>}

                <Text style={styles.footer} fixed>
                    {ORG.addr.join(', ')} — Tél. {ORG.phone} — {ORG.email}
                </Text>

                <View style={styles.logoWrap}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={LOGO_SRC} style={styles.logo} />
                </View>

                <View style={styles.recipient}>
                    <Text style={styles.recipientName}>{clientName}</Text>
                    {address.map((l, i) => <Text key={i}>{l}</Text>)}
                </View>
                <Text style={styles.dateLine}>Paris, le {bill.issueDate ? longDate(bill.issueDate) : '—'}</Text>

                <Text style={styles.title}>FACTURE PRO-FORMA N° {number}</Text>

                {order ? (
                    <>
                        <Text style={styles.descLine}>Enregistrement de {title}</Text>
                        {sentByTransfer && bill.client.email && (
                            <Text style={styles.descLine}>
                                Envoi de fichiers audio par We Transfer à : {bill.client.email.toLowerCase()}
                            </Text>
                        )}

                        {pages != null && counted != null && price != null && (
                            <View style={styles.row}>
                                <Text style={styles.rowLabel}>
                                    {billedPages != null && billedPages !== pages
                                        ? `Lecture de ${pages} pages, comptées comme ${billedPages} pages à ${eur(price)}`
                                        : `Lecture de ${pages} page${pages > 1 ? 's' : ''} à ${eur(price)} par page`}
                                </Text>
                                <Text style={styles.rowAmount}>{eur(readingAmount)}</Text>
                            </View>
                        )}

                        {feeAmount != null && (
                            <View style={styles.row}>
                                <Text style={styles.rowLabel}>Envoi par We Transfer</Text>
                                <Text style={styles.rowAmount}>{eur(feeAmount)}</Text>
                            </View>
                        )}
                    </>
                ) : (
                    <Text style={styles.descLine}>Aucune demande rattachée à cette facture.</Text>
                )}

                <View style={styles.totalRow}>
                    <Text style={styles.totalText}>TOTAL : {eur(total)}</Text>
                </View>

                <Text style={styles.legal}>Association non assujettie à la TVA.</Text>

                {draft && <Text style={styles.draftNote}>Document provisoire — non valable comme facture.</Text>}

                {settled ? (
                    <Text style={styles.settled}>
                        {bill.state === BillingStatus.PAID ? 'Facture acquittée' : 'Facture soldée'}
                    </Text>
                ) : (
                    <>
                        <View style={styles.payBox} wrap={false}>
                            <Text style={styles.payLine}>
                                Règlement par chèque à l’ordre de ECA – {ORG.delegation}, ou par virement :
                            </Text>
                            <Text style={styles.payLine}>IBAN : {ORG.iban}</Text>
                            <Text style={styles.payLine}>BIC : {ORG.bic}</Text>
                            <Text style={styles.payLine}>
                                Merci de reporter le numéro de la pro-forma (n° {number}) au dos du chèque ou en référence du virement.
                            </Text>
                        </View>
                        <Text style={styles.thanks}>En votre aimable règlement.</Text>
                    </>
                )}
            </Page>
        </Document>
    );
};
