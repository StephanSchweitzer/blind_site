/** STATUS.TERMINE / STATUS.ATTENTE_AUDITEUR — dupliqués ici parce que lib/statusSync.ts est serveur. */
const TERMINE_STATUS_ID = 3;
const ATTENTE_AUDITEUR_STATUS_ID = 6;

/**
 * Sous une demande pas encore « Terminé », dans les deux listes où l'on choisit
 * quoi facturer (« Créer une nouvelle facture », « Ajouter une demande » d'un
 * brouillon). Elle reste cochable : facturer une demande en cours est parfois
 * le bon geste.
 *
 * « Attente envoi vers auditeur » a sa propre phrase. Depuis que le retour du
 * lecteur ne clôt plus la demande, des permanents venaient la chercher ici dès
 * l'attribution terminée et l'ajoutaient à la main — sans jamais renseigner la
 * date de clôture, qui est pourtant ce qui la facture toute seule.
 */
export function OrderNotFinishedNote({ statusId }: { statusId: number }) {
    if (statusId === TERMINE_STATUS_ID) return null;
    return (
        <div className="text-amber-700 dark:text-amber-500 text-xs mt-0.5">
            {statusId === ATTENTE_AUDITEUR_STATUS_ID
                // « facturée », pas « ajoutée au brouillon » : une demande à la page
                // reçoit sa pro-forma à la clôture, elle ne rejoint aucun brouillon.
                ? "Pas encore expédiée à l'auditeur : renseignez sa date de clôture, elle sera alors facturée toute seule"
                : 'Prestation pas encore terminée'}
        </div>
    );
}
