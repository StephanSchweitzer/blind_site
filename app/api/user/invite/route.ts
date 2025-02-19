// app/api/user/invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from "@/lib/auth"
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';

export async function POST(req: NextRequest) {
    try {
        // Verify authentication and authorization
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Get current user and check if they're a super_admin
        const currentUser = await prisma.user.findUnique({
            where: { email: session.user?.email as string },
        });

        if (!currentUser || currentUser.role !== 'super_admin') {
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent inviter des utilisateurs.' },
                { status: 403 }
            );
        }

        // Parse request body
        const { email, name, role } = await req.json();

        // Validate input
        if (!email) {
            return NextResponse.json(
                { message: 'L\'email est requis' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { message: 'Un utilisateur avec cet email existe déjà' },
                { status: 409 }
            );
        }

        // Generate temporary password
        const temporaryPassword = generatePassword();

        // Hash the temporary password
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        // Create the new user
        const newUser = await prisma.user.create({
            data: {
                email,
                name: name || null,
                role: role || 'user',
                password: hashedPassword,
                passwordNeedsChange: true, // Flag to force password change on first login
            },
        });

        // Here you would typically send an email with the temporary password
        // For now, we'll just return it in the response
        // Note: In production, you should use a secure email service

        return NextResponse.json(
            {
                message: 'Utilisateur invité avec succès',
                userId: newUser.id,
                temporaryPassword: temporaryPassword // Only for development
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Erreur lors de l\'invitation d\'un utilisateur:', error);
        return NextResponse.json(
            { message: 'Erreur lors de l\'invitation de l\'utilisateur' },
            { status: 500 }
        );
    }
}