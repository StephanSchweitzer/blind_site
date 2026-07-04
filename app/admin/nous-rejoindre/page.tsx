import { prisma } from '@/lib/prisma';
import { MembershipManager } from './membership-manager';

export const dynamic = 'force-dynamic';

export default async function AdminMembership() {
    const items = await prisma.membershipOption.findMany({ orderBy: { sortOrder: 'asc' } });
    return <MembershipManager initial={items} />;
}
