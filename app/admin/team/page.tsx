import { prisma } from '@/lib/prisma';
import { TeamManager } from './team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeam() {
    const members = await prisma.teamMember.findMany({
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    });
    return <TeamManager initial={members} />;
}
