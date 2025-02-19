// app/api/user/update/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request) {
    try {
        // Get session
        const session = await getServerSession(authOptions);

        if (!session || !session.user?.email) {
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
            where: { email: session.user.email },
        });

        if (!existingUser) {
            return new NextResponse(
                JSON.stringify({ message: 'Utilisateur non trouvé' }),
                { status: 404 }
            );
        }

        // Check if new email already exists (if changing email)
        if (email !== session.user.email) {
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
            where: { email: session.user.email },
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
}