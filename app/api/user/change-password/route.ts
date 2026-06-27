// app/api/user/change-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { render } from '@react-email/render';
import PasswordChangedEmail from '@/components/emails/PasswordChangedEmail';
import { sendEmail } from '@/lib/email/sendEmail';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user?.email) {
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { message: 'Les mots de passe actuels et nouveaux sont requis' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, password: true, email: true, name: true, firstName: true },
        });

        if (!user || !user.password) {
            return NextResponse.json(
                { message: 'Personne non trouvée ou mot de passe non défini' },
                { status: 404 }
            );
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return NextResponse.json(
                { message: 'Mot de passe actuel incorrect' },
                { status: 400 }
            );
        }

        if (newPassword.length < 8) {
            return NextResponse.json(
                { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' },
                { status: 400 }
            );
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedNewPassword,
                passwordNeedsChange: false,
            },
        });

        // Best-effort security notification. The change has already succeeded, so a
        // failed/undeliverable email must NOT fail the request — log and continue.
        try {
            const appName = process.env.APP_NAME || 'ECA Aveugles';
            const baseUrl = process.env.APP_URL || 'https://eca-aveugles.com';
            const html = await render(
                PasswordChangedEmail({
                    name: user.name || user.firstName || '',
                    appName,
                    changedAt: new Date().toLocaleString('fr-FR'),
                    logoUrl: `${baseUrl}/eca_logo.png`,
                })
            );
            const result = await sendEmail({
                to: user.email,
                subject: `Votre mot de passe a été modifié - ${appName}`,
                html,
                tag: 'password-changed',
            });
            if (!result.sent) {
                console.warn(`Password-changed confirmation not sent (user ${user.id}): ${result.reason}`);
            }
        } catch (emailError) {
            console.error('Error sending password-changed confirmation:', emailError);
        }

        return NextResponse.json({
            message: 'Mot de passe changé avec succès',
        });
    } catch (error) {
        console.error('Erreur lors du changement de mot de passe:', error);
        return NextResponse.json(
            { message: 'Erreur lors du changement de mot de passe' },
            { status: 500 }
        );
    }
}