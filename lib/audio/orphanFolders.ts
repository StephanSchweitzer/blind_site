import 'server-only';

import { prisma } from '@/lib/prisma';
import { parisDate } from '@/lib/paris-day';

/**
 * La file des dossiers audio que plus aucune fiche ne revendique
 * (/admin/audio-orphelins), écrite ailleurs que par le script de synchronisation.
 *
 * `OrphanAudioFolder` n'avait qu'un seul écrivain : scripts/sync-audio-links.ts,
 * lancé à la main. Supprimer une fiche en laissant son dossier dans le bucket
 * laissait donc un enregistrement que RIEN n'annonçait, jusqu'au prochain
 * passage du script — c'est-à-dire jusqu'à ce que quelqu'un y pense. La
 * suppression d'un livre met la ligne elle-même, pour que le dossier soit
 * traitable dans la minute.
 *
 * La ligne reste corrigeable par le script : son upsert réécrit titre, année et
 * numéro de dossier au passage suivant, à partir du nom du dossier. On écrit
 * donc ici ce qu'on sait de source sûre (le préfixe, le poids, le nombre de
 * pistes, le titre de la fiche supprimée) sans tenter de deviner le reste.
 */

/** Ajoute une ligne datée à la note d'un dossier orphelin, sans écraser la précédente. */
export function appendOrphanNote(existing: string | null, line: string): string {
    const stamped = `${parisDate(new Date())} — ${line}`;
    return existing?.trim() ? `${existing.trim()}\n${stamped}` : stamped;
}

/**
 * Met (ou remet) un dossier dans la file à traiter.
 *
 * `resolvedAt` / `linkedBookId` sont remis à null comme le fait le script : une
 * ligne « rattachée » au livre qu'on vient de supprimer ment. `dismissedAt` est
 * conservé, pour la même raison que dans le script — « ce dossier est un rebut »
 * est un jugement sur le dossier, indépendant de la fiche qui le pointait.
 */
export async function queueOrphanFolder(opts: {
    prefix: string;
    /** Titre de la fiche disparue, en attendant que le script relise le dossier. */
    title: string;
    trackCount: number;
    bytes: number;
    /** Pourquoi ce dossier arrive dans la file. */
    note: string;
}): Promise<void> {
    const { prefix, title, trackCount, bytes, note } = opts;
    if (!prefix) return;

    const existing = await prisma.orphanAudioFolder.findUnique({
        where: { prefix },
        select: { note: true },
    });

    const data = { title, trackCount, bytes: BigInt(bytes) };
    await prisma.orphanAudioFolder.upsert({
        where: { prefix },
        create: { prefix, ...data, note: appendOrphanNote(null, note) },
        update: {
            ...data,
            resolvedAt: null,
            linkedBookId: null,
            note: appendOrphanNote(existing?.note ?? null, note),
        },
    });
}
