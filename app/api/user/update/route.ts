// app/api/user/update/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';

export const PUT = withAuth(async (request, { me }) => {
    revalidateAdmin();
    try {
        if (!me.email) {
            return new NextResponse(
                JSON.stringify({ error: 'Non autorisé' }),
                { status: 401 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { name, email } = body;

        // Validate input
        if (!email) {
            return new NextResponse(
                JSON.stringify({ message: 'L\'email est requis' }),
                { status: 400 }
            );
        }

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: me.email },
        });

        if (!existingUser) {
            return new NextResponse(
                JSON.stringify({ message: 'Personne non trouvé' }),
                { status: 404 }
            );
        }

        // Check if new email already exists (if changing email)
        if (email !== me.email) {
            const emailExists = await prisma.user.findUnique({
                where: { email },
            });

            if (emailExists) {
                return new NextResponse(
                    JSON.stringify({ message: 'Cet email est déjà utilisé' }),
                    { status: 400 }
                );
            }
        }

        // Update user
        const updatedUser = await prisma.user.update({
            where: { email: me.email },
            data: {
                name,
                email,
            },
            select: {
                id: true,
                email: true,
                name: true,
            },
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du profil:', error);
        return new NextResponse(
            JSON.stringify({ message: 'Échec de la mise à jour du profil' }),
            { status: 500 }
        );
    }
});