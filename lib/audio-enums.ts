/**
 * French labels for AudioLinkStatus — the health of a book's link to its audio
 * folder in the bucket. Source of truth for the UI, per the convention that
 * enum wording lives in lib/ rather than being hardcoded in components.
 */

export const AudioLinkStatus = {
    OK: 'OK',
    FOLDER_EMPTY: 'FOLDER_EMPTY',
    FOLDER_MISSING: 'FOLDER_MISSING',
    NO_PATH: 'NO_PATH',
    UNVERIFIED: 'UNVERIFIED',
} as const;

export type AudioLinkStatus = typeof AudioLinkStatus[keyof typeof AudioLinkStatus];

/**
 * Wording note: these are read by permanents, not by whoever maintains the
 * storage, so they describe the *recording* rather than the plumbing.
 *
 * NO_PATH and FOLDER_MISSING are the pair worth keeping distinct — both used to
 * read as "there is no folder", though they call for opposite reactions:
 * NO_PATH means nobody has said where the audio lives (normal for a book not yet
 * recorded), FOLDER_MISSING means we know where it should be and it is gone
 * (always an anomaly). Only the second one is alarming.
 */
export const AUDIO_LINK_STATUS_LABELS: Record<AudioLinkStatus, string> = {
    OK: 'Audio disponible',
    FOLDER_EMPTY: 'Dossier vide',
    FOLDER_MISSING: 'Dossier introuvable',
    NO_PATH: 'Pas d’audio associé',
    UNVERIFIED: 'Non vérifié',
};

/** One-line explanation of what the admin is looking at, and what to do next. */
export const AUDIO_LINK_STATUS_HINTS: Record<AudioLinkStatus, string> = {
    OK: 'L’enregistrement est disponible et peut être écouté.',
    FOLDER_EMPTY: 'Le dossier de ce livre existe mais ne contient aucun enregistrement.',
    FOLDER_MISSING: 'Le dossier associé à ce livre est introuvable dans le stockage.',
    NO_PATH: 'Aucun enregistrement n’est associé à ce livre.',
    UNVERIFIED: 'L’audio de ce livre n’a jamais été vérifié.',
};

export const AUDIO_LINK_STATUS_COLORS: Record<AudioLinkStatus, string> = {
    OK: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    FOLDER_EMPTY: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    FOLDER_MISSING: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    NO_PATH: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
    UNVERIFIED: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
};

/**
 * Colours for the button that opens the audio editor, wherever a book is
 * listed. A book with nothing to listen to has to be visible at a glance in a
 * long table, but it is a to-do rather than an error — so the missing case is a
 * soft red outline, not a filled destructive button.
 */
export const AUDIO_LINK_STATUS_BUTTON_COLORS: Record<AudioLinkStatus, string> = {
    OK: 'bg-muted text-foreground border-border hover:bg-accent',
    FOLDER_EMPTY:
        'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40',
    FOLDER_MISSING:
        'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40',
    NO_PATH:
        'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40',
    // Never checked: silence is not the same as an established absence.
    UNVERIFIED: 'bg-muted text-foreground border-border hover:bg-accent',
};

/** Does this status mean there is audio to listen to right now? */
export const audioLinkStatusHasAudio = (status: AudioLinkStatus): boolean =>
    status === AudioLinkStatus.OK;

/** Is the absence of audio established (as opposed to simply unverified)? */
export const audioLinkStatusIsMissing = (status: AudioLinkStatus): boolean =>
    status === AudioLinkStatus.NO_PATH ||
    status === AudioLinkStatus.FOLDER_MISSING ||
    status === AudioLinkStatus.FOLDER_EMPTY;

export const getAudioLinkStatusButtonColor = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_BUTTON_COLORS[status] ?? 'bg-muted text-foreground border-border hover:bg-accent';

export const getAudioLinkStatusLabel = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_LABELS[status] ?? status;

export const getAudioLinkStatusColor = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_COLORS[status] ??
    'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300';

export const getAudioLinkStatusHint = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_HINTS[status] ?? '';

/** The shape any caller of the two helpers below needs to supply. */
export interface AudioBearing {
    audio_filepath?: string | null;
    audioLinkStatus?: AudioLinkStatus | null;
    audioTrackCount?: number | null;
}

/**
 * Does this book actually hold a recording?
 *
 * Deliberately stricter than "has a path". Book.audio_filepath is a pointer, and
 * a pointer at an empty or vanished folder is not a recording — the corpus has
 * plenty, left behind by folders that were emptied, relinked, or created by an
 * upload that never landed.
 *
 * UNVERIFIED counts as holding: the columns are a cache, and "never checked" is
 * not evidence of absence. Callers that are about to REFUSE something on the
 * strength of this answer must re-read the bucket first rather than act on a
 * stale cache — see the audio conflict in app/admin/review/actions.ts.
 */
export const bookHoldsTracks = (b: AudioBearing): boolean => {
    if (!b.audio_filepath?.trim()) return false;
    const status = b.audioLinkStatus ?? AudioLinkStatus.UNVERIFIED;
    if (status === AudioLinkStatus.FOLDER_EMPTY || status === AudioLinkStatus.FOLDER_MISSING) {
        return false;
    }
    if (status === AudioLinkStatus.NO_PATH) return false;
    // A count of zero alongside an OK status is contradictory, and the honest
    // reading of the pair is "nothing to listen to".
    return b.audioTrackCount == null || b.audioTrackCount > 0;
};

/**
 * Are these two records a genuine double recording — the one case where merging
 * them would destroy something irreplaceable?
 *
 * The question is asked of the FILES, not of the path strings. Two differing
 * paths where only one folder holds tracks is not a conflict: it is a live
 * recording and a dead pointer, and refusing to merge those leaves a permanent
 * staring at a card with every button disabled and nothing they can do about it.
 * That is exactly how an upload made to the wrong side of a duplicate pair used
 * to freeze the pair for good.
 */
export const isDoubleRecording = (a: AudioBearing, b: AudioBearing): boolean =>
    bookHoldsTracks(a) &&
    bookHoldsTracks(b) &&
    a.audio_filepath!.trim() !== b.audio_filepath!.trim();

/**
 * AudioTrackAction → French label.
 *
 * Lives here rather than next to the stats dashboard's other badge labels
 * because two unrelated readers need it: the badge on an audio row, and the
 * `action` field of an AudioTrackEvent diff in the journal des modifications —
 * and lib/audit/labels.ts cannot import from app/. One definition, so an upload
 * is never « Envoi » on one screen and « UPLOAD » on the other.
 */
export const AUDIO_TRACK_ACTION_LABELS: Record<string, string> = {
    UPLOAD: 'Envoi',
    RENAME: 'Renommage',
    DELETE: 'Suppression',
    RESTORE: 'Restauration',
};
