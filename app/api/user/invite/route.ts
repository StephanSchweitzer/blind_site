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

const resend = new Resend(process.env.RESEND_API_KEY);

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

        const session = await getServerSession(authOptions);
        if (!session) {
            console.log("Authentication failed: No session");
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        const currentUser = await prisma.user.findUnique({
            where: { email: session.user?.email as string },
        });

        if (!currentUser || currentUser.accessLevel !== 'super_admin') {
            console.log(`Authorization failed: User ${session.user?.email} is not a super_admin`);
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent inviter des utilisateurs.' },
                { status: 403 }
            );
        }

        const { email, name, accessLevel, memberType } = await req.json();
        console.log(`Invite request for: ${email}, accessLevel: ${accessLevel}, memberType: ${memberType}`);

        if (!email) {
            return NextResponse.json(
                { message: 'L\'email est requis' },
                { status: 400 }
            );
        }

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

        const temporaryPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                name: name || null,
                role: accessLevel || 'user',
                accessLevel: accessLevel || 'user',
                memberType: memberType || null,
                password: hashedPassword,
                passwordNeedsChange: true,
            },
        });
        console.log(`User created with ID: ${newUser.id}`);

        try {
            console.log("Preparing to send invitation email");
            console.log(`Environment variables check: RESEND_API_KEY exists: ${!!process.env.RESEND_API_KEY}`);
            console.log(`From email: ${process.env.RESEND_FROM_EMAIL || 'noreply@eca-aveugles.com'}`);
            console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);

            const emailHtml = await render(
                InvitationEmail({
                    name: name || '',
                    email,
                    accessLevel: accessLevel || 'user',
                    memberType: memberType || undefined,
                    temporaryPassword,
                    appName: process.env.APP_NAME || 'ECA Aveugles',
                    loginUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/admin` : undefined
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
            if (emailError instanceof Error) {
                console.error('Error message:', emailError.message);
                console.error('Error stack:', emailError.stack);
            }
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