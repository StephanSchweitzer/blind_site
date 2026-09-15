import 'server-only';

import { prisma } from '@/lib/prisma';
import { resolvePrefix } from './state';

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
 * Le refus, formulé une fois. `action` complète « Impossible de … » : la phrase
 * doit dire ce qui a été empêché, puis quoi faire — la fusion sur /admin/review
 * pour deux fiches du même ouvrage, le rattachement pour un dossier mal
 * attribué.
 */
export function sharedFolderRefusal(books: FolderSharingBook[], action: string): string {
    const plural = books.length > 1;
    return (
        `Impossible de ${action} : ce dossier audio est aussi celui de ` +
        `${describeSharingBooks(books)}. Un dossier ne peut appartenir qu'à un seul livre — ` +
        `supprimer ici viderait aussi ${plural ? 'ces fiches' : 'cette fiche'}. ` +
        `Réglez d'abord le doublon (fusion depuis Doublons), ou détachez le dossier ` +
        `${plural ? 'des autres fiches' : "de l'autre fiche"}.`
    );
}
