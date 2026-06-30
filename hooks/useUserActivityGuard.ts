"use client";

import { useCallback, useRef, useState } from "react";

export interface ActivityBlockInfo {
    userId: number;
    name: string;
    activityStatus: string;
    statusLabel: string;
    reason: string | null;
    comment: string | null;
    changedAt: string | null;
}

export type ActivityGuardRole = "aveugle" | "lecteur";

/**
 * Shared "is this person active?" gate for the order and assignment forms.
 *
 * - `requireActive(userId, role)` checks GET /api/user/[id]/status. If the
 *   person isn't ACTIVE, it opens the shared UserActivityGuardDialog (render
 *   it via the `blocked`/`role`/`resolveAndClose` returned here — see
 *   UserActivityGuardDialog.tsx) and returns a Promise that resolves once the
 *   admin either cancels (false) or reactivates the person to ACTIVE (true).
 * - `presentBlock(info, role)` opens the same dialog directly from a
 *   structured `{ message, blocked }` 409 returned by the orders/assignments
 *   APIs — defense-in-depth for the rare case where the person's status
 *   changed between selection and submit.
 *
 * Fails OPEN on lookup errors (network blip, etc.) so a transient glitch
 * never blocks normal work — the write APIs still enforce the rule
 * server-side regardless.
 */
export function useUserActivityGuard() {
    const [blocked, setBlocked] = useState<ActivityBlockInfo | null>(null);
    const [role, setRole] = useState<ActivityGuardRole>("aveugle");
    const resolveRef = useRef<((proceed: boolean) => void) | null>(null);

    const resolveAndClose = useCallback((proceed: boolean) => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setBlocked(null);
        resolve?.(proceed);
    }, []);

    const presentBlock = useCallback(
        (info: ActivityBlockInfo, r: ActivityGuardRole): Promise<boolean> => {
            setRole(r);
            setBlocked(info);
            return new Promise<boolean>((resolve) => {
                resolveRef.current = resolve;
            });
        },
        []
    );

    const requireActive = useCallback(
        async (userId: number | null | undefined, r: ActivityGuardRole): Promise<boolean> => {
            if (!userId) return true;
            try {
                const res = await fetch(`/api/user/${userId}/status`);
                if (!res.ok) return true;
                const data = await res.json();
                if (data.isActive) return true;
                return presentBlock(
                    {
                        userId: data.id,
                        name: data.name,
                        activityStatus: data.activityStatus,
                        statusLabel: data.statusLabel,
                        reason: data.reason,
                        comment: data.comment,
                        changedAt: data.changedAt,
                    },
                    r
                );
            } catch (err) {
                console.error("Activity status check failed:", err);
                return true;
            }
        },
        [presentBlock]
    );

    return { blocked, role, requireActive, presentBlock, resolveAndClose };
}
