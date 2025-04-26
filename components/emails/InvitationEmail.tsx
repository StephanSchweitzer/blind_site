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

interface InvitationEmailProps {
    name: string;
    email: string;
    role: string;
    temporaryPassword: string;
    appName?: string;
    loginUrl?: string;
}

export const InvitationEmail = ({
                                    name = '',
                                    email,
                                    role,
                                    temporaryPassword,
                                    appName = 'Votre Application',
                                    loginUrl = 'https://votredomaine.com/login'
                                }: InvitationEmailProps) => {
    const displayName = name || 'cher utilisateur';

    return (
        <Html>
            <Head />
            <Preview>Votre invitation pour {appName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Bienvenue sur {appName} !</Heading>

                    <Text style={text}>Bonjour {displayName},</Text>

                    <Text style={text}>
                        Vous avez été invité(e) à rejoindre {appName} en tant que {role}. Un compte a été créé pour vous avec les détails suivants :
                    </Text>

                    <Section style={detailsSection}>
                        <Text style={detailsItem}><strong>Email :</strong> {email}</Text>
                        <Text style={detailsItem}><strong>Rôle :</strong> {role}</Text>
                        <Text style={detailsItem}><strong>Mot de passe temporaire :</strong> {temporaryPassword}</Text>
                    </Section>

                    <Text style={text}>
                        Veuillez <a href={loginUrl} style={link}>vous connecter à votre compte</a> et changer votre mot de passe dès que possible.
                    </Text>

                    <Hr style={hr} />

                    <Text style={footer}>
                        Si vous n&apos;attendiez pas cette invitation, veuillez ignorer cet email ou contacter le support.
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

export default InvitationEmail;