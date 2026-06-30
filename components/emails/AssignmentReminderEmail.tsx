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

export type ReminderVariant =
    | 'assigned'            // first reader, pending send (ATTENTE)
    | 'reassigned_pending' // reassignment while ATTENTE (book never sent)
    | 'reassigned_active'  // reassignment while EN_COURS (book mid-reading)
    | 'sent';              // ATTENTE -> EN_COURS transition (shipped)

interface AssignmentReminderEmailProps {
    name: string;
    bookTitle: string;
    bookAuthor?: string | null;
    assignmentId?: number;
    /** Pre-formatted (fr-FR) date. assignedDate for (re)assignment, sentToReaderDate for 'sent'. */
    displayDate?: string | null;
    appName?: string;
    /** Absolute https URL to the banner, e.g. `${APP_URL}/eca_logo.png`. */
    logoUrl?: string | null;
    variant?: ReminderVariant;
    /** Branches wording only (pickup vs shipping). Null/NON_APPLICABLE keep the default shipping text. */
    deliveryMethod?: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
}

export const AssignmentReminderEmail = ({
                                            name = '',
                                            bookTitle,
                                            bookAuthor,
                                            assignmentId,
                                            displayDate,
                                            appName = 'ECA-Aveugles',
                                            logoUrl,
                                            variant = 'assigned',
                                            deliveryMethod = null,
                                        }: AssignmentReminderEmailProps) => {
    const displayName = name || 'cher lecteur';

    const heading =
        variant === 'sent' ? (deliveryMethod === 'RETRAIT' ? 'Votre lecture est disponible' : 'Votre lecture a été envoyée')
            : variant === 'assigned' ? 'Nouvelle lecture assignée'
                : 'Lecture réassignée';

    const preview =
        variant === 'sent' ? (deliveryMethod === 'RETRAIT' ? `Votre lecture est disponible au retrait : ${bookTitle}` : `Votre lecture a été envoyée : ${bookTitle}`)
            : variant === 'assigned' ? `Une lecture vous a été assignée : ${bookTitle}`
                : `Une lecture vous a été réassignée : ${bookTitle}`;

    // Wording branches on delivery method. ENVOI and null/NON_APPLICABLE keep
    // the original shipping text verbatim; RETRAIT swaps to pickup phrasing.
    const isPickup = deliveryMethod === 'RETRAIT';

    const intro = isPickup
        ? (variant === 'sent'
            ? (displayDate
                ? `L'ouvrage qui vous a été confié est disponible au retrait auprès de l'ECA depuis le ${displayDate}. Vous pouvez désormais en commencer l'enregistrement.`
                : "L'ouvrage qui vous a été confié est disponible au retrait auprès de l'ECA. Vous pouvez désormais en commencer l'enregistrement.")
            : variant === 'reassigned_active'
                ? "Une lecture en cours vous a été réassignée afin que vous puissiez en terminer l'enregistrement. L'ouvrage sera mis à votre disposition pour retrait auprès de l'ECA."
                : variant === 'reassigned_pending'
                    ? "Une lecture vous a été réassignée. Vous pourrez retirer l'ouvrage auprès de l'ECA : vous recevrez un message vous confirmant sa mise à disposition."
                    : "Une nouvelle lecture vous a été assignée. Vous pourrez retirer l'ouvrage auprès de l'ECA : vous recevrez un message vous confirmant sa mise à disposition.")
        : (variant === 'sent'
            ? (displayDate
                ? `L'ouvrage qui vous a été confié vous a été expédié le ${displayDate}. Vous pouvez désormais en commencer l'enregistrement.`
                : "L'ouvrage qui vous a été confié vous a été expédié. Vous pouvez désormais en commencer l'enregistrement.")
            : variant === 'reassigned_active'
                ? "Une lecture en cours vous a été réassignée afin que vous puissiez en terminer l'enregistrement. L'ECA ou le lecteur précédent vous fera parvenir l'ouvrage dans les meilleurs délais."
                : variant === 'reassigned_pending'
                    ? "Une lecture vous a été réassignée. L'ouvrage ne vous a pas encore été envoyé : vous recevrez un message vous le confirmant dès son expédition."
                    : "Une nouvelle lecture vous a été assignée. L'ouvrage ne vous a pas encore été envoyé : vous recevrez un message vous le confirmant dès son expédition.");

    const closing = isPickup
        ? (variant === 'sent'
            ? "Merci pour votre engagement."
            : variant === 'reassigned_active'
                ? "L'enregistrement pourra commencer dès le retrait de l'ouvrage. Merci pour votre engagement."
                : "Nous vous préviendrons dès que l'ouvrage sera disponible au retrait. Merci pour votre engagement.")
        : (variant === 'sent'
            ? "Merci pour votre engagement."
            : variant === 'reassigned_active'
                ? "L'enregistrement pourra commencer dès réception de l'ouvrage. Merci pour votre engagement."
                : "Nous vous préviendrons dès l'envoi de l'ouvrage. Merci pour votre engagement.");

    const dateLabel =
        variant === 'sent' ? (deliveryMethod === 'RETRAIT' ? 'Date de mise à disposition' : "Date d'envoi")
            : variant === 'assigned' ? "Date d'assignation"
                : "Date de réattribution";

    return (
        <Html>
            <Head />
            <Preview>{preview}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {logoUrl ? (
                        <Section style={logoSection}>
                            <Img src={logoUrl} alt={appName} width="200" style={logo} />
                        </Section>
                    ) : null}

                    <Heading style={h1}>{heading}</Heading>

                    <Text style={text}>Bonjour {displayName},</Text>

                    <Text style={text}>{intro}</Text>

                    <Section style={detailsSection}>
                        <Text style={detailsItem}><strong>Titre :</strong> {bookTitle}</Text>
                        {bookAuthor ? (
                            <Text style={detailsItem}><strong>Auteur :</strong> {bookAuthor}</Text>
                        ) : null}
                        {assignmentId ? (
                            <Text style={detailsItem}><strong>Référence d&apos;attribution :</strong> #{assignmentId}</Text>
                        ) : null}
                        {displayDate ? (
                            <Text style={detailsItem}><strong>{dateLabel} :</strong> {displayDate}</Text>
                        ) : null}
                    </Section>

                    <Text style={text}>{closing}</Text>

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

                    <Text style={footer}>
                        Si vous pensez avoir reçu ce message par erreur, veuillez contacter l&apos;équipe ECA.
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

const detailsSection = {
    backgroundColor: '#f6f9fc',
    borderRadius: '6px',
    padding: '20px',
    margin: '24px 0',
};

const detailsItem = {
    color: '#525f7f',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '8px 0',
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

export default AssignmentReminderEmail;