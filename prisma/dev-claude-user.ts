/**
 * ECA Portal — provisions the permanent local dev account used by Claude Code.
 *
 * Run with:  pnpm dev:claude-user
 *
 * Creates (or repairs) a single super-admin account so an agent can sign in at
 * /auth/signin and exercise the whole back office against seeded demo data
 * instead of guessing at pages it can't reach. Idempotent: re-running resets the
 * password, clears the forced-password-change flag and reactivates the account,
 * so a broken login is always one command away from working again.
 *
 *   claude@eca.test / ClaudeDev2026!   → Super Admin (accès total)
 *
 * Unlike `prisma/seed.ts` this script wipes nothing — it only upserts that one
 * user, so it is safe to run on a dev DB you've filled with your own test data.
 *
 * SAFETY: this creates a known-password super admin, so it refuses to run
 * against anything but a local database. Supabase hosts are refused outright
 * (that's production). Any other remote host requires naming it explicitly:
 *   DEV_USER_ALLOW_HOST=my-staging-host pnpm dev:claude-user
 */
import 'dotenv/config';
import { hash } from 'bcrypt';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EMAIL = 'claude@eca.test';
const PASSWORD = 'ClaudeDev2026!';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL (or DIRECT_URL) must be set.');
}

// ── refuse anything that isn't a local dev database ──────────────────────────
let host: string;
try {
    host = new URL(connectionString).hostname;
} catch {
    throw new Error('DATABASE_URL is not a parseable connection string.');
}

function refuse(reason: string): never {
    console.error(
        `\n✋ Refusing to create the Claude dev account: ${reason}\n` +
        `   Target database host: ${host}\n` +
        `   This account has a password committed to the repo — it must never\n` +
        `   exist anywhere but a local development database.\n`,
    );
    process.exit(1);
}

if (process.env.NODE_ENV === 'production') refuse('NODE_ENV is "production"');
if (/supabase/i.test(host)) refuse('the host looks like the Supabase production database');
if (!LOCAL_HOSTS.has(host) && process.env.DEV_USER_ALLOW_HOST !== host) {
    refuse(
        `"${host}" is not a local host.\n` +
        `   If this really is a throwaway dev database, re-run with\n` +
        `   DEV_USER_ALLOW_HOST=${host}`,
    );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    const password = await hash(PASSWORD, 10);
    const account = {
        password,
        passwordNeedsChange: false, // middleware.ts would otherwise trap every request
        name: 'Claude Dev',
        firstName: 'Claude',
        lastName: 'Dev',
        memberType: 'informaticien' as const,
        accessLevel: 'super_admin' as const,
        role: 'admin',
        specialization: 'Compte de développement (agent)',
        notes: 'Compte de développement local — ne pas créer en production.',
        activityStatus: 'ACTIVE' as const,
        isActive: true,
        deletedAt: null,
    };

    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: account,
        create: { ...account, email: EMAIL },
    });

    console.log('\n✅ Compte de développement prêt.');
    console.log(`   id ${user.id} · ${EMAIL} / ${PASSWORD} · Super Admin`);
    console.log('   Connexion : http://localhost:3000/auth/signin\n');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
