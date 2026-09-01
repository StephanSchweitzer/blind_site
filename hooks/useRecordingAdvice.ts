"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    buildRecordingAdvice,
    recordingDecisionIsOpen,
    type RecordingAdvice,
    type RecordingContext,
    type RecordingDecision,
} from "@/lib/orders/recordingAdvice";

/** Attribution encore en cours pour ce livre — bloque une duplication. */
export interface BlockingRecording {
    readerName: string | null;
    sentToReaderDate: string | null;
}

/** Un livre pour lequel enregistrer créerait une SECONDE demande active. */
export interface RecordingConflict {
    catalogueId: number;
    activeRecordingCount: number;
    otherAuditeurName: string | null;
}

interface RecordingCheckResponse {
    activeRecordingCount: number;
    orders: { id: number; aveugle: { name: string | null } | null; status: { name: string } | null }[];
    blockingRecording: BlockingRecording | null;
}

/**
 * Interroge `GET /api/orders/recording-check` et n'en laisse sortir que ce que
 * l'utilisateur a le droit de voir maintenant.
 *
 * Le hook ne rend jamais la réponse brute : il ne rend que des `RecordingAdvice`
 * déjà filtrés par `recordingDecisionIsOpen` (voir `lib/orders/recordingAdvice.ts`,
 * qui porte le raisonnement). C'est là toute l'architecture — la vue n'a pas de
 * condition à porter parce qu'elle n'a pas accès à la donnée qu'il faudrait
 * conditionner. Sur une demande existante dont la décision d'enregistrement n'a
 * pas bougé, `adviceFor()` renvoie `null` et `conflicts()` une liste vide ; il
 * n'y a rien à afficher, même pour qui essaierait.
 *
 * @param current   la ou les décisions telles qu'elles sont saisies (une par
 *                  demande : une seule en modification, une par ligne en création)
 * @param saved     la même décision telle qu'elle est ENREGISTRÉE. `null` (défaut)
 *                  = formulaire de création : tout est en train d'être décidé.
 * @param excludeOrderId la demande en cours de modification, exclue de son propre
 *                  décompte côté serveur.
 */
export function useRecordingAdvice({
    current,
    saved = null,
    excludeOrderId,
}: {
    current: RecordingContext[];
    saved?: RecordingDecision | null;
    excludeOrderId?: number;
}) {
    const cache = useRef<Map<string, RecordingCheckResponse>>(new Map());
    const [byBook, setByBook] = useState<Record<number, RecordingCheckResponse>>({});

    const lookup = useCallback(
        async (bookId: number): Promise<RecordingCheckResponse | null> => {
            if (!bookId) return null;
            const key = `${bookId}:${excludeOrderId ?? ""}`;
            const cached = cache.current.get(key);
            if (cached) {
                setByBook((prev) => (prev[bookId] === cached ? prev : { ...prev, [bookId]: cached }));
                return cached;
            }
            try {
                const qs = new URLSearchParams({ bookId: String(bookId) });
                if (excludeOrderId) qs.set("excludeOrderId", String(excludeOrderId));
                const res = await fetch(`/api/orders/recording-check?${qs.toString()}`);
                if (!res.ok) return null;
                const data: RecordingCheckResponse = await res.json();
                cache.current.set(key, data);
                setByBook((prev) => ({ ...prev, [bookId]: data }));
                return data;
            } catch {
                return null;
            }
        },
        [excludeOrderId]
    );

    // `current` est reconstruit à chaque rendu (il dérive du formData), donc il ne
    // peut pas servir de dépendance : l'effet repartirait en boucle. On en tire
    // une CHAÎNE d'ids — stable tant que le contenu ne change pas — et c'est elle
    // qui déclenche les requêtes. On interroge dès qu'un livre est en jeu sur
    // l'un des deux axes : la même réponse sert aux avis d'enregistrement et au
    // blocage de duplication.
    const booksToCheck = useMemo(
        () =>
            Array.from(
                new Set(
                    current
                        .filter((c) => c.catalogueId && (c.lentPhysicalBook || c.isDuplication))
                        .map((c) => c.catalogueId as number)
                )
            )
                .sort((a, b) => a - b)
                .join(","),
        [current]
    );

    useEffect(() => {
        if (!booksToCheck) return;
        for (const id of booksToCheck.split(",")) {
            void lookup(Number(id));
        }
    }, [booksToCheck, lookup]);

    const activeFor = useCallback(
        (catalogueId: number | null) => {
            const res = catalogueId ? byBook[catalogueId] : null;
            if (!res) return null;
            return {
                activeRecordingCount: res.activeRecordingCount,
                otherAuditeurName: res.orders[0]?.aveugle?.name ?? null,
            };
        },
        [byBook]
    );

    /** L'avis à afficher pour cette décision, ou `null` s'il n'y a rien à dire. */
    const adviceFor = useCallback(
        (decision: RecordingContext): RecordingAdvice | null =>
            buildRecordingAdvice(saved, decision, activeFor(decision.catalogueId)),
        [saved, activeFor]
    );

    /**
     * À appeler juste avant d'enregistrer : les livres pour lesquels une seconde
     * demande d'enregistrement active serait créée. Liste vide = rien à demander.
     * Même porte que `adviceFor`, donc modifier une demande sans toucher à sa
     * décision d'enregistrement ne déclenche aucune confirmation.
     */
    const conflicts = useCallback(async (): Promise<RecordingConflict[]> => {
        const out: RecordingConflict[] = [];
        for (const c of current) {
            if (!c.catalogueId) continue;
            if (!recordingDecisionIsOpen(saved, c)) continue;
            const res = await lookup(c.catalogueId);
            if (res && res.activeRecordingCount > 0) {
                out.push({
                    catalogueId: c.catalogueId,
                    activeRecordingCount: res.activeRecordingCount,
                    otherAuditeurName: res.orders[0]?.aveugle?.name ?? null,
                });
            }
        }
        return out;
    }, [current, saved, lookup]);

    /**
     * Volontairement HORS de la porte ci-dessus : ce n'est pas une mise en garde
     * sur une décision d'enregistrement, c'est l'état d'un enregistrement TIERS
     * (le serveur exclut déjà la demande en cours). Une duplication déjà
     * enregistrée reste légitimement en attente du retour du lecteur, et le dire
     * explique pourquoi elle n'est pas faisable aujourd'hui.
     */
    const blockingRecordingFor = useCallback(
        (catalogueId: number | null): BlockingRecording | null =>
            (catalogueId ? byBook[catalogueId]?.blockingRecording : null) ?? null,
        [byBook]
    );

    return { adviceFor, conflicts, blockingRecordingFor };
}
