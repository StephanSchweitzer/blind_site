// app/api/user/invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from "@/lib/auth"
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { Resend } from 'resend';
import InvitationEmail from '@/components/emails/InvitationEmail';
import { render } from '@react-email/render';

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

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

        // Send email with the temporary password using Resend and the React Email template
        try {
            // Fix for the TypeScript error - use renderAsync and await the result
            const emailHtml = await render(
                InvitationEmail({
                    name: name || '',
                    email,
                    role: role || 'user',
                    temporaryPassword,
                    appName: process.env.APP_NAME || 'Your Application',
                    loginUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/login` : undefined
                })
            );

            await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || '<noreply@eca-aveugles.com>',
                to: email,
                subject: `Invitation to join ${process.env.APP_NAME || 'Your Application'}`,
                html: emailHtml, // Now emailHtml is properly awaited string
            });

            console.log(`Invitation email sent to ${email}`);
        } catch (emailError) {
            console.error('Error sending invitation email:', emailError);
            // Note: We continue even if email fails, but log the error
        }

        return NextResponse.json(
            {
                message: 'Utilisateur invité avec succès',
                userId: newUser.id,
                // No longer returning the temporary password in the response
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