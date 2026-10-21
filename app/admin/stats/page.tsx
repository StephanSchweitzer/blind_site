import { notFound } from 'next/navigation';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import StatsDashboard from './stats-dashboard';

export const dynamic = 'force-dynamic';

// Titré pour le super admin seulement : un titre fixe nommerait l'onglet de la
// 404 que voit un permanent, et trahirait la page.
export async function generateMetadata() {
    const me = await getCurrentUser();
    return isSuperAdmin(me?.accessLevel) ? { title: 'Statistiques' } : {};
}

export default async function AdminStatsPage() {
    // 404 (not 403 / redirect) on purpose: non-super-admins must not learn
    // that this URL exists. getCurrentUser resolves the level from the DB.
    const me = await getCurrentUser();
    if (!me || !isSuperAdmin(me.accessLevel)) notFound();

    return <StatsDashboard />;
}
