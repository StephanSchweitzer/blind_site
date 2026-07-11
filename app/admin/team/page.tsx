import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { TeamManager } from './team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeam() {
    const me = await getCurrentUser();
    if (!isSuperAdmin(me?.accessLevel)) redirect('/admin');

    const members = await prisma.teamMember.findMany({
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    });
    return <TeamManager initial={members} />;
}
