'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';

/**
 * « Lecture en cours : l'audio peut être incomplet » — dans la fenêtre audio,
 * là où l'on télécharge les pistes pour les envoyer à l'auditeur.
 *
 * Un avis, pas un blocage : le pourquoi, et le choix du permanent nommé, sont
 * dans lib/assignments/inProgressContact.ts.
 *
 * Quand un dépôt a eu lieu depuis le début de la lecture (`toFinish`,
 * lib/assignments/audioDeposee.ts), l'avis devient un rappel : c'est aussi là
 * qu'on dépose l'audio, et le geste qu'on oublie ensuite — terminer
 * l'attribution — se fait ailleurs. Un seul encadré plutôt que deux : le rappel
 * garde la mise en garde (« si elle ne l'est pas, l'audio est incomplet »), pour
 * celui qui ouvre la fenêtre afin de télécharger.
 *
 * Comme MissingDemandeNotice, le composant décide seul de se taire (pas encore
 * chargé, aucune lecture en cours, ou aucune piste à récupérer) : l'appelant le
 * monte sans condition, pour qu'aucun nettoyage du JSX ne l'emporte.
 */
export function InProgressReadingNotice({
    reading,
    toFinish,
    trackCount,
    disabled = false,
}: {
    /** `undefined` = pas encore chargé ; `null` = aucune attribution « En cours ». */
    reading: { contactName: string | null } | null | undefined;
    /** `undefined` = pas encore chargé ; `null` = aucun dépôt depuis le début d'une lecture ouverte. */
    toFinish: { assignmentId: number } | null | undefined;
    trackCount: number | undefined;
    /** Un envoi en cours : quitter la page l'interromprait. */
    disabled?: boolean;
}) {
    if (!trackCount) return null;

    const checkWith = reading?.contactName
        ? `vérifiez auprès de ${reading.contactName} avant de l’envoyer`
        : 'vérifiez auprès du permanent qui suit l’attribution avant de l’envoyer';

    if (toFinish) {
        return (
            <div
                role="status"
                className="flex-shrink-0 flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-blue-800 dark:text-blue-300"
            >
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="space-y-2 text-xs">
                    <p className="text-sm font-semibold">
                        Audio déposé : l&apos;attribution n°{toFinish.assignmentId} est toujours ouverte
                    </p>
                    <p>
                        Si la lecture est complète, terminez l&apos;attribution en renseignant sa date
                        de retour aux ECA : sa demande passera alors « Attente envoi vers auditeur ».
                        Sinon, l&apos;audio est incomplet : {checkWith}.
                    </p>
                    <Link
                        href={`/admin/assignments?assignment=${toFinish.assignmentId}`}
                        aria-disabled={disabled || undefined}
                        tabIndex={disabled ? -1 : undefined}
                        className={`inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2 hover:no-underline ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                    >
                        Terminer l&apos;attribution n°{toFinish.assignmentId}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        );
    }

    if (!reading) return null;

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
