// app/api/user/profile/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user?.email) {
            return new NextResponse(
                JSON.stringify({ error: 'Non autorisé' }),
                { status: 401 }
            );
        }

        // Get user data with counts
        const userData = await prisma.user.findUnique({
            where: {
                email: session.user.email,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                _count: {
                    select: {
                        books: true,
                        News: true,
                        CoupsDeCoeur: true,
                    },
                },
            },
        });

        if (!userData) {
            return new NextResponse(
                JSON.stringify({ error: 'Utilisateur non trouvé' }),
                { status: 404 }
            );
        }

        return NextResponse.json(userData);
    } catch (error) {
        console.error('Erreur lors de la récupération du profil:', error);
        return new NextResponse(
            JSON.stringify({ error: 'Échec de récupération du profil' }),
            { status: 500 }
        );
    }
}