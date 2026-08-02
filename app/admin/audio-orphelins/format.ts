/** Shared formatters for the orphan-folder screen. */

export const formatBytes = (bytes: number): string =>
    bytes >= 1e9
        ? `${(bytes / 1e9).toFixed(2)} Go`
        : bytes >= 1e6
          ? `${(bytes / 1e6).toFixed(1)} Mo`
          : `${Math.max(1, Math.round(bytes / 1e3))} Ko`;

export const formatDate = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';

/**
 * `#recycle` is the Synology recycle bin, and `…UploadDBCaseConflict` is a Cloud
 * Sync conflict copy — both are folders the NAS made on its own, not folders
 * anyone recorded into. A folder sitting under one of them is a deleted or
 * duplicated copy, which changes what the right decision is: usually écarter,
 * but only after checking that the live folder really holds the same audio.
 */
export const NAS_ARTEFACT = /#recycle|UploadDBCaseConflict|@eaDir|\.DS_Store/i;

export const isNasArtefact = (prefix: string): boolean => NAS_ARTEFACT.test(prefix);
