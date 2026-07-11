import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { PracticalInfoManager } from './practical-info-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPracticalInfo() {
    const me = await getCurrentUser();
    if (!isSuperAdmin(me?.accessLevel)) redirect('/admin');

    const items = await prisma.practicalInfo.findMany({ orderBy: { sortOrder: 'asc' } });
    return <PracticalInfoManager initial={items} />;
}
