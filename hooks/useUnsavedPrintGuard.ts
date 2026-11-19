'use client';

import { useCallback } from 'react';
import { useConfirm, type ConfirmOptions } from '@/components/ui/confirm-dialog';

/**
 * Imprimer avec des modifications non enregistrées.
 *
 * Les documents s'impriment depuis la BASE — la facture, le paiement, la liste
 * de livres tels qu'ils sont enregistrés —, pas depuis ce que le formulaire
 * affiche. Corriger un montant puis cliquer « Imprimer » sortait donc l'ancien
 * montant, sans un mot. Le bouton d'impression demande d'abord : enregistrer,
 * puis imprimer, ou imprimer la version enregistrée en connaissance de cause.
 *
 * Les étiquettes d'adresse n'en ont pas besoin : elles impriment ce qui est à
 * l'écran (MailingLabelButton).
 *
 *     const guardPrint = useUnsavedPrintGuard(isDirty);
 *     if (!(await guardPrint())) return;
 *
 * `status` : le geste change aussi le statut, ce qui recharge la fiche — les
 * modifications ne sont alors pas seulement absentes du document, elles sont
 * perdues.
 *
 * `printPrompt` : là où « enregistrer » n'est pas le mot de l'écran — la
 * facture, dont le statut choisi se valide par « Confirmer » —, l'avertissement
 * d'impression tout entier. Une constante du module appelant : un objet neuf à
 * chaque rendu referait la fonction rendue à chaque rendu.
 */
export function useUnsavedPrintGuard(
    unsaved: boolean,
    printPrompt?: ConfirmOptions,
) {
    const confirm = useConfirm();
    return useCallback(
        async (gesture: 'print' | 'status' = 'print'): Promise<boolean> => {
            if (!unsaved) return true;
            if (gesture === 'print' && printPrompt) return confirm(printPrompt);
            return gesture === 'status'
                ? confirm({
                    title: 'Modifications non enregistrées',
                    description:
                        'Vous avez modifié ce formulaire sans l’enregistrer. Changer le statut recharge la version enregistrée : vos modifications seraient perdues, et n’apparaîtraient pas sur le document.\n\nPour les garder, revenez au formulaire et enregistrez-les d’abord.',
                    confirmLabel: 'Continuer sans mes modifications',
                    cancelLabel: 'Revenir au formulaire',
                    destructive: true,
                })
                : confirm({
                    title: 'Modifications non enregistrées',
                    description:
                        'Vous avez modifié ce formulaire sans l’enregistrer. Le document imprimé reprendra la version enregistrée : vos modifications n’y figureront pas.\n\nPour qu’elles y figurent, revenez au formulaire, enregistrez, puis imprimez.',
                    confirmLabel: 'Imprimer sans mes modifications',
                    cancelLabel: 'Revenir au formulaire',
                });
        },
        [unsaved, confirm, printPrompt],
    );
}
