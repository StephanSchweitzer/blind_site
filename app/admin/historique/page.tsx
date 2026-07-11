import { prisma } from '@/lib/prisma';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { HistoriqueManager } from './historique-manager';

export const dynamic = 'force-dynamic';

export default async function AdminHistorique() {
    const me = await getCurrentUser();
    if (!isSuperAdmin(me?.accessLevel)) redirect('/admin');

    const events = await prisma.historyEvent.findMany({ orderBy: { year: 'asc' } });
    return <HistoriqueManager initial={events} />;
}
