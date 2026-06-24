import * as React from 'react';
import { Hr, Link, Section, Text } from '@react-email/components';

interface EmailFooterProps {
    /** Closing note shown under the contact block. Defaults to the generic one. */
    note?: string;
}

const DEFAULT_NOTE =
    "Si vous pensez avoir reçu ce message par erreur, veuillez contacter l'équipe ECA.";

/**
 * Shared footer for all ECA emails: contact details + a closing note.
 * ECA's address/phones/hours live here and nowhere else — change them once.
 * Drop <EmailFooter /> at the end of a template's <Container>; it includes its
 * own leading <Hr>, so no separator is needed before it.
 */
export const EmailFooter = ({ note = DEFAULT_NOTE }: EmailFooterProps) => (
    <>
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
            <Text style={contactItem}>
                <strong>Métro :</strong> Duroc (lignes 10, 13), Ségur (ligne 10), Sèvres-Lecourbe (ligne 6)
            </Text>
            <Text style={contactItem}>
                <strong>Autobus :</strong> lignes 28, 70, 82, 89, 92
            </Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>{note}</Text>
    </>
);

export default EmailFooter;

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