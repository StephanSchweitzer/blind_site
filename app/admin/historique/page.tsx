import { prisma } from '@/lib/prisma';
import { HistoriqueManager } from './historique-manager';

export const dynamic = 'force-dynamic';

export default async function AdminHistorique() {
    const events = await prisma.historyEvent.findMany({ orderBy: { year: 'asc' } });
    return <HistoriqueManager initial={events} />;
}
