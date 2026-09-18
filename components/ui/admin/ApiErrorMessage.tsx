'use client';

import React from 'react';
import type { toast } from '@/hooks/use-toast';
import { parisDateTimeDisplay } from '@/lib/paris-day';
import { TECH_CONTACT_EMAIL, toUserFacingError, type UserFacingError } from '@/lib/user-error';

/**
 * Le corps d'un message d'erreur : la phrase, puis — quand la cause est
 * inconnue — à qui écrire et quoi citer. Même rendu dans un toast et dans le
 * cadre rouge d'une fenêtre (DeleteBookModal), pour que le permanent reconnaisse
 * « ce n'est pas moi, il faut prévenir » d'un coup d'œil.
 *
 * Le lien prépare le courriel : action, page, heure, message et référence — ce
 * qu'il faut pour retrouver la trace dans les journaux sans un aller-retour de
 * questions. Rien de personnel n'y est ajouté au-delà de ce que la page affiche.
 */
export function ApiErrorMessage({
    error,
    action,
    className,
}: {
    error: UserFacingError;
    /** « Supprimer le livre #4641 » — ce que faisait le permanent, pour le courriel. */
    action?: string;
    className?: string;
}) {
    const needsContact = error.kind !== 'known';
    return (
        <span className={className}>
            <span className="block">{error.message}</span>
            {needsContact && (
                <span className="block mt-2">
                    {error.kind === 'unexpected'
                        ? 'La cause de cette erreur est inconnue. Écrivez à '
                        : 'Si le problème persiste, écrivez à '}
                    <a
                        href={mailtoFor(error, action)}
                        className="font-semibold underline underline-offset-2"
                    >
                        {TECH_CONTACT_EMAIL}
                    </a>{' '}
                    en expliquant ce que vous faisiez
                    {error.ref ? (
                        <>
                            {' '}
                            et en citant la référence{' '}
                            <span className="font-mono font-semibold select-all">{error.ref}</span>
                        </>
                    ) : null}
                    .
                </span>
            )}
        </span>
    );
}

function mailtoFor(error: UserFacingError, action?: string): string {
    const page =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    const lines = [
        'Bonjour,',
        '',
        'Voici ce que je faisais : ',
        '',
        '— Détails techniques —',
        ...(action ? [`Action : ${action}`] : []),
        ...(page ? [`Page : ${page}`] : []),
        `Heure : ${parisDateTimeDisplay(new Date())}`,
        ...(error.ref ? [`Référence : ${error.ref}`] : []),
        ...(error.status ? [`Code HTTP : ${error.status}`] : []),
        `Message : ${error.message}`,
        ...(error.detail ? [`Détail technique : ${error.detail}`] : []),
    ];
    const subject = `Erreur portail ECA${error.ref ? ` — ${error.ref}` : ''}`;
    return (
        `mailto:${TECH_CONTACT_EMAIL}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(lines.join('\n'))}`
    );
}

/**
 * Les props d'un toast d'erreur, au style des fenêtres audio et livre.
 *
 * Une erreur inconnue reste affichée jusqu'à ce qu'on la ferme : on y lit une
 * référence à recopier, et elle ne doit pas s'effacer pendant qu'on cherche un
 * crayon. Une erreur connue reste 15 s — ces phrases disent quoi faire, et
 * sont souvent longues.
 */
export function apiErrorToast(
    err: unknown,
    opts: { title?: string; action?: string } = {},
): Parameters<typeof toast>[0] {
    const error = toUserFacingError(err);
    // Le titre de l'appelant (« Suppression impossible ») décrit un refus ; une
    // cause inconnue ou une coupure doit se reconnaître dès le titre.
    const title =
        error.kind === 'unexpected'
            ? 'Erreur inattendue'
            : error.kind === 'network'
              ? 'Connexion interrompue'
              : (opts.title ?? 'Erreur');
    return {
        variant: 'destructive',
        duration: error.kind === 'known' ? 15_000 : Infinity,
        // Le type du toast croise `title` avec l'attribut HTML (string) : même
        // contournement que les `@ts-expect-error jsx in toast` des appelants.
        title: (<span className="text-2xl font-bold">{title}</span>) as unknown as string,
        description: (
            <ApiErrorMessage error={error} action={opts.action} className="block text-xl mt-2" />
        ),
        className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
    };
}
