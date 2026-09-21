/**
 * Guarded wrappers around `prisma migrate`, so the target database is always
 * printed and the one destructive mistake is impossible.
 *
 *   pnpm db:migrate --name <nom>   prisma migrate dev --create-only --name <nom>
 *                                  (writes the SQL, applies nothing — read it)
 *   pnpm db:migrate                prisma migrate dev
 *                                  (applies pending migrations to the local DB)
 *   pnpm db:deploy                 prisma migrate deploy
 *                                  (applies pending migrations, never resets)
 *
 * Why: `migrate dev` is a development-only command. When it finds the database
 * out of step with the migrations it offers to RESET it — every table emptied.
 * .env is sometimes pointed at production, so `db:migrate` refuses any host
 * that isn't local, and Supabase outright. `migrate deploy` cannot reset, but
 * against a remote host it still requires the host to be named, so production
 * is never migrated by accident:
 *   MIGRATE_DEPLOY_HOST=<host> pnpm db:deploy
 *
 * Both use DIRECT_URL, as prisma.config.ts does (pgbouncer's transaction mode
 * on DATABASE_URL cannot run migrations).
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

const [command, ...args] = process.argv.slice(2);
if (command !== 'dev' && command !== 'deploy') {
    console.error('Usage : tsx scripts/migrate.ts <dev|deploy> [arguments prisma…]');
    process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
    console.error('DIRECT_URL n’est pas défini — c’est la connexion que Prisma utilise pour migrer.');
    process.exit(1);
}

let target: URL;
try {
    target = new URL(url);
} catch {
    console.error('DIRECT_URL n’est pas une chaîne de connexion lisible.');
    process.exit(1);
}
const host = target.hostname;
const isLocal = LOCAL_HOSTS.has(host);

console.log(`\nBase ciblée : ${host}:${target.port || '5432'}${target.pathname}\n`);

function refuse(reason: string): never {
    console.error(`✋ Refus : ${reason}\n`);
    process.exit(1);
}

if (command === 'dev') {
    if (/supabase/i.test(host) || !isLocal) {
        refuse(
            `« migrate dev » ne tourne que sur une base locale ; il peut proposer de\n` +
            `   la vider entièrement. Pour la production : pnpm db:deploy.`,
        );
    }
} else if (!isLocal && process.env.MIGRATE_DEPLOY_HOST !== host) {
    refuse(
        `« ${host} » n’est pas une base locale. Vérifiez « pnpm prisma migrate status »,\n` +
        `   puis relancez en nommant l’hôte : MIGRATE_DEPLOY_HOST=${host} pnpm db:deploy`,
    );
}

const prismaArgs = command === 'dev'
    ? ['migrate', 'dev', ...(args.includes('--name') ? ['--create-only'] : []), ...args]
    : ['migrate', 'deploy', ...args];

const result = spawnSync('prisma', prismaArgs, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
