/**
 * Issuer identity for anything ECA prints or sends on paper.
 *
 * Lived inline in BillPDF.tsx until the étiquette d'adresse needed the same
 * block. The étiquette has since dropped its expéditeur block entirely (a label
 * carries the destinataire and nothing else), so the facture is the only
 * consumer again — but two copies of a postal address drift silently, the
 * facture keeping the old phone number for a year before anyone notices, so it
 * stays the one place this is written down.
 */
export const ORG = {
    name: 'ECA — Enregistrements à la Carte pour les Aveugles',
    delegation: 'Délégation des Auxiliaires des Aveugles',
    addr: ['71 avenue de Breteuil', '75015 PARIS'],
    phone: '01 88 32 31 47 / 48',
    email: 'ecapermanence@gmail.com',
} as const;
