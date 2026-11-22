/**
 * POST /api/books/[id]/audio/duration until the folder is fully measured.
 *
 * The route measures what fits in its time budget, caches it, and answers
 * `pending` for the rest (see TIME_BUDGET_MS there): a large folder takes several
 * calls. Both callers — « Recalculer » next to Durée de la lecture, and the
 * measurement the upload dialogue starts after an upload — go through here, so
 * neither stops at the first partial answer.
 *
 * Browser-side: plain fetch, nothing server-only.
 */
export interface DurationAnswer {
    readingDurationMinutes: number | null;
    measured: number;
    failed: number;
    pending: number;
    problems: { filename: string; problem: string | null }[];
}

export type DurationRequestResult =
    | { ok: true; data: DurationAnswer }
    | { ok: false; message: string };

export async function requestDurationMeasure(bookId: number): Promise<DurationRequestResult> {
    let lastPending = Infinity;
    for (;;) {
        const res = await fetch(`/api/books/${bookId}/audio/duration`, { method: 'POST' }).catch(() => null);
        if (!res) return { ok: false, message: 'Le serveur est injoignable.' };
        const data = (await res.json().catch(() => null)) as (DurationAnswer & { message?: string }) | null;
        if (!res.ok || !data) return { ok: false, message: data?.message ?? 'La mesure a échoué.' };

        const pending = data.pending ?? 0;
        if (pending === 0) return { ok: true, data };
        // No progress since the last call: a further call would do the same.
        if (pending >= lastPending) {
            return {
                ok: false,
                message: `La mesure n’avance plus : ${pending} piste${pending > 1 ? 's' : ''} non mesurée${pending > 1 ? 's' : ''}. Réessayez dans un instant.`,
            };
        }
        lastPending = pending;
    }
}
