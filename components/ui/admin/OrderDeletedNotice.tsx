'use client';

import { Trash2 } from 'lucide-react';

/**
 * La « cette demande est supprimée » de la modale d'édition — même rôle et
 * même forme que DossierDeletedNotice (personnes) et BookDeletedNotice
 * (livres) : GET /api/orders/[id] ne 404 plus sur `deletedAt` (lib/prisma.ts
 * ne filtre pas `findUnique`), donc un lien du journal, un signet ou une URL
 * `?order=` tapée à la main continue de mener quelque part plutôt que de
 * jeter un toast d'erreur.
 *
 * Contrairement aux livres et aux personnes, une demande supprimée n'a pas
 * de restauration : OrderFormBackendBase passe le formulaire en lecture
 * seule (`readOnly`) plutôt que d'offrir une action qui n'existe pas côté
 * API.
 */

interface OrderDeletedNoticeProps {
    /** ISO string — formaté ici pour que serveur et client s'accordent sur le fuseau. */
    deletedAt: string;
}

export default function OrderDeletedNotice({ deletedAt }: OrderDeletedNoticeProps) {
    const on = new Date(deletedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    });

    return (
        <div
            role="status"
            className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4"
        >
            <div className="flex items-start gap-3">
                <Trash2 size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                        Demande supprimée le {on}
                    </p>
                    <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                        Elle n’apparaît plus dans les listes, les recherches ni les statistiques,
                        et ne compte plus dans aucune facture. Le reste du formulaire est en
                        lecture seule.
                    </p>
                </div>
            </div>
        </div>
    );
}
