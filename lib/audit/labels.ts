/**
 * French rendering of the audit trail: model names, field names, operations, and
 * where a traced record lives in the back office.
 *
 * Imported by client components — keep it free of prisma and of anything
 * server-only.
 */

import { AUDIO_TRACK_ACTION_LABELS } from '@/lib/audio-enums';
import { BILLING_STATUS_LABELS, ORDER_BILLING_STATUS_LABELS } from '@/lib/billing-enums';
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from '@/lib/payment-enums';
import { USER_ACTIVITY_STATUS_LABELS } from '@/lib/user-activity-enums';
import { AUDIO_LINK_STATUS_LABELS } from '@/lib/audio-enums';
import {
    ACCESS_LEVEL_LABELS,
    DELIVERY_METHOD_LABELS,
    LANGUAGE_LABELS,
    MEMBER_TYPE_LABELS,
    SAVE_TYPE_LABELS,
} from '@/lib/user-enums';
import { formatDay } from '@/lib/users/activityStatus';
import { newsTypeLabels } from '@/types/news';

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
    CoupsDeCoeur: 'Liste de livres',
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
    AudioTrackEvent: 'Piste audio',
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
        // No standalone screen for one AudioTrackEvent row: it is a log line,
        // not a record, and this recordId points at nothing a URL can open. The
        // link comes from its label's `linked` instead, which names the book —
        // where the audio actually is managed. See lib/audit/record-labels.ts.
        default:
            return null;
    }
}

/** The bare essentials of `AuditRecordLabel` this module needs — kept structural
 *  rather than imported from `@/types` so this file stays free of a dependency
 *  on the DTO barrel. */
interface LinkedRecord {
    linked?: { model: string; recordId: string } | null;
}

/**
 * How a traced record names itself in a compact line — shared by the journal
 * and by the per-person detail drawer on /admin/stats, so the two views of the
 * same events never disagree on wording.
 *
 * Normally « Livre n°4549 ». A row that is merely ABOUT another record (a piste
 * audio event has no screen of its own) names that record instead, via
 * `recordLabel.linked` — « Piste audio · Livre n°4549 ».
 */
export function auditIdentity(model: string, recordId: string, recordLabel?: LinkedRecord | null): string {
    const linked = recordLabel?.linked ?? null;
    if (linked) return `${modelLabel(model)} · ${modelLabel(linked.model)} n°${linked.recordId}`;
    return recordId === '*' ? modelLabel(model) : `${modelLabel(model)} n°${recordId}`;
}

