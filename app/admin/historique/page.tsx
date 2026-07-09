import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { HistoriqueManager } from './historique-manager';

export const dynamic = 'force-dynamic';

export default async function AdminHistorique() {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') redirect('/admin');

    const events = await prisma.historyEvent.findMany({ orderBy: { year: 'asc' } });
    return <HistoriqueManager initial={events} />;
}
