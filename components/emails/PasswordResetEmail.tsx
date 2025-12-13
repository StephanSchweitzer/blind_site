import * as React from 'react';
import {
    Html,
    Body,
    Head,
    Heading,
    Hr,
    Container,
    Preview,
    Section,
    Text
} from '@react-email/components';

interface PasswordResetEmailProps {
    name: string;
    email: string;
    temporaryPassword: string;
    appName?: string;
    loginUrl?: string;
}

export const PasswordResetEmail = ({
                                       name = '',
                                       email,
                                       temporaryPassword,
                                       appName = 'ECA-Aveugles',
                                       loginUrl = 'https://eca-aveugles.fr/admin'
                                   }: PasswordResetEmailProps) => {
    const displayName = name || 'cher utilisateur';

    return (
        <Html>
            <Head />
            <Preview>Votre nouveau mot de passe pour {appName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Réinitialisation de mot de passe</Heading>

                    <Text style={text}>Bonjour {displayName},</Text>

                    <Text style={text}>
                        Votre mot de passe a été réinitialisé par un administrateur. Voici vos nouvelles informations de connexion :
                    </Text>

                    <Section style={detailsSection}>
                        <Text style={detailsItem}><strong>Email :</strong> {email}</Text>
                        <Text style={detailsItem}><strong>Nouveau mot de passe temporaire :</strong> {temporaryPassword}</Text>
                    </Section>

                    <Section style={warningSection}>
                        <Text style={warningText}>
                            ⚠️ <strong>Important :</strong> Vous devrez changer ce mot de passe lors de votre prochaine connexion.
                        </Text>
                    </Section>

                    <Text style={text}>
                        Veuillez <a href={loginUrl} style={link}>vous connecter à votre compte</a> avec ce nouveau mot de passe, puis changez-le immédiatement pour un mot de passe de votre choix.
                    </Text>

                    <Hr style={hr} />

                    <Text style={footer}>
                        Si vous n&apos;avez pas demandé cette réinitialisation, veuillez contacter immédiatement le support.
                    </Text>
                </Container>
            </Body>
        </Html>
    );
};

// Styles
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

const detailsSection = {
    backgroundColor: '#f6f9fc',
    borderRadius: '6px',
    padding: '20px',
    margin: '24px 0'
};

const detailsItem = {
    color: '#525f7f',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '8px 0'
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

const link = {
    color: '#0070f3',
    textDecoration: 'underline'
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '24px 0'
};

const footer = {
    color: '#8898aa',
    fontSize: '14px',
    lineHeight: '22px'
};

export default PasswordResetEmail;