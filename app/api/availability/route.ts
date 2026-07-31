import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { getAvailabilityOverview } from '@/lib/users/availabilityData';

/**
 * Everything /admin/disponibilites needs, in one payload. The page itself
 * server-renders the same call; this route exists so the client can refresh
 * after closing an indisponibilité without a full navigation.
 */
export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => {
    try {
        return NextResponse.json(await getAvailabilityOverview());
    } catch (error) {
        console.error('Error loading availability overview:', error);
        return NextResponse.json(
            { message: 'Erreur lors du chargement des disponibilités' },
            { status: 500 }
        );
    }
});
