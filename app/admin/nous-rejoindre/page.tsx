import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { MembershipManager } from './membership-manager';

export const dynamic = 'force-dynamic';

export default async function AdminMembership() {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') redirect('/admin');

    const items = await prisma.membershipOption.findMany({ orderBy: { sortOrder: 'asc' } });
    return <MembershipManager initial={items} />;
}
