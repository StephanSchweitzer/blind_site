import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { getAvailabilityOverview } from '@/lib/users/availabilityData';
import AvailabilityDashboard from './availability-dashboard';

/**
 * Disponibilités — the planning view over member availability.
 *
 * Loading it also closes any indisponibilité that has reached its term (that
 * happens inside getAvailabilityOverview), which is why the page must never be
 * cached: a stale render would show absences that ended days ago.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvailabilityPage() {
    const me = await getCurrentUser();

    if (!me) redirect('/auth/signin');
    if (!isAdmin(me.accessLevel)) redirect('/');

    const data = await getAvailabilityOverview();

    return <AvailabilityDashboard data={data} />;
}
