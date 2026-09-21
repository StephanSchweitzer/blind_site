import 'server-only';

import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';
import { getUserDisplayName } from '@/lib/users/displayName';

/**
 * « Lecture en cours : l'audio peut être incomplet » — ce que la fenêtre audio
 * d'un livre doit savoir pour le dire, et à qui renvoyer le permanent.
 *
 * POURQUOI UN AVIS ET PAS UN REFUS
 *
 * Le risque : quelqu'un ouvre un livre, voit de l'audio, le télécharge et
 * l'envoie à l'auditeur alors que le lecteur n'a pas fini — typiquement une
 * attribution rouverte parce qu'une partie seulement avait été rendue. Il a été
 * envisagé d'interdire la réouverture tant que le livre porte de l'audio. Écarté :
 * rouvrir aurait coûté une suppression, un détour par l'ordinateur d'un permanent
 * et un nouveau dépôt, et un geste aussi cher, on le saute — le livre serait
 * resté « Terminé » avec un audio incomplet, le cas même qu'on voulait éviter.
 * On avertit donc là où l'audio se récupère, sans rien bloquer.
 *
 * À QUI S'ADRESSER
 *
 * Le lecteur n'a pas de compte : on nomme le permanent qui a le contexte, dans
 * cet ordre —
 *   1. celui qui a rouvert l'attribution (dernier AssignmentEvent REOPENED) :
 *      c'est lui qui sait pourquoi la lecture est incomplète ;
 *   2. celui qui l'a créée (AssignmentEvent CREATED) ;
 *   3. le « Traité par » de la demande liée. Pas celui de l'attribution :
 *      Assignment.processedByStaffId existe mais aucun formulaire ne le remplit.
 * Les attributions importées d'Access n'ont aucun événement ; sans demande non
 * plus, `contactName` reste null et l'avis parle du permanent sans le nommer.
 *
 * « En cours » seulement : « Attente envoi vers lecteur » veut dire que la
 * lecture n'a pas commencé, et l'audio éventuel du livre vient d'une lecture
 * antérieure — rien à signaler.
 */
export interface InProgressReading {
    contactName: string | null;
}

const personSelect = {
    firstName: true,
    lastName: true,
    name: true,
    email: true,
} as const;

export async function readInProgressReading(bookId: number): Promise<InProgressReading | null> {
    // La plus récente d'abord : si plusieurs lectures du même livre sont en cours,
    // c'est la dernière lancée qui a le plus de chances d'expliquer l'audio présent.
    // Le filtre de suppression logique (lib/prisma.ts) écarte les attributions
    // supprimées de ce findFirst.
    const assignment = await prisma.assignment.findFirst({
        where: { catalogueId: bookId, statusId: STATUS.EN_COURS },
        orderBy: { id: 'desc' },
        select: {
            events: {
                where: { type: { in: ['REOPENED', 'CREATED'] }, performedById: { not: null } },
                orderBy: { id: 'desc' },
                select: { type: true, performedBy: { select: personSelect } },
            },
            order: { select: { processedByStaff: { select: personSelect } } },
        },
    });
    if (!assignment) return null;

    const person =
        assignment.events.find((e) => e.type === 'REOPENED')?.performedBy ??
        assignment.events.find((e) => e.type === 'CREATED')?.performedBy ??
        assignment.order?.processedByStaff ??
        null;

    return { contactName: person ? getUserDisplayName(person) : null };
}
