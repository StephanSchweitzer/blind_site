import { AudioLinkStatus, Prisma } from '@prisma/client';

/**
 * Statuses that mean "no recording is actually there" — mirrors
 * audioLinkStatusIsMissing() in lib/audio-enums.ts. Kept as a separate,
 * Prisma-typed copy because that file is framework-agnostic and gets bundled
 * into client components, while this one is server-only.
 */
export const AUDIO_MISSING_STATUSES: AudioLinkStatus[] = [
    AudioLinkStatus.FOLDER_EMPTY,
    AudioLinkStatus.FOLDER_MISSING,
    AudioLinkStatus.NO_PATH,
];

/**
 * Query-time equivalent of bookHoldsTracks() in lib/audio-enums.ts — same
 * three conditions (no path, a status established as missing, or an
 * explicit zero track count), expressed as a predicate instead of a JS check
 * on an already-fetched row.
 */
export function audioMissingWhere(): Prisma.BookWhereInput {
    return {
        OR: [
            { audio_filepath: null },
            { audio_filepath: '' },
            { audioLinkStatus: { in: AUDIO_MISSING_STATUSES } },
            { audioTrackCount: { lte: 0 } },
        ],
    };
}

export function audioPresentWhere(): Prisma.BookWhereInput {
    return { NOT: audioMissingWhere() };
}
