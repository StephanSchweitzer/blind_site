'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineLoading } from '@/components/ui/inline-loading';

type Usage = { orderCount: number; assignmentCount: number };

/**
 * « Ce livre : 3 demandes · 1 attribution » — chaque compte mène à la liste
 * filtrée sur ce livre (`?bookId=`, lib/books/bookFilter.ts).
 *
 * Répond à « qu'existe-t-il déjà pour ce livre ? » là où la question se pose :
 * la fiche livre, et le livre des formulaires de demande et d'attribution. Un
 * nouvel onglet, parce que les trois vivent dans une fenêtre dont la saisie en
 * cours ne doit pas se perdre.
 *
 * Pendant le chargement, la ligne garde sa place et ne dit que « Vérification… »
 * (au-delà de 200 ms) ; si la requête échoue, elle disparaît : afficher
 * « 0 demande » sur une erreur dirait une chose fausse.
 */
export function BookUsageLinks({ bookId, className }: { bookId: number; className?: string }) {
    const [usage, setUsage] = useState<{ bookId: number; data: Usage } | null>(null);
    const [failedFor, setFailedFor] = useState<number | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/books/${bookId}/usage`, { signal: controller.signal })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: Usage | null) => {
                if (data) setUsage({ bookId, data });
                else setFailedFor(bookId);
            })
            .catch(() => {
                if (!controller.signal.aborted) setFailedFor(bookId);
            });
        return () => controller.abort();
    }, [bookId]);

    if (failedFor === bookId) return null;
    // Premier chargement, ou le livre a changé et ses comptes ne sont pas encore là.
    if (!usage || usage.bookId !== bookId) {
        return (
            <p className={cn('flex items-center text-sm', className)}>
                <InlineLoading />
            </p>
        );
    }
    const { orderCount, assignmentCount } = usage.data;

    const part = (count: number, singular: string, plural: string, href: string) =>
        count === 0 ? (
            <span className="text-muted-foreground">aucune {singular}</span>
        ) : (
            <Link
                prefetch={false}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
            >
                {count} {count > 1 ? plural : singular}
                <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
        );

    return (
        <p className={cn('flex flex-wrap items-center gap-x-1.5 text-sm text-foreground', className)}>
            <span className="text-muted-foreground">Ce livre :</span>
            {part(orderCount, 'demande', 'demandes', `/admin/orders?bookId=${bookId}`)}
            <span className="text-muted-foreground" aria-hidden>·</span>
            {part(assignmentCount, 'attribution', 'attributions', `/admin/assignments?bookId=${bookId}`)}
        </p>
    );
}
