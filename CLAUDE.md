# ECA Portal

Internal management portal for **ECA (Les Auxiliaires des Aveugles)**, a French nonprofit
producing audiobooks for visually impaired readers. The portal manages readers/volunteers,
books, requests (*demandes*), assignments (*attributions*), billing, payments, and the
**audio corpus** (~11 500 recordings in an object-storage bucket).

The domain is **French**. UI copy, enum labels, and terminology are in French — keep new
user-facing strings in French and match existing wording.

`README.md` describes *what the system is*. This file is *how to work in it* — the rules
and invariants that are expensive to rediscover. When they disagree, this file wins for
process and the code wins for facts.

## Commands

- `pnpm dev` — local dev server (`next dev`) — **but see the dev-server rules below; start it
  through `preview_start`, never through Bash**
- `pnpm build` — production build (`prisma generate && next build`)
- `pnpm start` — serve the production build (`next start`)
- `pnpm lint` — ESLint (`eslint . --ext .js,.jsx,.ts,.tsx`)
- `pnpm prisma generate` — regenerate client
- `pnpm prisma studio` — inspect the DB
- `pnpm dev:claude-user` — (re)create the local dev sign-in account, see below

## Schema changes — NEVER use `prisma migrate` (IMPORTANT)

The migration history is out of sync with both databases: the files in `prisma/migrations/`
are recorded as unapplied against databases that already contain those tables.
**`prisma migrate dev` can prompt a destructive reset, and `prisma migrate deploy` fails on
the first migration.** Neither is ever the right command here.

For a local dev database, push the schema directly:

```bash
pnpm prisma db push
```

To make a change you intend to ship, generate the SQL and apply it by hand:

```bash
pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<timestamp>_<name>/migration.sql
pnpm prisma db execute --file prisma/migrations/<timestamp>_<name>/migration.sql
```

**Read the generated SQL before running it** — if the target has drifted it can contain
`DROP` statements. Keep the file in the repo so the change is recorded even though the
history itself is not trustworthy.

### Two connection strings, not interchangeable

- `DATABASE_URL` — Supabase port **6543**, pgbouncer in *transaction* mode. For the deployed
  app. Prepared statements and long transactions break through it; `pg_dump` can't use it.
- `DIRECT_URL` — Supabase port **5432**, *session* mode. For the Prisma CLI and for anything
  run from a terminal.

`prisma.config.ts` already points the CLI at `DIRECT_URL`. Any script you write under
`scripts/` must do the same — call `scriptDatabaseUrl()` from `scripts/db-url.ts` rather
than reading `process.env.DATABASE_URL` itself.

### The production database has a hard ceiling

Supabase free tier: **500 MB, and it flips to read-only past that.** This is why the audit
trail self-trims and the audio corbeille is purged nightly. Don't lengthen a retention
window, add a high-volume log table, or store blobs in Postgres without checking headroom.

## Signing in to the back office (for Claude)

**You are expected to sign in and use `/admin` yourself** rather than reporting the admin
section as unreachable. There is a permanent local dev account for exactly this:

```
claude@eca.test / ClaudeDev2026!
```

It is a `super_admin` / `informaticien`, so every page is reachable, including the
super-admin-only `/admin/stats`.

How to use it:

