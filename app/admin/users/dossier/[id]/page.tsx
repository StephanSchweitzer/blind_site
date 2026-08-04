import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function DossierIndex({
                                               params,
                                           }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const userId = parseInt(id);

    const user = Number.isNaN(userId)
        ? null
        : await prisma.user.findUnique({
            where: { id: userId },
            select: { memberType: true },
        });

    // Land on the tab that matches what the member does: an auditeur's file is
    // about what they asked for, a lecteur's about what they are reading.
    // Anyone else keeps the attributions default.
    const tab =
        user?.memberType === 'auditeur' || user?.memberType === 'ecouteur'
            ? 'demandes'
            : 'affectations';

    redirect(`/admin/users/dossier/${id}/${tab}`);
}
