"use client";

import { useCallback } from "react";
import type { ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * N2 — standardized form toasts.
 *
 * Thin wrapper over the existing {@link useToast}. Every user-facing form
 * error/success should surface as a toast (inline <Alert> may remain as a
 * secondary hint, but a toast must fire). The red/green classNames below are
 * already the de-facto convention across the codebase — this centralizes them
 * so all six *BackendBase forms look identical.
 *
 * Usage:
 *   const { toastError, toastSuccess } = useFormToast();
 *   toastError("Veuillez sélectionner un auditeur.");
 *   toastSuccess("Demande enregistrée.");
 */
export function useFormToast() {
    const { toast } = useToast();

    // Stable identities: these are used as effect dependencies (e.g. the genre
    // fetch in BookFormBackendBase), so a fresh closure per render would refire
    // those effects in a loop. `toast` is module-level and already stable.
    const toastError = useCallback((
        description: string | ReactNode,
        title: string = "Erreur"
    ): void => {
        toast({
            title,
            description,
            // Keep `variant: "destructive"` available to callers that want the
            // shadcn destructive styling; the explicit className is the codebase
            // convention and renders consistently in light/dark.
            className: "bg-red-100 border-red-500 text-red-900",
        });
    }, [toast]);

    const toastSuccess = useCallback((
        description: string | ReactNode,
        title: string = "Succès"
    ): void => {
        toast({
            title,
            description,
            className: "bg-green-100 border-green-500 text-green-900",
        });
    }, [toast]);

    return { toastError, toastSuccess };
}
