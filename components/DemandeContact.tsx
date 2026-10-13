import { PhoneLines } from '@/components/PhoneLines';

/**
 * La fin de phrase qui dit où faire sa demande — « 01 88 32 31 47 ou
 * 01 88 32 31 48 ou par courriel à … » — sur le catalogue et les listes de
 * livres.
 *
 * Lue dans les coordonnées éditées au back-office (SiteContact), comme
 * l'accueil, la page Contact et la page Accessibilité. Écrite en dur, elle
 * existait en deux copies qu'un changement de numéro n'aurait pas suivies, et
 * s'écrivait autrement que sur la page Contact.
 *
 * Chaque numéro en entier et en lien tel: : « ou 48 », lu à voix haute ou
 * touché, ne mène nulle part.
 */
export function DemandeContact({ phones, email }: { phones: string; email: string }) {
    return (
        <span className="[&_a]:font-semibold">
            <PhoneLines text={phones.split('\n').filter(Boolean).join(' ou ')} />{' '}
            ou par courriel à{' '}
            <a
                href={`mailto:${email}`}
                className="whitespace-nowrap text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 underline underline-offset-2"
            >
                {email}
            </a>
        </span>
    );
}
