import 'server-only';

import { prisma } from '@/lib/prisma';
import { bookHasWeighedAudio } from '@/lib/audio/state';
import { STATUS, guardAssignmentHasAudio, type AudioGuardResult } from '@/lib/statusSync';

/**
 * L'exigence d'enregistrement d'une attribution qui passe « Terminé », telle que
 * la création (POST /api/assignments) et la modification (PUT /api/assignments/[id])
 * la vérifient. Les deux routes répétaient la même lecture du bucket suivie du
 * même garde ; la revue (demande tarifée à la page) y ajoute une troisième
 * entrée, la demande liée, et une réponse à trois issues — un seul endroit pour
 * les réunir.
 *
 * `withoutAudio` : l'attribution passe « Terminé » sans enregistrement pesé, ce
 * que seule une revue confirmée permet. Rien alors n'a été rapporté aux ECA : les
 * duplications du même livre restent bloquées, et l'appelant ne doit pas les
 * annoncer comme libérées (findDuplicationsFreedByRecording).
 *
 * Call outside a transaction: bookHasWeighedAudio may reach the bucket.
 */
export async function checkAssignmentTermineAudio(args: {
    statusId: number;
    catalogueId: number;
    orderId: number | null;
    confirmedWithoutAudio: boolean;
    performedById: number | null;
}): Promise<{ guard: AudioGuardResult; withoutAudio: boolean }> {
    if (args.statusId !== STATUS.TERMINE) {
        return { guard: { ok: true }, withoutAudio: false };
    }

    const order = args.orderId
        ? await prisma.orders.findUnique({ where: { id: args.orderId }, select: { pages: true } })
        : null;
    // `pages` non nul est LE marqueur d'une demande à la page (voir Orders.pages).
    const isPageBased = order?.pages != null;

    const hasAudio = await bookHasWeighedAudio(args.catalogueId, args.performedById);
    const guard = guardAssignmentHasAudio({
        statusId: args.statusId,
        hasAudio,
        isPageBased,
        confirmedWithoutAudio: args.confirmedWithoutAudio,
    });

    return { guard, withoutAudio: guard.ok && hasAudio !== true };
}