1. `preview_start` the `dev` config (`.claude/launch.json`), which serves http://localhost:3000.
   Reuse a server that is already running, and stop it when you are done — see
   [Always stop the dev server when you are done](#always-stop-the-dev-server-when-you-are-done-important).
2. Go to `/auth/signin`, fill the email + password fields, submit. The session is a NextAuth
   JWT cookie and persists across navigations in that tab.
3. Navigate anywhere under `/admin`.

If the login fails (fresh DB, account edited/deleted, password changed), just re-run
`pnpm dev:claude-user`. It **upserts only that one user and wipes nothing**, so it is safe on
a dev DB full of your own test data — unlike `pnpm prisma db seed`, which resets every table
it manages. The account is also created by `prisma/seed.ts`, so a fresh seed includes it.

The provisioning script (`prisma/dev-claude-user.ts`) refuses to run against anything but a
local database: Supabase hosts are rejected outright, and any other non-local host must be
named explicitly via `DEV_USER_ALLOW_HOST=<host>`. Never create this account, or any account
with a repo-committed password, on the production database.

## Always stop the dev server when you are done (IMPORTANT)

Only **one** dev server should ever run here — a live `next dev` locks `.next/`, so a second one
fails or silently falls back to another port, leaving stale servers and split state.

1. **Reuse the running server.** `preview_list` first; if a `dev` server is up, `preview_start`
   the `dev` config again (it reuses the process) or just `navigate` to it. Never another port.
2. **Never start it through Bash/PowerShell** (`pnpm dev`, `next dev`, `start-process`…) — always
   `preview_start`, so the process is tracked and can be stopped.
3. **Stop it once your changes are verified**: `preview_stop { serverId }` for every id
   `preview_list` reports, at the end of the task, before you report back.

If a lock survives (`EPERM`/`EBUSY` on `.next`, or port 3000 busy with nothing in `preview_list`),
an orphaned node process holds it — kill it, then delete `.next` (regenerated on the next run):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force .next
```

## Terminology (IMPORTANT — a rename happened)

Use the **current** terms everywhere. The legacy terms were renamed; do not use them in new
code, variable names, UI, or comments:

- **attributions** — assignments of books/tasks to readers *(formerly `affectations`)*
- **demandes** — requests *(formerly `commandes`)*

Note: the underlying Prisma models and API routes still use their original English names
(`Orders` model / `app/api/orders`, `Assignment` model / `app/api/assignments`) — only the
French UI copy and rule/variable naming follow the `demandes`/`attributions` rename. Don't
rename the models or routes to match; keep new French-facing strings and comments aligned
with the current terms instead.

Payment categories (`PaymentType` enum, `lib/payment-enums.ts`): `COTISATION`, `ENREGISTREMENT`
(receipts), `DON` (donations), `DIVERS`.

House style for French copy: always « aux ECA », never « à l'ECA ». Say *demande*, never
*commande*, anywhere a user can read it.

## Glossary — the mappings that mislead

The full English ↔ French UI ↔ code table lives in `.claude/rules/glossary.md` and loads when you
touch `app/`, `lib/` or `components/`. These are the rows where the three columns disagree:

| English (what the user says) | French UI term | Code identifier (model / route / enum) |
|---|---|---|
| orders / requests | Demandes | `Orders` model; `/admin/orders`; `/api/orders` *(formerly `commandes`)* |
| assignments | Attributions | `Assignment` model; `/admin/assignments`; `/api/assignments` *(formerly `affectations`)* |
| admins / staff | Permanents *(permanent)* | `accessLevel: admin` **(label "Permanent")**; users tab `permanents` |
| donors / benefactors | Donateurs *(bienfaiteur)* | `memberType: bienfaiteur` **(label "Donateur")**; users tab `bienfaiteurs` |
| listeners / the visually impaired | Auditeurs *(sing. auditeur)* | `memberType: auditeur`; users tab `auditeurs` *(legacy `ecouteur` → displays as Auditeur)* |
| staff picks / book list | Coups de cœur / "Liste des Livres" | `CoupsDeCoeur` model; `/admin/listes-de-livres`; `/api/listes-de-livres`; public `/listes-de-livres` |
| duplicates / merge queue | Doublons | `Book.needsReview` / `id_arbre`; `/admin/review`; `BookMergeEvent` |
| bill / invoice | Facture | `Bill` model; `/admin/bills`; `/api/bills` |
| trash / recycle bin (audio) | Corbeille | `DeletedAudioTrack`; `lib/audio/trash.ts` |

**Two separate "admin" axes — don't conflate them:**
- `accessLevel` (permission): `member` → "Membre", `admin` → **"Permanent"**, `super_admin` → "Super Admin".
- `memberType` (role): includes `administration` → **"Administrateur"**, a *role* distinct from the
  `admin` *access level*. A "permanent" (access level `admin`) is not the same as an "administrateur"
  (member type). When the user says **"admins"/"permanents"** they mean `accessLevel: admin`.

## Security conventions (non-negotiable)

- **Every API route is guarded.** Wrap handlers in `withAuth` (authenticated) or `withAdmin`
  (admin-only) — both live in `lib/auth/guards.ts`. Never ship an unguarded route.
- **Storage and AWS credentials are server-side only.** No B2/AWS keys or SDK calls in client
  components. The browser only ever receives **expiring presigned URLs**; the bucket is
  private and nothing is served from a public URL.
- **All outbound email goes through the centralized `sendEmail` chokepoint** (`lib/email/sendEmail.ts`).
  Do not call Resend directly from routes or components — always route through it.
- **Cron routes (`app/api/cron/*`) authenticate on `CRON_SECRET`** (`Authorization: Bearer …`)
  or a signed-in super admin. With no secret configured they **refuse** rather than standing
  open. Keep that failure mode if you add one.
- Super-admin-only pages `notFound()` or redirect rather than returning 403 — `/admin/stats`
  must not reveal that the URL exists.
- **`accessLevel` only ever moves under a super admin — in both directions.** Creating a login
  account, promoting to one, and demoting *out* of one are all `super_admin` gestures
  (`POST /api/user`, `PATCH /api/user/[id]`). Guarding only promotion left a permanent able to
  demote the super admin. Always scope the check to an *actual* change, so a permanent can
  still edit another permanent's fiche without being blocked by the level the form carries.

## Business rules

Per-area rules live in `.claude/rules/` and load when you open the matching files: audio storage,
audit trail, billing and pricing, status sync, user activity status, public pages and cache
invalidation, code style.

### Append-only tables — insert only, never update or delete

`BillEvent`, `OrderEvent`, `AssignmentEvent`, `UserActivityEvent`, `BookMergeEvent`,
`AuditEvent`, `AudioTrackEvent`.

`AudioTrackDuration` is **not** one of these — it is a cache and is updated in place.

### Temporary toggles
`lib/feature-flags.ts` holds leadership-requested switches that are expected to be reverted
(currently `ADMINS_CAN_CREATE_USERS = false`). Keep them self-contained with the rollback
written next to the flag, so reverting is one edit rather than an archaeology dig.

## General notes for Claude

- Prefer minimal, targeted diffs that match existing patterns over broad rewrites.
- Reuse the existing kit: form bases, `EntitySearchCombobox`, the enum label maps, the
  `types/models` select configs. Don't hand-roll a search popover or a fetch shape.
- Append-only tables: **insert only** (list above).
- Don't read secret files (`.env*`); real values live outside version control.
- Commit directly to `main` on this repo — no feature branch, no PR, unless asked.
