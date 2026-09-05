import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { getUserDisplayName } from '@/lib/users/displayName';

/**
 * Undo a soft deletion — the counterpart of DELETE /api/user/[id].
 *
 * WHY THIS EXISTS SEPARATELY FROM THE JOURNAL'S « Restaurer »
 *
 * The audit trail's restore recreates a row from a snapshot, and is a
 * last-resort tool: it inherits the journal's 14-day retention, its redaction
 * (a restored User comes back with no password hash) and its size limits. None
 * of that applies here. A soft-deleted person was never destroyed — the row is
 * intact, `deletedAt` merely hides it from every list read (see the extension in
 * lib/prisma.ts) — so undoing it is one column write, keeps the password, and
 * works forever rather than for a fortnight.
 *
 * Undo belongs to the domain model. The journal only records that it happened,
 * which the audit extension does on its own for this update.
 */
export const POST = withAdmin(async (_request, { params }) => {
    const { id } = await params!;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'ID de personne invalide' }, { status: 400 });
    }

    try {
        // findUnique is deliberately NOT soft-delete-filtered, which is the whole
        // reason a deleted person is still reachable by id — and why this can
        // answer idempotently instead of 404-ing on the row it is meant to fix.
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                deletedAt: true,
                civility: { select: { name: true } },
            },
        });

        if (!user) {
            return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
        }

        const named = getUserDisplayName({
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            civility: user.civility?.name ?? null,
        });

        if (!user.deletedAt) {
            return NextResponse.json({
                message: `La fiche de ${named} n’est pas supprimée : rien à restaurer.`,
                restoredId: userId,
                alreadyActive: true,
            });
        }

        await prisma.user.update({
            where: { id: userId },
            data: { deletedAt: null },
            select: { id: true },
        });

        revalidateAdmin();
        return NextResponse.json({
            message: `${named} a été restauré. La fiche réapparaît dans les listes et les recherches.`,
            restoredId: userId,
        });
    } catch (error) {
        console.error('Error restoring user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la restauration de la personne' },
            { status: 500 }
        );
    }
});
