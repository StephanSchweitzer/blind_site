import 'server-only';

import { prisma } from '@/lib/prisma';
import { listRawObjects, toOrderedTracks } from '@/lib/audio/bucket';
import { refreshBookAudioState, resolvePrefix } from '@/lib/audio/state';
import { softDeleteTracks, markTrashOrigin } from '@/lib/audio/trash';
import { bookDeletionSharedRefusal } from '@/lib/audio/sharedFolder';
import { readBookDeletionCheck } from './deletionPreflight';

/**
 * Supprimer une fiche livre, et décider de son enregistrement.
 *
 * ## Pourquoi le dossier audio est devenu une question
 *
 * La suppression déplaçait TOUTES les pistes vers la corbeille, sans le
 * demander. Trois problèmes, par ordre de gravité :
 *
 *  1. ça ne finit pas. softDeleteTracks copie 10 de front et la route tient 45 s
 *     (maxDuration) ; le corpus contient un dossier de 77 pistes pour 748 Mio.
 *     scripts/delete-duplicate-book.ts n'existait que pour contourner ça, en
 *     vidant `audio_filepath` à la main avant de supprimer la ligne.
 *  2. recopier un dossier vers la corbeille pour protéger une copie que, sans
 *     fiche, plus personne ne réclamera, c'est une troisième copie pour rien —
 *     sur un stockage où l'enregistrement est souvent l'unique original.
 *  3. la corbeille perdait la trace du livre (`bookId` en SetNull) et son seul
 *     écran filtrait sur lui : les pistes devenaient invisibles, puis étaient
 *     purgées pour de bon au bout de 14 jours. Voir markTrashOrigin.
 *
 * D'où trois dispositions explicites, et « laisser le dossier » par défaut :
 * rien n'est copié, rien n'est supprimé du stockage.
 *
 * ## La fiche elle-même ne disparaît plus de Postgres
 *
 * « Supprimer » pose `Book.deletedAt` (lib/prisma.ts la cache alors partout)
 * plutôt que d'effacer la ligne — voir lib/books/deletionGuard.ts pour
 * pourquoi : `Orders.catalogueId` / `Assignment.catalogueId` sont RESTRICT, et
 * l'historique supprimé les nomme quand même. Ce qui suit change avec ça :
 * « laisser le dossier » ne met donc PLUS le dossier dans la file de
 * /admin/audio-orphelins — `audio_filepath` reste sur une fiche qui existe
 * toujours, restaurable, et le dossier n'est pas orphelin tant qu'elle ne l'est
 * pas. `transfer` et `trash` restent des choix explicites à part entière : le
 * permanent qui sait vouloir libérer l'enregistrement (fusion, doublon confirmé)
 * peut toujours le dire.
 *
 * ## Une seule implémentation
 *
 * La route DELETE du livre ET la suppression depuis Doublons passent par ici :
 * la seconde supprimait la ligne sans le moindre contrôle audio, en laissant un
 * dossier que rien n'annonçait. Les refus (demandes / attributions ; dossier
 * partagé, qui n'admet que `leave`) viennent de readBookDeletionCheck, le même
 * contrôle que la fenêtre de confirmation a lu à son ouverture — refait ici,
 * parce qu'une minute a pu passer entre les deux.
 */

export type AudioDispositionMode = 'leave' | 'transfer' | 'trash';

export interface AudioDisposition {
    mode: AudioDispositionMode;
    /** `transfer` : le livre qui hérite du dossier. */
    targetBookId?: number;
    /** `transfer` : le livre visé porte déjà un chemin, vide, qu'on accepte de remplacer. */
    confirmReplaceTarget?: boolean;
    /** `trash` : le nombre de pistes vu par le permanent, revérifié ici. */
    confirmTrackCount?: number;
}

export interface DeleteBookAudioOutcome {
    mode: AudioDispositionMode;
    trackCount: number;
    /** Dossier laissé en place, toujours attaché à la fiche (masquée, restaurable). */
    orphanedPrefix?: string;
    /** Dossier partagé laissé en place : les fiches qui le gardent. */
    keptBy?: { id: number; title: string }[];
    /** Livre qui a hérité du dossier, et son titre. */
    targetBookId?: number;
    targetTitle?: string;
    /**
     * Le transfert est fait, mais l'état audio du livre de destination n'a pas pu
     * être relu (stockage injoignable). Rien n'est perdu : la prochaine ouverture
     * de l'éditeur audio, ou la synchronisation nocturne, le corrige.
     */
    targetStateStale?: boolean;
}

export type DeleteBookResult =
    | { ok: true; title: string; audio: DeleteBookAudioOutcome }
    | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

/** « 3 pistes » / « 1 piste ». */
const tracksLabel = (n: number) => `${n} piste${n > 1 ? 's' : ''}`;

