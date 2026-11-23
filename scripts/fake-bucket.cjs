/**
 * In-memory stand-in for lib/audio/bucket.ts, loaded by scripts/e2e-fake-bucket.cjs.
 *
 * The pure helpers (naming, ordering, isAudioKey, DevBucketWriteRefused…) are the
 * real ones from bucket-core; every call that would reach B2 is replaced. Nothing
 * here can touch the real bucket: there is no client.
 *
 * globalThis.__fake lets a test shape the storage and its failures:
 *   objects        Map<key, { size, checksum, lastModified }>
 *   signed         keys a PUT URL was signed for, in order
 *   failDelete     Set<key> — delete refused (5xx), object kept
 *   deleteThenFail Set<key> — delete CARRIED OUT, answer lost (5xx) — B2 does this
 *   copyError      Error thrown by every copy (e.g. a DevBucketWriteRefused)
 *   copyDelayMs    every copy takes this long — to stage a deadline
 */
const core = require('../lib/audio/bucket-core.ts');

const F = (globalThis.__fake ??= {
    objects: new Map(),
    signed: [],
    failDelete: new Set(),
    deleteThenFail: new Set(),
    copyError: null,
});

const fiveHundred = () =>
    Object.assign(new Error('InternalError (faux stockage)'), { $metadata: { httpStatusCode: 500 } });

const listRawObjects = async (prefix) =>
    !prefix ? [] : [...F.objects].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, size: o.size }));

const deleteOne = (key) => {
    if (F.failDelete.has(key)) throw fiveHundred();
    F.objects.delete(key);
    // Every attempt, the retries included, answers 5xx — the worst case.
    if (F.deleteThenFail.has(key)) throw fiveHundred();
};

module.exports = {
    ...core,
    __isFake: true,
    listRawObjects,
    listBookTracks: async (prefix) => core.toOrderedTracks(await listRawObjects(prefix), prefix),
    headTrack: async (key) => {
        const o = F.objects.get(key);
        return o ? { sizeBytes: o.size, contentType: 'audio/mpeg', lastModified: o.lastModified ?? new Date() } : null;
    },
    headTrackChecksum: async (key) => F.objects.get(key)?.checksum ?? null,
    putTrackUrl: async (key) => {
        F.signed.push(key);
        return `fake://put/${encodeURIComponent(key)}`;
    },
    getTrackUrl: async (key) => `fake://get/${encodeURIComponent(key)}`,
    copyTrack: async (from, to) => {
        if (F.copyDelayMs) await new Promise((r) => setTimeout(r, F.copyDelayMs));
        if (F.copyError) throw F.copyError;
        const o = F.objects.get(from);
        if (!o) throw new Error(`NoSuchKey ${from}`);
        F.objects.set(to, { ...o, checksum: null, lastModified: new Date() });
    },
    deleteTrack: async (key) => deleteOne(key),
    deleteTracks: async (keys) => {
        const failed = [];
        for (const k of keys) {
            try {
                deleteOne(k);
            } catch {
                failed.push(k);
            }
        }
        return { failed };
    },
    ensureFolderPlaceholder: async (prefix, remaining) => {
        const objects = remaining ?? (await listRawObjects(prefix));
        if (!prefix || objects.length) return false;
        F.objects.set(`${prefix}.bzEmpty`, { size: 0, checksum: null });
        return true;
    },
    getRangeBytes: async () => new Uint8Array(0),
};
