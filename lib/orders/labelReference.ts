/**
 * What goes in the envelope, and how the étiquette d'adresse says it.
 *
 * The contents line is printed BELOW the cut, on the half of the sheet that
 * gets thrown away, so it reaches whoever is packing and never the auditeur
 * (who reads nothing printed anyway). The « CÉCOGRAMME » mention is the
 * opposite — above the cut, where La Poste sees it — and follows from the same
 * answer, because the franchise is about what is actually inside.
 *
 * Why this is asked rather than derived: it very nearly *is* derivable. The
 * demande type says whether a printed book was ever borrowed (an enregistrement
 * is made from the auditeur's own copy; a duplication copies audio ECA already
 * holds), and Orders.mediaFormatId says whether the recording travels on a
 * physical medium or goes out over the internet — « WeTransfer » being the
 * digital one. Together those two determine the answer exactly.
 *
 * Except the media format is « Non défini » on ~90% of demandes. Deriving from
 * a field that empty would confidently stamp a postal franchise on envelopes
 * nobody checked, so the answer is proposed and confirmed instead. If the
 * permanence starts filling the format in, the proposal below becomes right
 * often enough that the confirmation step could be dropped again.
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

/** Short forms for the dialog's buttons, where the sentence above is too long. */
export const SHIPMENT_CONTENTS_HINTS: Record<ShipmentContents, string> = {
    RECORDING_AND_BOOK:
        "L'enregistrement sur support, accompagné du livre que l'auditeur nous avait prêté.",
    RECORDING_ONLY: "L'enregistrement seul — aucun livre n'a été prêté.",
    BOOK_ONLY:
        "Uniquement le livre : l'enregistrement a déjà été transmis par Internet.",
};

/**
 * Only an envelope actually carrying material for the blind can claim the
 * franchise. A printed book travelling home on its own is ordinary mail.
 */
export function shipmentCarriesRecording(contents: ShipmentContents): boolean {
    return contents !== 'BOOK_ONLY';
}

// MediaFormat is a free-form table (name VarChar(80)) with no admin screen, so
// rows change rarely and by hand. Matching on the name is therefore safe enough
// — but anything unrecognised stays 'unknown' rather than being assumed
// physical, so a format added later can never silently produce a cécogramme.
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

/** The option the dialog opens on. Always overridable. */
export function proposedShipmentContents(ctx: ShipmentContext): ShipmentContents {
    if (mediaFormatKind(ctx.mediaFormat) === 'digital') {
        // The audio already went out over the wire. For an enregistrement the
        // book is the only thing left to post; for a duplication there is
        // nothing at all — see shipmentNeedsNothing.
        return ctx.isDuplication ? 'RECORDING_ONLY' : 'BOOK_ONLY';
    }
    return ctx.isDuplication ? 'RECORDING_ONLY' : 'RECORDING_AND_BOOK';
}

/**
 * A duplication delivered over the internet posts nothing: no book was ever
 * borrowed and the audio has already arrived. Worth saying out loud on the
 * dialog rather than printing a confident label for an envelope that does not
 * exist.
 */
export function shipmentNeedsNothing(ctx: ShipmentContext): boolean {
    return ctx.isDuplication && mediaFormatKind(ctx.mediaFormat) === 'digital';
}

/** The line printed below the cut. */
export function shipmentReference(
    ctx: ShipmentContext,
    contents: ShipmentContents
): string {
    return [
        SHIPMENT_CONTENTS_LABELS[contents],
        `Demande #${ctx.orderId}`,
        ctx.title?.trim() || null,
    ]
        .filter(Boolean)
        .join(' — ');
}
