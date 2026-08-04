/**
 * French rendering of the audit trail: model names, field names, operations, and
 * where a traced record lives in the back office.
 *
 * Imported by client components — keep it free of prisma and of anything
 * server-only.
 */

export type AuditOperationValue = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export const OPERATION_LABELS: Record<AuditOperationValue, string> = {
    CREATE: 'Création',
    UPDATE: 'Modification',
    DELETE: 'Suppression',
    RESTORE: 'Restauration',
};

/**
 * Model → French label, following the glossary: Orders are *demandes*,
 * Assignment are *attributions*.
 */
export const MODEL_LABELS: Record<string, string> = {
    User: 'Personne',
    Address: 'Adresse',
    ReaderLanguage: 'Langue de lecteur',
    Book: 'Livre',
    Genre: 'Genre',
    CoupsDeCoeur: 'Coup de cœur',
    Orders: 'Demande',
    Assignment: 'Attribution',
    AssignmentReader: 'Lecteur d’attribution',
    Bill: 'Facture',
    Payment: 'Paiement',
    News: 'Actualité',
    Status: 'Statut',
    MediaFormat: 'Format de média',
    Civility: 'Civilité',
    SiteContact: 'Page Contact',
    TeamMember: 'Membre de l’équipe',
    HistoryEvent: 'Événement de l’historique',
    PracticalInfo: 'Information pratique',
    MembershipOption: 'Option d’adhésion',
};

export const modelLabel = (model: string): string => MODEL_LABELS[model] ?? model;

/** Deep link to the screen where a traced record is edited, when there is one. */
export function recordHref(model: string, recordId: string): string | null {
    if (recordId === '*' || !/^\d+$/.test(recordId)) return null;
    switch (model) {
        case 'User':
            return `/admin/users/dossier/${recordId}`;
        case 'Book':
            return `/admin/books?book=${recordId}`;
        case 'Orders':
            return `/admin/orders?order=${recordId}`;
        case 'Assignment':
            return `/admin/assignments?assignment=${recordId}`;
        case 'Bill':
            return `/admin/bills?bill=${recordId}`;
        case 'Payment':
            return `/admin/payments?payment=${recordId}`;
        case 'CoupsDeCoeur':
            return `/admin/manage_coups_de_coeur`;
        case 'News':
            return `/admin/news?news=${recordId}`;
        default:
            return null;
    }
}

/**
 * Field → French label. Shared across models, because the same column name means
 * the same thing everywhere in this schema. Unknown fields fall back to their
 * own name rather than being hidden — an untranslated line still tells the truth.
 */
