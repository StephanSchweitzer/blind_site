import React from 'react';
import type { RecordingAdvice } from '@/lib/orders/recordingAdvice';

/**
 * Les mises en garde « enregistrement », au seul endroit où elles s'écrivent.
 *
 * Le composant ne sait pas décider s'il a le droit de parler et n'a pas à le
 * savoir : il rend ce qu'on lui donne, et `null` ne rend rien. La décision est
 * prise en amont par `useRecordingAdvice`, qui ne fabrique un avis que pendant
 * qu'une décision d'enregistrement est en train d'être prise
 * (`lib/orders/recordingAdvice.ts`). Un formulaire de modification ouvert sur
 * une demande d'enregistrement existante reçoit donc `null` — c'est la demande
 * d'origine, elle n'a pas à être mise en garde contre elle-même.
 */
export function RecordingAdviceNotice({
    advice,
    className = '',
}: {
    advice: RecordingAdvice | null;
    className?: string;
}) {
    if (!advice) return null;

    const cls = `text-sm text-amber-700 dark:text-amber-400 ${className}`.trim();

    return (
        <>
            {advice.audioAlreadyExists && (
                <p className={cls}>
                    Attention : un enregistrement audio existe déjà pour cet ouvrage.
                    Vérifiez qu&apos;un nouvel enregistrement est réellement nécessaire
                    avant de poursuivre — il s&apos;agit peut-être plutôt d&apos;une duplication.
                </p>
            )}
            {advice.activeRecordingCount > 0 && (
                <p className={cls}>
                    Il existe déjà {advice.activeRecordingCount === 1
                        ? 'une demande d’enregistrement active'
                        : `${advice.activeRecordingCount} demandes d’enregistrement actives`}{' '}
                    pour cet ouvrage
                    {advice.otherAuditeurName ? ` (ex. ${advice.otherAuditeurName})` : ''}.
                    Êtes-vous sûr de vouloir en créer une nouvelle&nbsp;?
                </p>
            )}
        </>
    );
}

/**
 * Le texte du confirm à l'enregistrement, pour que les deux formulaires disent
 * la même chose que l'avis affiché juste au-dessus de la case. Les titres sont
 * cités quand on en a (création multi-lignes) ; sinon on parle « de cet
 * ouvrage », le formulaire n'en montrant qu'un.
 */
export function recordingConflictConfirmText(
    conflicts: { activeRecordingCount: number; otherAuditeurName: string | null }[],
    bookTitles: string[],
): string {
    const titles = bookTitles.filter(Boolean);
    if (titles.length > 0) {
        return (
            `Une demande d’enregistrement active existe déjà pour : ${titles.join(', ')}.\n\n` +
            `Voulez-vous vraiment créer ${titles.length > 1 ? 'ces nouvelles demandes' : 'cette nouvelle demande'} d’enregistrement ?`
        );
    }
    const count = conflicts[0]?.activeRecordingCount ?? 1;
    const who = conflicts[0]?.otherAuditeurName;
    return (
        `Il existe déjà ${count === 1
            ? 'une demande d’enregistrement active'
            : `${count} demandes d’enregistrement actives`} pour cet ouvrage${who ? ` (ex. ${who})` : ''}.\n\n` +
        `Voulez-vous vraiment créer une nouvelle demande d’enregistrement pour ce livre ?`
    );
}
