/**
 * Preload for scripts/audio-fake-bucket.test.ts: the Next stubs of
 * e2e-next-stubs.cjs, plus lib/audio/bucket.ts redirected to the in-memory
 * fake-bucket.cjs — so the real routes and lib/audio run against no bucket at all.
 *
 *   node --env-file=.env --conditions=react-server --require ./scripts/e2e-fake-bucket.cjs --import tsx scripts/audio-fake-bucket.test.ts
 *
 * `--conditions=react-server` empties `server-only`. `@vercel/blob` is stubbed
 * too (it records, never uploads), for /api/upload-audio.
 */
require('./e2e-next-stubs.cjs');
const Module = require('module');
const path = require('path');

const BUCKET = path.normalize(path.join(__dirname, '..', 'lib', 'audio', 'bucket.ts')).toLowerCase();
const FAKE = path.join(__dirname, 'fake-bucket.cjs');
const BLOB = path.join(__dirname, '.e2e-stub', '@vercel', 'blob');

globalThis.__blobPuts = [];
const blob = new Module(BLOB);
blob.filename = BLOB;
blob.loaded = true;
blob.exports = {
    put: async (pathname, _body, opts) => {
        globalThis.__blobPuts.push({ pathname, opts });
        return { url: `https://fake.blob.test/${pathname}` };
    },
};
Module._cache[BLOB] = blob;

const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === '@vercel/blob') return BLOB;
    const resolved = orig.call(this, request, parent, ...rest);
    return path.normalize(resolved).toLowerCase() === BUCKET ? FAKE : resolved;
};
