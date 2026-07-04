import { prisma } from '@/lib/prisma';
import { PracticalInfoManager } from './practical-info-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPracticalInfo() {
    const items = await prisma.practicalInfo.findMany({ orderBy: { sortOrder: 'asc' } });
    return <PracticalInfoManager initial={items} />;
}
