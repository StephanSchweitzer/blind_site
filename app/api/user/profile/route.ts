// app/api/user/profile/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';

export const GET = withAuth(async (_req, { me }) => {
    try {
        if (!me.email) {
            return new NextResponse(
                JSON.stringify({ error: 'Non autorisé' }),
                { status: 401 }
            );
        }

        // Get user data with counts
        const userData = await prisma.user.findUnique({
            where: {
                email: me.email,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                accessLevel: true,
                memberType: true,
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
                JSON.stringify({ error: 'Personne non trouvée' }),
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
});