"use client";

import { useCallback } from "react";
import type { ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorToast } from "@/components/ui/admin/ApiErrorMessage";
import { toUserFacingError, UserFacingError } from "@/lib/user-error";

/**
 * Errors a wrapper (Add…/Edit…FormBackend) has already shown in a toast before
 * throwing them back to the form. The base form's catch reports everything
 * else — a network failure, a bug — and stays silent on these, so one failure
 * is never announced twice. A WeakSet rather than a flag on the Error: nothing
 * else ever reads it, and it can't leak into a message.
 */
const toasted = new WeakSet<object>();

/** Marks an error as already toasted; returns it so callers can `throw markToasted(e)`. */
export function markToasted<E extends Error>(error: E): E {
    toasted.add(error);
    return error;
}

export function wasToasted(error: unknown): boolean {
    return typeof error === 'object' && error !== null && toasted.has(error);
}

/**
 * N2 — standardized form toasts.
 *
 * Thin wrapper over the existing {@link useToast}. Every user-facing form
 * error/success surfaces as a toast, and only as a toast: the red box that
 * used to repeat it inside the form is gone. The red/green classNames below are
 * already the de-facto convention across the codebase — this centralizes them
 * so all six *BackendBase forms look identical.
 *
 * A success says what happened in its title alone (« Genre créé ») — no
 * « Succès » above a sentence ending in « avec succès ». An error's title says
 * what could not be done, its description why.
 *
 * Usage:
 *   const { toastError, toastSuccess } = useFormToast();
 *   toastError("Veuillez sélectionner un auditeur.");
 *   toastSuccess("Demande enregistrée");
 */
export function useFormToast() {
    const { toast } = useToast();

    // Stable identities: these are used as effect dependencies (e.g. the genre
    // fetch in BookFormBackendBase), so a fresh closure per render would refire
    // those effects in a loop. `toast` is module-level and already stable.
    const toastError = useCallback((
        description: string | ReactNode,
        title: string = "Enregistrement impossible"
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
        title: string,
        description?: string | ReactNode
    ): void => {
        toast({
            title,
            description,
            className: "bg-green-100 border-green-500 text-green-900",
        });
    }, [toast]);

    /**
     * The base forms' catch: says nothing about an error its wrapper already
     * toasted ({@link markToasted}); a lost connection or an unexpected bug gets
     * the full error toast (with whom to write to), a refusal its own message.
     */
    const toastFailure = useCallback((
        err: unknown,
        title: string = "Enregistrement impossible"
    ): void => {
        if (wasToasted(err)) return;
        const facing = toUserFacingError(err);
        if (err instanceof UserFacingError || facing.kind === 'network' || !(err instanceof Error) || !err.message) {
            toast(apiErrorToast(err, { title }));
        } else {
            toastError(err.message, title);
        }
    }, [toast, toastError]);

    return { toastError, toastSuccess, toastFailure };
}
