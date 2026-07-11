import { notFound } from 'next/navigation';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import StatsDashboard from './stats-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminStatsPage() {
    // 404 (not 403 / redirect) on purpose: non-super-admins must not learn
    // that this URL exists. getCurrentUser resolves the level from the DB.
    const me = await getCurrentUser();
    if (!me || !isSuperAdmin(me.accessLevel)) notFound();

    return <StatsDashboard />;
}
