/**
 * The prefix to list for a book, with a guaranteed trailing slash.
 *
 * Without one, ListObjectsV2 on `dirt/2022/21525  Titre` also matches
 * `dirt/2022/21525  Titre bis/…`. That would inflate the track count, and —
 * far worse — let the containment check in the write routes accept a key that
 * belongs to a neighbouring book.
 *
 * In its own module, without `server-only`, so the read-only scripts
 * (scripts/report-audio-drift.ts) resolve a book's folder exactly as the app
 * does. App code keeps importing it from ./state, which re-exports it.
 */
export function resolvePrefix(audioFilepath: string | null | undefined): string {
    const v = audioFilepath?.trim();
    if (!v) return '';
    return v.endsWith('/') ? v : `${v}/`;
}
