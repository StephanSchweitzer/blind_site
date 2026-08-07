import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { getPersonAvailability } from '@/lib/users/availabilityData';

/**
 * One person's availability, as the panel of /admin/disponibilites shows it:
 * their situation, their attributions and their recent status changes.
 *
 * Read-only on purpose. The two writes it feeds keep their existing homes —
 * POST /api/user/[id]/activity for the status and its window (append-only
 * history, isAvailable sync guard) and PATCH /api/user/[id] for the profile
 * flags — so the panel can never quietly grow a second set of rules.
 */
export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_request, { params }) => {
    const { id } = await params!;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const detail = await getPersonAvailability(userId);
        if (!detail) {
            return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
        }
        return NextResponse.json(detail);
    } catch (error) {
        console.error('Error loading person availability:', error);
        return NextResponse.json(
            { message: 'Erreur lors du chargement de la disponibilité' },
            { status: 500 }
        );
    }
});
