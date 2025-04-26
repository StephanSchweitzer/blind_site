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

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
    return NextResponse.json({}, {
        status: 200,
        headers: {
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Origin': '*',
        }
    });
}

export async function POST(req: NextRequest) {
    try {
        console.log("POST request received to invite user");

        // Verify authentication and authorization
        const session = await getServerSession(authOptions);
        if (!session) {
            console.log("Authentication failed: No session");
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
            console.log(`Authorization failed: User ${session.user?.email} is not a super_admin`);
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent inviter des utilisateurs.' },
                { status: 403 }
            );
        }

        // Parse request body
        const { email, name, role } = await req.json();
        console.log(`Invite request for: ${email}, role: ${role}`);

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
            console.log(`User already exists: ${email}`);
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
        console.log(`User created with ID: ${newUser.id}`);

        // Send email with the temporary password using Resend and the React Email template
        try {
            console.log("Preparing to send invitation email");
            console.log(`Environment variables check: RESEND_API_KEY exists: ${!!process.env.RESEND_API_KEY}`);
            console.log(`From email: ${process.env.RESEND_FROM_EMAIL || 'noreply@eca-aveugles.com'}`);
            console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);

            const emailHtml = await render(
                InvitationEmail({
                    name: name || '',
                    email,
                    role: role || 'user',
                    temporaryPassword,
                    appName: process.env.APP_NAME || 'ECA Aveugles',
                    loginUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/login` : undefined
                })
            );

            const emailResult = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'noreply@eca-aveugles.com',
                to: email,
                subject: `Invitation to join ${process.env.APP_NAME || 'Your Application'}`,
                html: emailHtml,
            });

            console.log(`Invitation email sent to ${email}, result:`, emailResult);
        } catch (emailError) {
            console.error('Error sending invitation email:', emailError);
            // Log more detailed error information
            if (emailError instanceof Error) {
                console.error('Error message:', emailError.message);
                console.error('Error stack:', emailError.stack);
            }
            // Note: We continue even if email fails, but log the error
        }

        return NextResponse.json(
            {
                message: 'Utilisateur invité avec succès',
                userId: newUser.id,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Erreur lors de l\'invitation d\'un utilisateur:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        return NextResponse.json(
            { message: 'Erreur lors de l\'invitation de l\'utilisateur' },
            { status: 500 }
        );
    }
}