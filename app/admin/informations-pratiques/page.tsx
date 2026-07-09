import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PracticalInfoManager } from './practical-info-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPracticalInfo() {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') redirect('/admin');

    const items = await prisma.practicalInfo.findMany({ orderBy: { sortOrder: 'asc' } });
    return <PracticalInfoManager initial={items} />;
}
