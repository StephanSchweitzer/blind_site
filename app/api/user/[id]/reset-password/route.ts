// app/api/user/[id]/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { render } from '@react-email/render';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import { sendEmail, isSendableEmail } from '@/lib/email/sendEmail';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const userId = parseInt(resolvedParams.id);

        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        }

        const currentUser = await prisma.user.findUnique({
            where: { email: session.user?.email as string },
        });

        if (!currentUser || currentUser.accessLevel !== 'super_admin') {
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent réinitialiser les mots de passe.' },
                { status: 403 }
            );
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!targetUser) {
            return NextResponse.json({ message: 'Utilisateur non trouvé' }, { status: 404 });
        }

        if (targetUser.accessLevel !== 'admin' && targetUser.accessLevel !== 'super_admin') {
            return NextResponse.json(
                { message: 'La réinitialisation de mot de passe est uniquement disponible pour les lecteurs et administrateurs' },
                { status: 400 }
            );
        }

        // Validate BEFORE resetting: never lock a user out with a password we can't
        // deliver to an invalid/missing address.
        if (!isSendableEmail(targetUser.email)) {
            return NextResponse.json(
                { message: 'Cette personne n\'a pas d\'adresse email valide' },
                { status: 400 }
            );
        }

        const temporaryPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                passwordNeedsChange: true,
            },
        });

        const appName = process.env.APP_NAME || 'ECA Aveugles';
        const baseUrl = process.env.APP_URL;
        const html = await render(
            PasswordResetEmail({
                name: targetUser.name || targetUser.firstName || '',
                email: targetUser.email!,
                temporaryPassword,
                appName,
                loginUrl: baseUrl ? `${baseUrl}/admin` : undefined,
                logoUrl: baseUrl ? `${baseUrl}/eca_logo.png` : undefined,
            })
        );

        const result = await sendEmail({
            to: targetUser.email,
            subject: `Réinitialisation de votre mot de passe - ${appName}`,
            html,
            tag: 'password-reset',
        });

        if (!result.sent) {
            console.warn(`Password-reset email not sent (user ${userId}): ${result.reason}`);
            return NextResponse.json(
                { message: 'Le mot de passe a été réinitialisé mais l\'envoi de l\'email a échoué. Veuillez contacter l\'utilisateur directement.' },
                { status: 207 }
            );
        }

        return NextResponse.json(
            { message: 'Mot de passe réinitialisé avec succès. Un email a été envoyé à l\'utilisateur.' },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error resetting password:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la réinitialisation du mot de passe' },
            { status: 500 }
        );
    }
}