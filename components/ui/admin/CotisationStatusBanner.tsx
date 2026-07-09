'use client';

import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { formatCotisationDate } from '@/lib/cotisation';

interface CotisationStatusResponse {
    isPaid: boolean;
    expiresAt: string | null;
    coverYear: number | null;
    latestPaymentDate: string | null;
}

// Compact "is the cotisation up to date?" banner shown at the top of the user
// form. Fetches on mount from /api/user/[id]/cotisation, mirroring the pattern
// used by UserActivityHistory. Only meaningful in the edit flow (a not-yet-
// created member has no payments), so callers guard on an existing userId.
export function CotisationStatusBanner({ userId }: { userId: string | number }) {
    const [status, setStatus] = useState<CotisationStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/user/${userId}/cotisation`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Erreur lors du chargement de la cotisation');
                return res.json();
            })
            .then((data: CotisationStatusResponse) => {
                if (!cancelled) setStatus(data);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (loading) {
        return (
            <Alert className="mb-4 bg-muted/40 border-border">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription className="text-muted-foreground">
                    Vérification de la cotisation…
                </AlertDescription>
            </Alert>
        );
    }

    // On error, stay quiet rather than blocking the form with a scary banner.
    if (error || !status) return null;

    if (status.isPaid) {
        return (
            <Alert className="mb-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-700 dark:text-green-200">
                    Cotisation à jour — expire le {formatCotisationDate(status.expiresAt)}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <Alert className="mb-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-700 dark:text-amber-200">
                {status.expiresAt
                    ? `Cotisation non à jour — expirée le ${formatCotisationDate(status.expiresAt)}`
                    : 'Aucune cotisation enregistrée'}
            </AlertDescription>
        </Alert>
    );
}
