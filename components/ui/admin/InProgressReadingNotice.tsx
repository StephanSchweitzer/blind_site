'use client';

import React from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * « Lecture en cours : l'audio peut être incomplet » — dans la fenêtre audio,
 * là où l'on télécharge les pistes pour les envoyer à l'auditeur.
 *
 * Un avis, pas un blocage : le pourquoi, et le choix du permanent nommé, sont
 * dans lib/assignments/inProgressContact.ts.
 *
 * Comme MissingDemandeNotice, le composant décide seul de se taire (pas encore
 * chargé, aucune lecture en cours, ou aucune piste à récupérer) : l'appelant le
 * monte sans condition, pour qu'aucun nettoyage du JSX ne l'emporte.
 */
export function InProgressReadingNotice({
    reading,
    trackCount,
}: {
    /** `undefined` = pas encore chargé ; `null` = aucune attribution « En cours ». */
    reading: { contactName: string | null } | null | undefined;
    trackCount: number | undefined;
}) {
    if (!reading || !trackCount) return null;

    return (
        <div
            role="status"
            className="flex-shrink-0 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300"
        >
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1 text-xs">
                <p className="text-sm font-semibold">Lecture en cours : l&apos;audio peut être incomplet</p>
                <p>
                    Une attribution de ce livre est encore en cours, la lecture n&apos;est donc pas
                    terminée.{' '}
                    {reading.contactName
                        ? `Vérifiez auprès de ${reading.contactName} avant d’envoyer cet audio.`
                        : 'Vérifiez auprès du permanent qui suit l’attribution avant d’envoyer cet audio.'}
                </p>
            </div>
        </div>
    );
}
