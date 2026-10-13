import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';

/**
 * « Audio déposé, à terminer » — les attributions encore ouvertes alors que
 * l'enregistrement a déjà été déposé dans l'éditeur audio du livre.
 *
 * Le dépôt se fait depuis le Catalogue, l'attribution se termine ailleurs, et
 * c'est le second geste qu'on oublie : la date de retour aux ECA reste vide,
 * l'attribution reste « En cours », la demande n'arrive jamais à « Attente envoi
 * vers auditeur » — l'enregistrement est là, mais aucune liste ne dit de
 * l'expédier.
 *
 * « Le livre a de l'audio » seul ne suffit pas : un livre ré-enregistré porte
 * l'ancienne lecture pendant toute la nouvelle, et une attribution rouverte
 * garde par définition la partie déjà rendue (lib/assignments/inProgressContact.ts).
 * On compte donc un DÉPÔT (AudioTrackEvent UPLOAD) postérieur au début de la
 * lecture — le dernier REOPENED s'il y en a un, sinon le CREATED — sur un livre
 * dont le dossier contient encore des pistes. Les attributions importées d'Access
 * n'ont aucun événement : leur début est la date d'envoi au lecteur, à défaut la
 * date de réception, à défaut tout dépôt compte (ils sont tous postérieurs à
 * l'import).
 *
 * Dérivé à la lecture, comme les délais (lib/orders/delais.ts) : la ligne du
 * tableau de bord et le filtre de la liste lisent les mêmes ids, donc le nombre
 * affiché est le nombre de lignes ouvertes. Borné par le travail en cours.
 * La fenêtre audio du livre pose la même question pour un seul livre
 * (readAssignmentToFinish), sur la même règle.
 */
export async function getOpenAssignmentsWithUploadedAudio(): Promise<number[]> {
    return findOpenAssignmentsWithUploadedAudio({});
}

/**
 * L'attribution à terminer d'un livre, pour le rappel de la fenêtre audio
 * (InProgressReadingNotice) : celle qui vient de recevoir son dépôt. La plus
 * récente si plusieurs sont ouvertes, comme readInProgressReading.
 */
export async function readAssignmentToFinish(bookId: number): Promise<{ assignmentId: number } | null> {
    const ids = await findOpenAssignmentsWithUploadedAudio({ catalogueId: bookId });
    return ids.length > 0 ? { assignmentId: Math.max(...ids) } : null;
}

async function findOpenAssignmentsWithUploadedAudio(where: Prisma.AssignmentWhereInput): Promise<number[]> {
    // Le filtre de suppression logique (lib/prisma.ts) écarte les attributions
    // et les livres supprimés.
    const open = await prisma.assignment.findMany({
        where: {
            AND: [
                {
                    statusId: { in: [STATUS.ATTENTE, STATUS.EN_COURS] },
                    catalogue: { audioLinkStatus: 'OK' },
                },
                where,
            ],
        },
        select: {
            id: true,
            catalogueId: true,
            sentToReaderDate: true,
            receptionDate: true,
            events: {
                where: { type: { in: ['CREATED', 'REOPENED'] } },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
            },
        },
    });
    if (open.length === 0) return [];

    const lastUploads = await prisma.audioTrackEvent.groupBy({
        by: ['bookId'],
        where: { action: 'UPLOAD', bookId: { in: [...new Set(open.map((a) => a.catalogueId))] } },
        _max: { createdAt: true },
    });
    const lastUploadByBook = new Map(lastUploads.map((u) => [u.bookId, u._max.createdAt]));

    return open
        .filter((a) => {
            const lastUpload = lastUploadByBook.get(a.catalogueId);
            if (!lastUpload) return false;
            const start = a.events[0]?.createdAt ?? a.sentToReaderDate ?? a.receptionDate;
            return !start || lastUpload > start;
        })
        .map((a) => a.id);
}
