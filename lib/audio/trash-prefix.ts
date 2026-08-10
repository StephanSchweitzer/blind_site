/**
 * Where deleted audio is parked.
 *
 * Split out of ./trash so plain-Node scripts can know which part of the bucket
 * belongs to the corbeille without importing the `server-only` module that
 * manages it. Anything under this prefix is named by a DeletedAudioTrack row, so
 * a tool sweeping the bucket must leave it alone unless it is going through the
 * restore/purge path deliberately.
 */
export const TRASH_PREFIX = 'corbeille/';