/** Where a traced record's link should lead: the linked record when there is one. */
export function auditHref(model: string, recordId: string, recordLabel?: LinkedRecord | null): string | null {
    const linked = recordLabel?.linked ?? null;
    return linked ? recordHref(linked.model, linked.recordId) : recordHref(model, recordId);
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
    hiddenFromCatalogue: 'Masqué du catalogue public',
    pageCount: 'Nombre de pages',
    readingDurationMinutes: 'Durée de lecture (min)',
    audio_filepath: 'Chemin audio',
    audioLinkStatus: 'État du lien audio',
    audioCheckedAt: 'Audio vérifié le',
    audioTrackCount: 'Nombre de pistes',
    audioSizeKb: 'Poids de l’audio (Kio)',
    polly_audio_url: 'Audio de synthèse',
    stock_date: 'Date de stock',
    last_downloaded_date: 'Dernier téléchargement',
    needsReview: 'À vérifier',
    escalatedAt: 'Escaladé le',
    addedById: 'Ajouté par',
    source_access_id: 'Identifiant Access',
    id_arbre: 'Identifiant arbre',
    bookId: 'Livre',

    // audio track events
    action: 'Action',
    filename: 'Nom du fichier',
    newFilename: 'Nouveau nom',
    sizeBytes: 'Taille (octets)',
    performedById: 'Effectué par',

    // demandes / attributions
    aveugleId: 'Auditeur',
    catalogueId: 'Livre',
    orderId: 'Demande',
    assignmentId: 'Attribution',
    statusId: 'Statut',
    processedByStaffId: 'Traité par',
    readerId: 'Lecteur',
    assignedDate: 'Attribué le',
    requestReceivedDate: 'Demande reçue le',
    createdDate: 'Créée le',
    closureDate: 'Date de clôture',
    receptionDate: 'Date de réception',
    sentToReaderDate: 'Envoyée au lecteur le',
    returnedToECADate: 'Rendue aux ECA le',
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

/**
 * The zone every moment in the journal is read in — the same one
 * `formatDateTime` stamps the row's own timestamp with
 * (app/admin/stats/stats-utils.ts). Declared here rather than imported from
 * lib/stats.ts, which pulls in the Prisma runtime and would follow this module
 * into the browser bundle.
 *
 * Pinned rather than left to the viewer's locale: this is a French association
 * whose working day is the Paris day everywhere else in the app, and a row
 * whose header and whose diff disagreed about the hour would be unreadable.
 */
const DISPLAY_TIMEZONE = 'Europe/Paris';

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Is this stored value a DAY rather than a moment?
 *
 * Day-valued columns — an indisponibilité's two ends, a date d'attribution, une
 * date de paiement — are normalized to UTC midnight on the way in
 * (`toDayStart`, lib/users/activityStatus.ts). Rendering one with a time, in the
 * viewer's zone, does not merely add noise: west of UTC it moves the date, and
 * the journal reported an indisponibilité declared for the 20th as starting on
 * the 19th.
 *
 * A genuine timestamp landing exactly on UTC midnight is a once-a-day
 * coincidence and reads here as its bare date — still true, only less precise.
 */
const isStoredDay = (date: Date): boolean =>
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

/**
 * Enum columns → the label map that words their values, keyed on
 * `Model.champ`.
 *
 * Keyed on the MODEL too, not on the field name alone, because the same column
 * name carries different enums on different models: `type` is a PaymentType on
 * a Payment and a NewsType on a News, and a field-keyed lookup would confidently
 * word a paiement « Annonce ». FIELD_LABELS above can afford to be field-keyed —
 * it only ever has to say « Type » — but a wrong VALUE is worse than a raw one,
 * so every entry here names the model it belongs to.
 *
 * Only audited models can appear (lib/audit/config.ts); the event logs that
 * carry their own enums — BillEvent.fromState, UserActivityEvent.toStatus — are
 * their own history and never produce an AuditEvent.
 *
 * Every map is the same one the corresponding screen renders, so the journal
 * and the fiche can never word a status differently.
 */
const ENUM_VALUE_LABELS: Record<string, Record<string, string>> = {
    'User.memberType':              MEMBER_TYPE_LABELS,
    'User.accessLevel':             ACCESS_LEVEL_LABELS,
    'User.activityStatus':          USER_ACTIVITY_STATUS_LABELS,
    'User.preferredDeliveryMethod': DELIVERY_METHOD_LABELS,
    'User.saveType':                SAVE_TYPE_LABELS,
    'Book.audioLinkStatus':         AUDIO_LINK_STATUS_LABELS,
    'Bill.state':                   BILLING_STATUS_LABELS,
    'Payment.type':                 PAYMENT_TYPE_LABELS,
    'Payment.paymentMethod':        PAYMENT_METHOD_LABELS,
    'Orders.deliveryMethod':        DELIVERY_METHOD_LABELS,
    'Orders.billingStatus':         ORDER_BILLING_STATUS_LABELS,
    'Assignment.deliveryMethod':    DELIVERY_METHOD_LABELS,
    'ReaderLanguage.language':      LANGUAGE_LABELS,
    'News.type':                    newsTypeLabels,
    'AudioTrackEvent.action':       AUDIO_TRACK_ACTION_LABELS,
};

/**
 * The French wording of an enum value, or null when this column isn't one — or
 * when it is but the value is unknown to the map. Falling back to null (and so
 * to the raw value) is deliberate: a row recorded under a since-removed enum
 * value must keep telling the truth rather than disappear behind a guess.
 */
function enumValueLabel(
    model: string | undefined,
    field: string | undefined,
    value: string
): string | null {
    if (!model || !field) return null;
    return ENUM_VALUE_LABELS[`${model}.${field}`]?.[value] ?? null;
}

/**
 * Human rendering of one diff side.
 *
 * `model` and `field` are what turn a stored enum into words — « Indisponible »
 * rather than « UNAVAILABLE ». They are optional so an unlabelled call still
 * renders something truthful, but every journal row should pass them.
 */
export function formatAuditValue(
    value: string | number | boolean | null,
    model?: string,
    field?: string
): string {
    if (value === null) return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return String(value);

    const asEnum = enumValueLabel(model, field, value);
    if (asEnum) return asEnum;

    // Dates reach the diff as ISO strings (lib/audit/diff.ts serializes every
    // Date with toISOString, so they always carry a Z).
    if (ISO_DATETIME_RE.test(value)) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return isStoredDay(parsed)
                ? formatDay(parsed) ?? value
                : parsed.toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: DISPLAY_TIMEZONE,
                  });
        }
    }
    return value === '' ? '(vide)' : value;
}
