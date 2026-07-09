import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TeamManager } from './team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeam() {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') redirect('/admin');

    const members = await prisma.teamMember.findMany({
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    });
    return <TeamManager initial={members} />;
}
