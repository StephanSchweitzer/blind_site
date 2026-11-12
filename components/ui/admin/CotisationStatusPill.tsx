'use client';

import React, { useEffect, useState } from 'react';
import { formatCotisationDate, isCotisationExempt } from '@/lib/cotisation';

interface CotisationStatusResponse {
    isPaid: boolean;
    expiresAt: string | null;
    coverYear: number | null;
    latestPaymentDate: string | null;
}

const PILL = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium';

/**
 * "Is the cotisation up to date?" as one pill, not a banner. It used to be a
 * full-width alert above the fiche: one fact taking a whole row. The dossier
 * header renders the same pill from server data, so both read alike.
 *
 * `memberType` keeps it silent for members who owe no cotisation (Donateurs) —
 * see isCotisationExempt — unless one happens to be paid.
 */
export function CotisationPill({
    isPaid,
    expiresAt,
    memberType,
}: {
    isPaid: boolean;
    expiresAt: Date | string | null;
    memberType?: string | null;
}) {
    if (isPaid) {
        return (
            <span className={`${PILL} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`}>
                Cotisation à jour · expire le {formatCotisationDate(expiresAt)}
            </span>
        );
    }
    // A Donateur owes no cotisation — never badge them as unpaid or expired.
    if (isCotisationExempt(memberType)) return null;
    return (
        <span className={`${PILL} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`}>
            {expiresAt
                ? `Cotisation expirée le ${formatCotisationDate(expiresAt)}`
                : 'Cotisation non payée'}
        </span>
    );
}

/** The same pill, fetched from /api/user/[id]/cotisation for the edit window. */
export function CotisationStatusPill({
    userId,
    memberType,
}: {
    userId: string | number;
    memberType?: string | null;
}) {
    const [status, setStatus] = useState<CotisationStatusResponse | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/user/${userId}/cotisation`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: CotisationStatusResponse | null) => {
                if (!cancelled) setStatus(data);
            })
            // On error, stay quiet: the pill is a hint, not a gate on the form.
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [userId]);

    // It sits at the end of the status line, so arriving late shifts nothing.
    if (!status) return null;
    return <CotisationPill isPaid={status.isPaid} expiresAt={status.expiresAt} memberType={memberType} />;
}