const FIELD_LABELS: Record<string, string> = {
    // identity / people
    name: 'Nom',
    firstName: 'Prénom',
    lastName: 'Nom de famille',
    email: 'E-mail',
    homePhone: 'Téléphone fixe',
    cellPhone: 'Téléphone mobile',
    memberType: 'Type de membre',
    accessLevel: 'Niveau d’accès',
    role: 'Rôle',
    civilityId: 'Civilité',
    civilityOther: 'Civilité (autre)',
    nonProfitAffiliation: 'Affiliation',
    notes: 'Notes',
    gestconteNotes: 'Notes Gestconte',
    gestconteId: 'Identifiant Gestconte',
    deletedAt: 'Date de suppression',
    passwordNeedsChange: 'Mot de passe à changer',

    // activity / availability
    activityStatus: 'Statut d’activité',
    activityChangedAt: 'Statut modifié le',
    isActive: 'Actif',
    isAvailable: 'Prend des attributions',
    availabilityNotes: 'Notes de disponibilité',
    unavailableFrom: 'Indisponible à partir du',
    unavailableUntil: 'Indisponible jusqu’au',
    specialization: 'Spécialisation',
    maxConcurrentAssignments: 'Attributions simultanées max',
    saveType: 'Logiciel d’enregistrement',
    terminationDate: 'Date de fin',
    terminationReason: 'Motif de fin',

    // address
    addressLine1: 'Adresse',
    addressSupplement: 'Complément d’adresse',
    city: 'Ville',
    postalCode: 'Code postal',
    stateProvince: 'Région',
    country: 'Pays',
    isDefault: 'Adresse par défaut',

    // books
    title: 'Titre',
    subtitle: 'Sous-titre',
    author: 'Auteur',
    publisher: 'Éditeur',
    publishedDate: 'Date de publication',
    isbn: 'ISBN',
    description: 'Description',
    available: 'Disponible',
    pageCount: 'Nombre de pages',
    readingDurationMinutes: 'Durée de lecture (min)',
    audio_filepath: 'Chemin audio',
    audioLinkStatus: 'État du lien audio',
    audioCheckedAt: 'Audio vérifié le',
    audioTrackCount: 'Nombre de pistes',
    polly_audio_url: 'Audio de synthèse',
    stock_date: 'Date de stock',
    last_downloaded_date: 'Dernier téléchargement',
    needsReview: 'À vérifier',
    escalatedAt: 'Escaladé le',
    addedById: 'Ajouté par',
    source_access_id: 'Identifiant Access',
    id_arbre: 'Identifiant arbre',

    // demandes / attributions
    aveugleId: 'Auditeur',
    catalogueId: 'Livre',
    orderId: 'Demande',
    statusId: 'Statut',
    processedByStaffId: 'Traité par',
    readerId: 'Lecteur',
    assignedDate: 'Attribué le',
    requestReceivedDate: 'Demande reçue le',
    createdDate: 'Créée le',
    closureDate: 'Date de clôture',
    receptionDate: 'Date de réception',
    sentToReaderDate: 'Envoyée au lecteur le',
    returnedToECADate: 'Rendue à l’ECA le',
    isDuplication: 'Duplication',
    lentPhysicalBook: 'Livre papier prêté',
    mediaFormatId: 'Format de média',
    deliveryMethod: 'Mode de remise',
    preferredDeliveryMethod: 'Mode de remise préféré',
    preferredMediaFormatId: 'Format de média préféré',

    // billing / payments
    clientId: 'Client',
    billId: 'Facture',
    state: 'État',
    creationDate: 'Date de création',
    issueDate: 'Date d’émission',
    paymentDate: 'Date de paiement',
    paymentReference: 'Référence de paiement',
    paymentMethod: 'Mode de paiement',
    invoiceAmount: 'Montant de la facture',
    billingStatus: 'Statut de facturation',
    amount: 'Montant',
    type: 'Type',
    cost: 'Coût',
    currentBalance: 'Solde',
    paymentThreshold: 'Seuil de paiement',
    receiptNumber: 'Numéro de reçu',
    cotisationYear: 'Année de cotisation',
    isAllocated: 'Affecté',
    allocationDate: 'Date d’affectation',
    observations: 'Observations',
    deletionReason: 'Motif de suppression',
    exportDate: 'Date d’export',
    importDate: 'Date d’import',
    fiscalite: 'Fiscalité',
    comptable: 'Comptable',

    // content / CMS
    content: 'Contenu',
    body: 'Contenu',
    question: 'Question',
    publishedAt: 'Publié le',
    authorId: 'Auteur',
    active: 'Actif',
    sortOrder: 'Ordre',
    iconKey: 'Icône',
    colorTheme: 'Thème de couleur',
    audioPath: 'Chemin audio',
    section: 'Section',
    year: 'Année',
    highlightLabel: 'Libellé mis en avant',
    highlightValue: 'Valeur mise en avant',
    bullets: 'Points clés',
    ctaLabel: 'Libellé du bouton',
    ctaHref: 'Lien du bouton',
    orgName: 'Nom de l’organisation',
    orgSubtitle: 'Sous-titre',
    addressLines: 'Adresse',
    phones: 'Téléphones',
    hoursText: 'Horaires',
    metroText: 'Métro',
    busText: 'Bus',
    visitText: 'Visite',
    language: 'Langue',
    userId: 'Personne',
    createdAt: 'Créé le',
};

/** Reserved keys the extension writes instead of a real column. */
const RESERVED_FIELD_LABELS: Record<string, string> = {
    _count: 'Enregistrements concernés',
    _tronque: 'Contenu non tracé',
    _source: 'Restauré depuis l’événement',
};

export function fieldLabel(field: string): string {
    return RESERVED_FIELD_LABELS[field] ?? FIELD_LABELS[field] ?? field;
}

export const isReservedField = (field: string): boolean => field in RESERVED_FIELD_LABELS;

/** Marker written in place of a value too long to keep. */
export const TRUNCATION_MARKER_RE = /^\[(texte de \d+ caractères|binaire|valeur illisible)\]$/;

/** Human rendering of one diff side. */
export function formatAuditValue(value: string | number | boolean | null): string {
    if (value === null) return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return String(value);
    // Timestamps are stored as ISO strings; show them the way the rest of the
    // back office does rather than raw.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
        }
    }
    return value === '' ? '(vide)' : value;
}
