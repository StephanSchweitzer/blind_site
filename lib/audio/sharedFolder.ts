import 'server-only';

import { prisma } from '@/lib/prisma';
import { resolvePrefix } from './state';
import { TECH_CONTACT_EMAIL } from '@/lib/user-error';

/**
 * Les autres livres qui pointent sur le MÊME dossier audio.
 *
 * L'import Access a laissé des fiches en double qui partagent un seul
 * `audio_filepath` — plusieurs dizaines de dossiers, certains revendiqués par
 * trois fiches. Rien dans le stockage ne le signale : les routes de suppression
 * listent un préfixe et ne voient que des objets. Une suppression faite depuis
 * une fiche vidait donc le dossier de son jumeau, silencieusement, alors que
 * l'enregistrement est souvent la seule copie qui existe — et l'état audio en
 * cache du jumeau (`audioLinkStatus`, `audioTrackCount`) continuait d'annoncer
 * des pistes disparues, puisque refreshBookAudioState ne rafraîchit que le
 * livre sur lequel on a agi.
 *
 * Le rattachement d'un dossier orphelin refuse déjà ce partage
 * (app/admin/audio-orphelins/actions.ts) : « un dossier ne peut appartenir qu'à
 * un seul livre ». Ce helper porte la même règle du côté des suppressions, pour
 * que la réponse soit un refus nommant le jumeau plutôt qu'une perte muette.
 *
 * Le partage se lit sur la chaîne stockée, pas sur le bucket : c'est une
 * question de fiches, et la question se pose même quand le dossier est vide.
 * Les deux écritures du chemin existent dans le corpus (avec et sans « / »
 * final), donc les deux variantes sont comparées.
 */
export interface FolderSharingBook {
    id: number;
    title: string;
}

export async function booksSharingAudioFolder(
    bookId: number,
    audioFilepath: string | null | undefined,
): Promise<FolderSharingBook[]> {
    const prefix = resolvePrefix(audioFilepath);
    if (!prefix) return [];

    return prisma.book.findMany({
        where: {
            id: { not: bookId },
            audio_filepath: { in: [prefix, prefix.slice(0, -1)] },
        },
        select: { id: true, title: true },
        orderBy: { id: 'asc' },
    });
}

/** « « Titre » (#12) » — et « … » (#12) et « … » (#13) » au pluriel. */
export function describeSharingBooks(books: FolderSharingBook[]): string {
    const parts = books.map((b) => `« ${b.title} » (#${b.id})`);
    if (parts.length <= 1) return parts.join('');
    return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

/**
 * Le refus d'une suppression de PISTES, formulé une fois. `action` complète
 * « Impossible de … ».
 *
 * La phrase doit finir sur un geste que le permanent peut réellement faire.
 * Elle renvoyait à « la fusion depuis Doublons » et à « détacher le dossier de
 * l'autre fiche » : la première ne trouve que les paires que l'import a
 * signalées (`needsReview`), et aucun écran ne permet la seconde — un permanent
 * s'est retrouvé devant deux portes fermées. Le geste qui marche toujours pour
 * deux fiches du même ouvrage est de supprimer celle en trop en laissant le
 * dossier (voir bookDeletionSharedNotice) ; le reste — deux ouvrages distincts
 * sur un même dossier — est une réparation à la main, d'où l'adresse.
 */
export function sharedFolderRefusal(books: FolderSharingBook[], action: string): string {
    const plural = books.length > 1;
    return (
        `Impossible de ${action} : ce dossier audio est aussi celui de ` +
        `${describeSharingBooks(books)}. Un dossier ne peut appartenir qu'à un seul livre — ` +
        `supprimer ici viderait aussi ${plural ? 'ces fiches' : 'cette fiche'}. ` +
        `Si les fiches décrivent le même livre, supprimez celle qui est en trop en choisissant ` +
        `« Laisser le dossier dans le stockage » : l'enregistrement restera à l'autre. ` +
        `Sinon, écrivez à ${TECH_CONTACT_EMAIL} pour faire séparer les dossiers.`
    );
}

/**
 * Supprimer une fiche dont le dossier est partagé : possible, mais seulement en
 * le laissant en place.
 *
 * La suppression d'un livre est une suppression douce (`deletedAt`) : « laisser
 * le dossier » ne copie ni ne retire rien du stockage, et la fiche masquée
 * disparaît de booksSharingAudioFolder (lib/prisma.ts filtre `deletedAt`) — le
 * jumeau reste seul propriétaire, intact. C'est donc le moyen de régler un
 * doublon. Le transfert (le jumeau partagerait alors avec la destination) et la
 * corbeille (qui vide le dossier du jumeau) restent refusés.
 *
 * Ce refus bloquait auparavant la suppression entière, héritage du temps où
 * supprimer une fiche vidait son dossier : la seule option sans danger était
 * justement celle qu'il interdisait.
 */
export function bookDeletionSharedNotice(books: FolderSharingBook[]): string {
    const plural = books.length > 1;
    return (
        `Ce dossier audio est aussi celui de ${describeSharingBooks(books)}. Il ne peut donc ` +
        `qu'être laissé en place : le transférer ou l'envoyer à la corbeille le retirerait aussi ` +
        `à ${plural ? 'ces fiches' : 'cette fiche'}. Supprimer cette fiche-ci ne touche pas à ` +
        `l'enregistrement, que ${plural ? 'les autres fiches gardent' : "l'autre fiche garde"}.`
    );
}

/** Le refus serveur quand un appelant demande quand même transfert ou corbeille. */
export function bookDeletionSharedRefusal(
    books: FolderSharingBook[],
    mode: 'transfer' | 'trash',
): string {
    const plural = books.length > 1;
    return (
        `Impossible de ${mode === 'transfer' ? 'transférer ce dossier audio' : 'mettre ces pistes à la corbeille'} : ` +
        `le dossier est aussi celui de ${describeSharingBooks(books)}, ` +
        `qui ${plural ? 'le perdraient' : 'le perdrait'}. Choisissez « Laisser le dossier dans le ` +
        `stockage » : la fiche sera supprimée et l'enregistrement restera à ` +
        `${plural ? 'ces fiches' : 'cette fiche'}. Rien n'a été modifié.`
    );
}
