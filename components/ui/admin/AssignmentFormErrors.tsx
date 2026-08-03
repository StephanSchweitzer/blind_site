/**
 * Maps a server validation response ({ message, errors }) into readable French
 * lines so the user sees WHICH field failed and why — instead of a bare
 * "Données invalides" that looks like their fault.
 *
 * Shared by AddAssignmentFormBackend and EditAssignmentFormBackend.
 */

const FIELD_LABELS: Record<string, string> = {
    catalogueId: 'Livre',
    orderId: 'Commande',
    statusId: 'Statut',
    receptionDate: 'Date de réception',
    sentToReaderDate: 'Date d\'envoi au lecteur',
    returnedToECADate: 'Date de retour aux ECA',
    notes: 'Notes',
    processedByStaffId: 'Traité par',
};

function humanizeMessage(raw: string): string {
    // Normalize Zod date/datetime messages to something non-technical.
    if (/Invalid ISO date|Invalid ISO datetime|Invalid datetime|Invalid date/i.test(raw)) {
        return 'format de date invalide';
    }
    return raw;
}

export function getFieldErrorLines(data: unknown): string[] {
    if (!data || typeof data !== 'object') return [];
    const errors = (data as { errors?: Record<string, string[]> }).errors;
    if (!errors || typeof errors !== 'object') return [];

    return Object.entries(errors).flatMap(([field, messages]) => {
        const label = FIELD_LABELS[field] ?? field;
        const list = Array.isArray(messages) ? messages : [String(messages)];
        return list.map((m) => `${label} : ${humanizeMessage(m)}`);
    });
}

export function ErrorToastBody({ message, lines }: { message: string; lines: string[] }) {
    return (
        <div className="text-xl mt-2">
            <p>{message}</p>
            {lines.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-base font-normal">
                    {lines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
