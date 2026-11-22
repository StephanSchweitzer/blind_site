/**
 * Preload for scripts/audio-manage.e2e.ts: lets the real route handlers and
 * server actions run under plain Node.
 *
 *   node --env-file=.env --conditions=react-server --require ./scripts/e2e-next-stubs.cjs --import tsx scripts/audio-manage.e2e.ts
 *
 * Replaces only what needs a Next request around it: the session cookie
 * (`next-auth/jwt` decodes a fixed email — the guards still look that account
 * up in the database and check its access level for real), `next/headers`,
 * and `next/cache` (no-op invalidations). Nothing here touches storage: the
 * e2e works against the REAL bucket, in its scratch prefixes.
 *
 * E2E_ADMIN_EMAIL picks the account (default: the local dev account,
 * claude@eca.test, see `pnpm dev:claude-user`).
 */
const Module = require('module');
const path = require('path');

const STUBS = {
    'next-auth/jwt': { getToken: async () => ({ email: process.env.E2E_ADMIN_EMAIL || 'claude@eca.test' }) },
    'next/headers': {
        cookies: async () => ({ getAll: () => [], get: () => undefined }),
        headers: async () => new Headers(),
    },
    'next/cache': {
        revalidatePath: () => {},
        revalidateTag: () => {},
        updateTag: () => {},
        refresh: () => {},
        unstable_cache: (fn) => fn,
    },
};

const stubDir = path.join(__dirname, '.e2e-stub');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (STUBS[request]) return `${stubDir}/${request}`;
    return orig.call(this, request, parent, ...rest);
};
for (const [name, exports] of Object.entries(STUBS)) {
    const id = `${stubDir}/${name}`;
    const m = new Module(id);
    m.filename = id;
    m.loaded = true;
    m.exports = exports;
    Module._cache[id] = m;
}
globalThis.__e2eNextStubs = true;
