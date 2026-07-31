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

export const AUDIO_LINK_STATUS_LABELS: Record<AudioLinkStatus, string> = {
    OK: 'Dossier OK',
    FOLDER_EMPTY: 'Dossier vide',
    FOLDER_MISSING: 'Dossier introuvable',
    NO_PATH: 'Aucun dossier',
    UNVERIFIED: 'Non vérifié',
};

/** One-line explanation of what the admin is looking at, and what to do next. */
export const AUDIO_LINK_STATUS_HINTS: Record<AudioLinkStatus, string> = {
    OK: 'Le dossier existe et contient de l’audio.',
    FOLDER_EMPTY: 'Le dossier existe mais ne contient aucun fichier audio.',
    FOLDER_MISSING: 'Aucun dossier à ce chemin dans le stockage.',
    NO_PATH: 'Ce livre n’a pas de chemin audio enregistré.',
    UNVERIFIED: 'Ce dossier n’a jamais été vérifié.',
};

export const AUDIO_LINK_STATUS_COLORS: Record<AudioLinkStatus, string> = {
    OK: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    FOLDER_EMPTY: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    FOLDER_MISSING: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    NO_PATH: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
    UNVERIFIED: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
};

export const getAudioLinkStatusLabel = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_LABELS[status] ?? status;

export const getAudioLinkStatusColor = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_COLORS[status] ??
    'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300';

export const getAudioLinkStatusHint = (status: AudioLinkStatus): string =>
    AUDIO_LINK_STATUS_HINTS[status] ?? '';
