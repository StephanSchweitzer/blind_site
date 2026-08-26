/**
 * The line printed BELOW the cut line on an étiquette d'adresse — i.e. on the
 * half of the sheet that gets thrown away. It is addressed to whoever is
 * packing the envelope, never to the auditeur (who reads nothing printed).
 *
 * What belongs in the envelope is already decided by the type of the demande,
 * so nobody is asked:
 *
 *  - Enregistrement — the auditeur lent us the printed book for a lecteur to
 *    read aloud, so the book travels home together with the recording. It is
 *    always the auditeur's own copy; ECA does not source books itself.
 *  - Duplication — a copy of audio ECA already holds. No physical book was ever
 *    involved, so there is nothing to give back.
 *
 * The two are mutually exclusive by construction: the demande form clears each
 * flag when the other is set (OrderFormBackendBase, handleDuplicationChange /
 * handleRecordingChange). An attribution is always the first case — a
 * duplication never gets one.
 */
export interface OrderLabelReferenceInput {
    orderId: number;
    /** Book title, when the caller has it. */
    title?: string | null;
    isDuplication: boolean;
}

export function orderLabelReference({
    orderId,
    title,
    isDuplication,
}: OrderLabelReferenceInput): string {
    const contents = isDuplication
        ? 'Enregistrement seul'
        : 'Enregistrement + livre à retourner';
    return [contents, `Demande #${orderId}`, title?.trim() || null]
        .filter(Boolean)
        .join(' — ');
}
