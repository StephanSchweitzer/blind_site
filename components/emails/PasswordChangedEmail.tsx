import * as React from 'react';
import {
    Html,
    Body,
    Head,
    Heading,
    Hr,
    Container,
    Img,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';

interface PasswordChangedEmailProps {
    name?: string;
    appName?: string;
    /** Pre-formatted (fr-FR) date/time of the change. */
    changedAt?: string | null;
    logoUrl?: string | null;
}

export const PasswordChangedEmail = ({
                                         name = '',
                                         appName = 'ECA-Aveugles',
                                         changedAt,
                                         logoUrl,
                                     }: PasswordChangedEmailProps) => {
    const displayName = name || 'cher utilisateur';

    return (
        <Html>
            <Head />
            <Preview>Votre mot de passe {appName} a été modifié</Preview>
            <Body style={main}>
                <Container style={container}>
                    {logoUrl ? (
                        <Section style={logoSection}>
                            <Img src={logoUrl} alt={appName} width="200" style={logo} />
                        </Section>
                    ) : null}

                    <Heading style={h1}>Mot de passe modifié</Heading>

                    <Text style={text}>Bonjour {displayName},</Text>

                    <Text style={text}>
                        Nous vous confirmons que le mot de passe de votre compte {appName} a bien été modifié
                        {changedAt ? ` le ${changedAt}` : ''}. Aucune action n&apos;est requise de votre part.
                    </Text>

                    <Section style={warningSection}>
                        <Text style={warningText}>
                            ⚠️ <strong>Vous n&apos;êtes pas à l&apos;origine de ce changement ?</strong> Contactez l&apos;équipe ECA
                            immédiatement (coordonnées ci-dessous) afin que nous puissions sécuriser votre compte.
                        </Text>
                    </Section>

                    <Hr style={hr} />

                    <Section style={contactSection}>
                        <Text style={contactHeading}>Nous contacter</Text>
                        <Text style={contactItem}>
                            <strong>Adresse :</strong> 71, avenue de Breteuil, 75015 Paris
                        </Text>
                        <Text style={contactItem}>
                            <strong>Téléphone :</strong>{' '}
                            <Link href="tel:+33188323147" style={contactLink}>+33 1 88 32 31 47</Link>
                            {' / '}
                            <Link href="tel:+33188323148" style={contactLink}>+33 1 88 32 31 48</Link>
                        </Text>
                        <Text style={contactItem}>
                            <strong>Email :</strong>{' '}
                            <Link href="mailto:ecapermanence@gmail.com" style={contactLink}>ecapermanence@gmail.com</Link>
                        </Text>
                        <Text style={contactItem}>
                            <strong>Permanences :</strong> mardi 9h – 17h, jeudi 9h – 14h
                        </Text>
                    </Section>

                    <Hr style={hr} />

                    <Text style={footer}>
                        Cet email de sécurité vous a été envoyé automatiquement à la suite d&apos;un changement de mot de passe.
                    </Text>
                </Container>
            </Body>
        </Html>
    );
};

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '20px 0',
};

const container = {
    backgroundColor: '#ffffff',
    border: '1px solid #e6ebf1',
    borderRadius: '6px',
    margin: '0 auto',
    padding: '40px',
    maxWidth: '600px',
};

const logoSection = {
    textAlign: 'center' as const,
    margin: '0 0 24px',
};

const logo = {
    margin: '0 auto',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '32px',
    margin: '0 0 24px',
};

const text = {
    color: '#525f7f',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '12px 0',
};

const warningSection = {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '6px',
    padding: '16px',
    margin: '24px 0',
};

const warningText = {
    color: '#856404',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0',
};

const contactSection = {
    margin: '16px 0',
};

const contactHeading = {
    color: '#333',
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '24px',
    margin: '0 0 12px',
};

const contactItem = {
    color: '#525f7f',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '4px 0',
};

const contactLink = {
    color: '#2563eb',
    textDecoration: 'none',
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '24px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '14px',
    lineHeight: '22px',
};

export default PasswordChangedEmail;