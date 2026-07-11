import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { MembershipManager } from './membership-manager';

export const dynamic = 'force-dynamic';

export default async function AdminMembership() {
    const me = await getCurrentUser();
    if (!isSuperAdmin(me?.accessLevel)) redirect('/admin');

    const items = await prisma.membershipOption.findMany({ orderBy: { sortOrder: 'asc' } });
    return <MembershipManager initial={items} />;
}
