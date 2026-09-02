import * as React from 'react';
import {
    Html,
    Body,
    Head,
    Heading,
    Button,
    Container,
    Img,
    Preview,
    Section,
    Text
} from '@react-email/components';
import EmailFooter from './EmailFooter';

interface PasswordResetRequestEmailProps {
    name: string;
    email: string;
    resetUrl: string;
    expiresInMinutes: number;
    appName?: string;
    logoUrl?: string | null;
}

/**
 * Sent when someone asks for a reset link from the sign-in page.
 *
 * Distinct from PasswordResetEmail, which carries a temporary password an
 * administrator has already set. Here nothing has changed yet — so the email
 * says so plainly, and tells a recipient who didn't ask that ignoring it is
 * enough.
 */
export const PasswordResetRequestEmail = ({
                                              name = '',
                                              email,
                                              resetUrl,
                                              expiresInMinutes = 30,
                                              appName = 'ECA-Aveugles',
                                              logoUrl
                                          }: PasswordResetRequestEmailProps) => {
    const displayName = name || 'chère personne';

    return (
        <Html>
            <Head />
            <Preview>Réinitialisez votre mot de passe {appName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {logoUrl ? (
                        <Section style={logoSection}>
                            <Img src={logoUrl} alt={appName} width="200" style={logo} />
                        </Section>
                    ) : null}

                    <Heading style={h1}>Réinitialisation de votre mot de passe</Heading>

                    <Text style={text}>Bonjour {displayName},</Text>

                    <Text style={text}>
                        Nous avons reçu une demande de réinitialisation du mot de passe associé
                        au compte <strong>{email}</strong> aux ECA. Cliquez sur le bouton
                        ci-dessous pour choisir un nouveau mot de passe.
                    </Text>

                    <Section style={buttonSection}>
                        <Button href={resetUrl} style={button}>
                            Choisir un nouveau mot de passe
                        </Button>
                    </Section>

                    <Text style={mutedText}>
                        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                    </Text>
                    <Text style={urlText}>{resetUrl}</Text>

                    <Section style={warningSection}>
                        <Text style={warningText}>
                            ⏱️ <strong>Ce lien expire dans {expiresInMinutes} minutes</strong> et
                            ne peut être utilisé qu&apos;une seule fois. Passé ce délai, demandez-en
                            un nouveau depuis la page de connexion.
                        </Text>
                    </Section>

                    <Text style={text}>
                        <strong>Vous n&apos;avez pas fait cette demande ?</strong> Vous pouvez
                        ignorer cet email : votre mot de passe reste inchangé et personne ne peut
                        accéder à votre compte tant que ce lien n&apos;est pas utilisé.
                    </Text>

                    <EmailFooter note="Si vous recevez ce message à répétition sans l'avoir demandé, prévenez l'équipe ECA." />
                </Container>
            </Body>
        </Html>
    );
};

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '20px 0'
};

const container = {
    backgroundColor: '#ffffff',
    border: '1px solid #e6ebf1',
    borderRadius: '6px',
    margin: '0 auto',
    padding: '40px',
    maxWidth: '600px'
};

const logoSection = {
    textAlign: 'center' as const,
    margin: '0 0 24px'
};

const logo = {
    margin: '0 auto'
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '32px',
    margin: '0 0 24px'
};

const text = {
    color: '#525f7f',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '12px 0'
};

const mutedText = {
    color: '#8898aa',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '24px 0 4px'
};

const urlText = {
    color: '#8898aa',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 12px',
    wordBreak: 'break-all' as const
};

const buttonSection = {
    textAlign: 'center' as const,
    margin: '32px 0'
};

const button = {
    backgroundColor: '#2563eb',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '600',
    padding: '12px 24px',
    textDecoration: 'none'
};

const warningSection = {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '6px',
    padding: '16px',
    margin: '24px 0'
};

const warningText = {
    color: '#856404',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0'
};

export default PasswordResetRequestEmail;
