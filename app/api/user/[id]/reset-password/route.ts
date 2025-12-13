import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from "@/lib/auth";
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { Resend } from 'resend';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import { render } from '@react-email/render';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const userId = parseInt(resolvedParams.id);

        console.log(`Password reset request for user ID: ${userId}`);

        // Verify authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            console.log("Authentication failed: No session");
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Get current user and verify they're a super_admin
        const currentUser = await prisma.user.findUnique({
            where: { email: session.user?.email as string },
        });

        if (!currentUser || currentUser.role !== 'super_admin') {
            console.log(`Authorization failed: User ${session.user?.email} is not a super_admin`);
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent réinitialiser les mots de passe.' },
                { status: 403 }
            );
        }

        // Get the target user
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!targetUser) {
            console.log(`User not found: ${userId}`);
            return NextResponse.json(
                { message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Check that the target user is an admin or super_admin (has email and password)
        if (targetUser.role !== 'admin' && targetUser.role !== 'super_admin') {
            console.log(`Cannot reset password for user role: ${targetUser.role}`);
            return NextResponse.json(
                { message: 'La réinitialisation de mot de passe est uniquement disponible pour les lecteurs et administrateurs' },
                { status: 400 }
            );
        }

        if (!targetUser.email) {
            console.log(`User ${userId} has no email address`);
            return NextResponse.json(
                { message: 'Cet utilisateur n\'a pas d\'adresse email' },
                { status: 400 }
            );
        }

        // Generate new temporary password
        const temporaryPassword = generatePassword();
        console.log(`Generated new temporary password for user ${userId}`);

        // Hash the new password
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        // Update user with new password
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                passwordNeedsChange: true,
            },
        });
        console.log(`Password updated for user ${userId}`);

        // Send email with the new password
        try {
            console.log(`Preparing to send password reset email to ${targetUser.email}`);

            const emailHtml = await render(
                PasswordResetEmail({
                    name: targetUser.name || targetUser.firstName || '',
                    email: targetUser.email,
                    temporaryPassword,
                    appName: process.env.APP_NAME || 'ECA Aveugles',
                    loginUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/admin` : undefined
                })
            );

            const emailResult = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'noreply@eca-aveugles.com',
                to: targetUser.email,
                subject: `Réinitialisation de votre mot de passe - ${process.env.APP_NAME || 'ECA Aveugles'}`,
                html: emailHtml,
            });

            console.log(`Password reset email sent to ${targetUser.email}, result:`, emailResult);
        } catch (emailError) {
            console.error('Error sending password reset email:', emailError);
            if (emailError instanceof Error) {
                console.error('Error message:', emailError.message);
                console.error('Error stack:', emailError.stack);
            }
            // Password was changed but email failed
            return NextResponse.json(
                { message: 'Le mot de passe a été réinitialisé mais l\'envoi de l\'email a échoué. Veuillez contacter l\'utilisateur directement.' },
                { status: 207 } // Multi-Status
            );
        }

        return NextResponse.json(
            {
                message: 'Mot de passe réinitialisé avec succès. Un email a été envoyé à l\'utilisateur.',
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Error resetting password:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        return NextResponse.json(
            { message: 'Erreur lors de la réinitialisation du mot de passe' },
            { status: 500 }
        );
    }
}