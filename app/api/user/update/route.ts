// app/api/user/update/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';
import { isSendableEmail } from '@/lib/email/sendEmail';

/**
 * The two identity fields a person may change about THEMSELVES, from
 * « Mon compte ». Everything else on their fiche — type de membre, niveau
 * d'accès, statut d'activité, coordonnées, notes — belongs to a permanent and
 * goes through /api/user/[id]; nothing here may widen into those.
 *
 * The e-mail is the login, so it is normalized and validated exactly the way
 * /api/user does on creation: an account whose address is unreachable or
 * differently-cased from the one it was invited under can no longer sign in or
 * be sent a password reset.
 */
export const PUT = withAuth(async (request, { me }) => {
    try {
        const body: unknown = await request.json().catch(() => null);
        if (typeof body !== 'object' || body === null) {
            return NextResponse.json({ message: 'Requête invalide' }, { status: 400 });
        }
        const { name, email } = body as { name?: unknown; email?: unknown };

        if (typeof email !== 'string' || !email.trim()) {
            return NextResponse.json({ message: 'L’email est requis' }, { status: 400 });
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!isSendableEmail(normalizedEmail)) {
            return NextResponse.json({ message: 'Adresse email invalide' }, { status: 400 });
        }
        if (name !== undefined && name !== null && typeof name !== 'string') {
            return NextResponse.json({ message: 'Nom invalide' }, { status: 400 });
        }

        // Case-insensitive, like the creation path: two accounts differing only
        // in casing would both match at sign-in and neither would be reachable.
        if (normalizedEmail !== me.email?.toLowerCase()) {
            const emailExists = await prisma.user.findFirst({
                where: {
                    email: { equals: normalizedEmail, mode: 'insensitive' },
                    NOT: { id: me.id },
                },
                select: { id: true },
            });
            if (emailExists) {
                return NextResponse.json(
                    { message: 'Cet email est déjà utilisé' },
                    { status: 400 }
                );
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: me.id },
            data: {
                name: typeof name === 'string' ? name.trim() || null : undefined,
                email: normalizedEmail,
            },
            select: { id: true, email: true, name: true },
        });

        // The name shows up wherever this person authored something, so the
        // whole back office can be stale after this write.
        revalidateAdmin();

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du profil:', error);
        return NextResponse.json(
            { message: 'Échec de la mise à jour du profil' },
            { status: 500 }
        );
    }
});
