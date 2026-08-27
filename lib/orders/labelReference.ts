/**
 * What goes in the envelope, and how the étiquette d'adresse says it.
 *
 * The contents line is printed BELOW the cut, on the half of the sheet that
 * gets thrown away, so it reaches whoever is packing and never the auditeur
 * (who reads nothing printed anyway).
 *
 * The demande type says whether a printed book was ever borrowed (an
 * enregistrement is made from the auditeur's own copy; a duplication copies
 * audio ECA already holds), and Orders.mediaFormatId says whether the
 * recording travels on a physical medium or goes out over the internet —
 * « WeTransfer » being the digital one. Together those two propose a guess at
 * the contents line — see proposedShipmentContents.
 */

export type ShipmentContents =
    /** The recording on a physical medium, plus the auditeur's book going home. */
    | 'RECORDING_AND_BOOK'
    /** A recording only — a duplication, or a book that was never borrowed. */
    | 'RECORDING_ONLY'
    /** The book alone: the audio was already delivered over the internet. */
    | 'BOOK_ONLY';

export const SHIPMENT_CONTENTS_LABELS: Record<ShipmentContents, string> = {
    RECORDING_AND_BOOK: 'Enregistrement + livre à retourner',
    RECORDING_ONLY: 'Enregistrement seul',
    BOOK_ONLY: 'Livre seul (enregistrement transmis par Internet)',
};

// MediaFormat is a free-form table (name VarChar(80)) with no admin screen, so
// rows change rarely and by hand. Matching on the name is therefore safe enough
// — but anything unrecognised stays 'unknown' rather than being assumed
// physical, since guessing wrong only means the printed reference note names
// the wrong contents, not a legal claim.
const DIGITAL_MEDIA_FORMATS = ['wetransfer'];
const PHYSICAL_MEDIA_FORMATS = ['k7', 'cdr', 'dvdr', 'md', 'clé usb', 'cle usb'];

export function mediaFormatKind(
    name: string | null | undefined
): 'digital' | 'physical' | 'unknown' {
    const n = name?.trim().toLowerCase();
    if (!n) return 'unknown';
    if (DIGITAL_MEDIA_FORMATS.includes(n)) return 'digital';
    if (PHYSICAL_MEDIA_FORMATS.includes(n)) return 'physical';
    return 'unknown';
}

export interface ShipmentContext {
    orderId: number;
    /** Book title, when the caller has it. */
    title?: string | null;
    isDuplication: boolean;
    /** MediaFormat.name — « Non défini » or absent on most demandes. */
    mediaFormat?: string | null;
}

/**
 * Best guess at what's in the envelope, printed as the reference note without
 * asking — it's a packing aid, not a postal claim, so a wrong guess is low
 * stakes.
 */
export function proposedShipmentContents(ctx: ShipmentContext): ShipmentContents {
    if (mediaFormatKind(ctx.mediaFormat) === 'digital') {
        // The audio already went out over the wire. For an enregistrement the
        // book is the only thing left to post; for a duplication there is
        // nothing at all to send.
        return ctx.isDuplication ? 'RECORDING_ONLY' : 'BOOK_ONLY';
    }
    return ctx.isDuplication ? 'RECORDING_ONLY' : 'RECORDING_AND_BOOK';
}

/** The line printed below the cut. */
export function shipmentReference(ctx: ShipmentContext): string {
    return [
        SHIPMENT_CONTENTS_LABELS[proposedShipmentContents(ctx)],
        `Demande #${ctx.orderId}`,
        ctx.title?.trim() || null,
    ]
        .filter(Boolean)
        .join(' — ');
}
