/**
 * The connection string a script run from a terminal should use.
 *
 * Production has two, and they are not interchangeable:
 *
 *   DATABASE_URL  port 6543, pgbouncer in TRANSACTION mode — for the deployed
 *                 app, whose serverless clients open and drop connections
 *                 constantly. Prepared statements and long transactions break
 *                 through it, and pg_dump cannot dump through it at all.
 *   DIRECT_URL    port 5432, SESSION mode — for anything run from a terminal.
 *
 * Scripts here batch, transact and run parameterised raw SQL, so they want the
 * session pooler every time. DATABASE_URL remains the fallback purely for local
 * development, where only the one variable is usually set.
 *
 * prisma.config.ts already points the Prisma CLI at DIRECT_URL; this is the
 * equivalent for scripts that build their own PrismaClient.
 */
export function scriptDatabaseUrl(): string {
    const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'Ni DIRECT_URL ni DATABASE_URL ne sont définis — impossible de joindre la base.',
        );
    }
    return url;
}

/** Host and port only, safe to print so a run says what it is about to touch. */
export function describeDatabase(url: string): string {
    try {
        const u = new URL(url);
        return `${u.hostname}:${u.port || '5432'}`;
    } catch {
        return '(chaîne illisible)';
    }
}
