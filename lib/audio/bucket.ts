import 'server-only';

/**
 * Server-only entry point for audio storage. Application code (routes, server
 * components) must import from here, never from `./bucket-core`: the guard below
 * turns an accidental client-component import into a build error, so the B2
 * credentials cannot reach the browser.
 */
export * from './bucket-core';
