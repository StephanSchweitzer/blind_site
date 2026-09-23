import type React from 'react';

/**
 * Numéros français (« +33 1 88 32 31 47 », « 01.88.32.31.47 ») : le champ est
 * du texte libre édité dans le back-office, un libellé peut précéder le numéro.
 */
const PHONE_PATTERN = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/g;

function telHref(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, '');
    return `tel:${digits.startsWith('0') ? `+33${digits.slice(1)}` : digits}`;
}

/**
 * Les lignes d'un champ de texte libre, chaque numéro de téléphone en lien
 * tel:. Beaucoup de nos visiteurs sont aveugles : appeler leur est souvent
 * plus simple qu'écrire, et sur un téléphone le lien compose le numéro d'un
 * geste au lieu de le faire recopier à l'oreille.
 */
export function PhoneLines({ text }: { text: string }) {
    return (
        <>
            {text.split('\n').map((line, i, arr) => {
                const parts: React.ReactNode[] = [];
                let last = 0;
                for (const match of line.matchAll(PHONE_PATTERN)) {
                    parts.push(line.slice(last, match.index));
                    parts.push(
                        <a
                            key={match.index}
                            href={telHref(match[0])}
                            className="text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 underline underline-offset-2"
                        >
                            {match[0]}
                        </a>,
                    );
                    last = match.index + match[0].length;
                }
                parts.push(line.slice(last));
                return (
                    <span key={i}>
                        {parts}
                        {i < arr.length - 1 && <br />}
                    </span>
                );
            })}
        </>
    );
}