export async function deleteBookWithAudio(opts: {
    bookId: number;
    performedById: number | null;
    /** Absente alors que le dossier contient des pistes : refus, voir plus bas. */
    disposition?: AudioDisposition | null;
}): Promise<DeleteBookResult> {
    const { bookId, performedById, disposition } = opts;

    const { book, preflight, objects } = await readBookDeletionCheck(bookId);
    if (!book || !preflight) {
        return { ok: false, status: 404, error: 'Livre introuvable' };
    }

    // Les refus d'abord, avant de toucher au stockage : une fiche qui se révèle
    // non supprimable ne doit pas avoir vu son dossier vidé pour rien.
    if (preflight.usageRefusal) {
        return {
            ok: false,
            status: 409,
            error: preflight.usageRefusal,
            extra: { usage: preflight.usage, links: preflight.links },
        };
    }

    const { prefix, sharedWith } = preflight.audio;
    const tracks = toOrderedTracks(objects, prefix);

    // Dossier partagé : la fiche part, le dossier reste — c'est le seul sort
    // qui ne retire rien au jumeau (voir bookDeletionSharedNotice). Vérifié
    // ICI, pas seulement dans la fenêtre : Doublons appelle aussi cette
    // fonction, et un client périmé pourrait encore demander autre chose.
    if (sharedWith.length && tracks.length > 0 && disposition && disposition.mode !== 'leave') {
        return {
            ok: false,
            status: 409,
            error: bookDeletionSharedRefusal(sharedWith, disposition.mode),
            extra: { sharedWith },
        };
    }

    /**
     * Pas de décision alors qu'il y a un enregistrement à la clé : refus.
     *
     * Le silence valait « tout envoyer à la corbeille », c'est-à-dire la plus
     * lente et la plus coûteuse des trois options, sur un appel qui pouvait
     * expirer en cours de route. Un appelant qui n'aurait pas été mis à jour
     * reçoit un refus explicite plutôt que 748 Mio recopiés en silence.
     */
    if (tracks.length > 0 && !disposition) {
        return {
            ok: false,
            status: 400,
            error:
                `Le dossier audio de ce livre contient ${tracksLabel(tracks.length)}. ` +
                `Indiquez ce qu'il faut en faire avant de supprimer la fiche.`,
            extra: { requiresAudioDecision: true, audio: preflight.audio },
        };
    }

    // Dossier vide ou absent : il n'y a rien à décider, et rien à mettre dans la
    // file des orphelins.
    const mode: AudioDispositionMode = tracks.length === 0 ? 'leave' : disposition!.mode;

    if (mode === 'trash') {
        if (disposition?.confirmTrackCount !== tracks.length) {
            return {
                ok: false,
                status: 409,
                error: 'La confirmation ne correspond pas au nombre de pistes actuel.',
            };
        }

        const result = await softDeleteTracks({
            bookId,
            prefix,
            tracks: tracks.map((t) => ({ key: t.key, name: t.name, sizeBytes: t.sizeBytes })),
            userId: performedById,
            // Plus rien à maintenir en vie ni à décrire : la fiche part juste après.
            skipFinalisation: true,
        });

        // Refus plutôt que supprimer la fiche par-dessus des pistes restées dans
        // son dossier : elles seraient échouées sous un préfixe que plus aucune
        // ligne ne nomme. Le déplacement est reprenable, donc la réponse honnête
        // est de dire ce qui bloque et de laisser relancer.
        if (result.failed.length) {
            return {
                ok: false,
                status: 502,
                error:
                    `${result.failed.length} fichier(s) audio n’ont pas pu être déplacés vers la ` +
                    'corbeille. Le livre n’a pas été supprimé. Relancez la suppression : les ' +
                    'fichiers déjà déplacés ne le seront pas deux fois.',
                extra: {
                    audioFailures: result.failed.map((f) => f.filename),
                    details: result.failed,
                },
            };
        }
    }

    let target: { id: number; title: string } | null = null;

    if (mode === 'transfer') {
        const targetBookId = disposition?.targetBookId;
        if (!Number.isInteger(targetBookId)) {
            return { ok: false, status: 400, error: 'Aucun livre de destination indiqué.' };
        }
        if (targetBookId === bookId) {
            return {
                ok: false,
                status: 409,
                error: 'Le dossier ne peut pas être transféré au livre qu’on supprime.',
            };
        }

        const found = await prisma.book.findUnique({
            where: { id: targetBookId! },
            select: { id: true, title: true, audio_filepath: true, deletedAt: true },
        });
        if (!found) {
            return { ok: false, status: 409, error: 'Le livre de destination est introuvable.' };
        }
        // findUnique voit les fiches supprimées : un transfert vers l'une d'elles
        // rangerait l'enregistrement sous un livre que plus rien n'affiche.
        if (found.deletedAt) {
            return {
                ok: false,
                status: 409,
                error:
                    `« ${found.title} » a été supprimé : il ne peut pas hériter du dossier audio. ` +
                    `Choisissez un autre livre, ou restaurez d’abord cette fiche.`,
            };
        }
        target = { id: found.id, title: found.title };

        const existing = resolvePrefix(found.audio_filepath);
        if (existing && existing !== prefix) {
            // Même règle que le rattachement d'un dossier orphelin
            // (app/admin/audio-orphelins/actions.ts) : un dossier vide se
            // remplace sans rien perdre, un dossier qui porte de vraies pistes
            // non — l'écraser orphelinerait silencieusement le bon
            // enregistrement. Le comptage suit ici la règle canonique
            // (toOrderedTracks : ni sous-dossier, ni stub AppleDouble), donc un
            // dossier ne contenant que des « ._ » n'est pas « occupé ».
            const held = toOrderedTracks(await listRawObjects(existing), existing).length;
            if (held > 0) {
                return {
                    ok: false,
                    status: 409,
                    error:
                        `« ${found.title} » possède déjà un dossier audio contenant ` +
                        `${tracksLabel(held)}. Un livre ne peut pointer que sur un seul dossier : ` +
                        `choisissez un autre livre de destination, ou laissez le dossier en place — ` +
                        `il apparaîtra dans Audio orphelins.`,
                    extra: { targetHoldsTracks: held },
                };
            }
            if (!disposition?.confirmReplaceTarget) {
                return {
                    ok: false,
                    status: 409,
                    error:
                        `« ${found.title} » porte déjà un chemin audio, mais son dossier est vide ` +
                        `ou absent : ${existing}. Confirmez pour le remplacer par celui-ci.`,
                    extra: { requiresTargetReplaceConfirm: true, targetCurrentPath: existing },
                };
            }
        }
    }

    // Écrit PENDANT que la fiche existe : après, `bookId` est null et la
    // corbeille ne sait plus de quel livre elle vient. Placé après le
    // déplacement ci-dessus pour marquer aussi les lignes qu'il vient de créer.
    await markTrashOrigin(bookId, book.title);

    if (mode === 'transfer' && target) {
        const names = tracks.map((t) => t.name);
        const targetId = target.id;
        await prisma.$transaction(async (tx) => {
            // Le chemin est retiré de la source AVANT d'être donné à la
            // destination : deux fiches ne revendiquent jamais le même dossier,
            // même le temps d'une transaction.
            await tx.book.update({ where: { id: bookId }, data: { audio_filepath: null } });
            await tx.book.update({ where: { id: targetId }, data: { audio_filepath: prefix } });

            // Les durées mesurées décrivent les mêmes fichiers : elles suivent le
            // dossier. C'est un CACHE (AudioTrackDuration se modifie en place,
            // contrairement aux journaux append-only), de clé unique
            // (bookId, filename) — d'où la suppression préalable des lignes
            // homonymes de la destination. Sans ce transfert,
            // refreshBookAudioState ne retrouve aucune mesure pour ces pistes et
            // le livre de destination affiche « Non calculée » alors que tout est
            // mesuré. AudioTrackEvent, lui, reste en place : append-only.
            await tx.audioTrackDuration.deleteMany({
                where: { bookId: targetId, filename: { in: names } },
            });
            await tx.audioTrackDuration.updateMany({
                where: { bookId, filename: { in: names } },
                data: { bookId: targetId },
            });

            // Soft delete : voir plus bas pour la raison, identique dans les deux
            // branches de cette fonction.
            await tx.book.update({ where: { id: bookId }, data: { deletedAt: new Date() } });
        });

        // HORS transaction, et volontairement : refreshBookAudioState atteint le
        // stockage et retarifie les demandes ouvertes (voir fuseBooks, même
        // raison). Il reste l'unique écrivain des colonnes d'état audio et de
        // readingDurationMinutes, donc rien n'est écrit à la main au-dessus :
        // pré-remplir audioSizeKb ici lui ferait justement SAUTER la
        // retarification, la destination gardant un tarif calculé sur l'ancien poids.
        let targetStateStale = false;
        try {
            await refreshBookAudioState(targetId, performedById);
        } catch (error) {
            console.error('deleteBookWithAudio: état audio non relu pour le livre', targetId, error);
            targetStateStale = true;
        }

        return {
            ok: true,
            title: book.title,
            audio: {
                mode,
                trackCount: tracks.length,
                targetBookId: targetId,
                targetTitle: target.title,
                ...(targetStateStale ? { targetStateStale } : {}),
            },
        };
    }

    // Soft delete, pas suppression : `audio_filepath` reste tel quel, la fiche
    // n'a jamais cessé d'exister pour le réclamer. Pas de file d'orphelins à
    // alimenter ici — POST /api/books/[id]/restore rend la fiche, et son
    // dossier avec, sans rien à rattacher.
    await prisma.book.update({ where: { id: bookId }, data: { deletedAt: new Date() } });

    return {
        ok: true,
        title: book.title,
        audio: {
            mode,
            trackCount: tracks.length,
            ...(mode === 'leave' && tracks.length > 0 ? { orphanedPrefix: prefix } : {}),
            ...(mode === 'leave' && tracks.length > 0 && sharedWith.length ? { keptBy: sharedWith } : {}),
        },
    };
}
