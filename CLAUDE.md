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
- `pnpm db:migrate` / `pnpm db:deploy` — create/apply migrations, see below
- `pnpm a11y:check` — axe-core over every public page in every display configuration (needs the
  dev server). Run it after touching the public site's markup or `app/globals.css`; the site's
  audience is blind and low-vision readers

## Schema changes — through the guarded migration scripts (IMPORTANT)

Migrations are tracked by Prisma since the 2026-09-21 baseline. `prisma/migrations/0_baseline`
holds the whole schema as of that day; everything earlier is frozen in
`prisma/migrations_archive/` (read it for history, never replay or edit it). Existing
databases were marked with `prisma migrate resolve --applied 0_baseline`, not rebuilt.

1. Edit `prisma/schema.prisma`.
2. `pnpm db:migrate --name <snake_case_name>` — writes `prisma/migrations/<ts>_<name>/migration.sql`
   and applies nothing. **Read the SQL.** Add by hand anything Prisma can't express (below).
3. `pnpm db:migrate` — applies it to the local DB. Commit the folder with the schema change.
4. Production: `pnpm prisma migrate status` against it, then
   `MIGRATE_DEPLOY_HOST=<host> pnpm db:deploy`. Nothing applies migrations automatically —
   not the build, not Vercel.

Always go through `pnpm db:migrate` / `pnpm db:deploy` (`scripts/migrate.ts`), never bare
`prisma migrate dev`: when `migrate dev` finds drift it **offers to reset the database**,
and `.env` is sometimes pointed at production. The wrapper refuses any non-local host for
`migrate dev`, and makes `deploy` name a remote host explicitly. **Never `prisma db push`
or `prisma migrate reset`** either — a push changes the schema without a migration, which is
exactly the drift that broke the history last time.

**Objects Prisma can't see** — listed in Part 2 of `0_baseline/migration.sql`: the partial
unique index `Book_isbn_key`, the accent-insensitive `idx_book_*` / `idx_genre_name_unaccent`
search indexes, the `orders_billed_requires_bill` CHECK, the functions
`immutable_unaccent` / `search_fold` / `user_search_key_trigger` / `refresh_search_vocabulary`,
the `user_search_key` trigger, the `search_vocabulary` materialized view, the role's
`idle_in_transaction_session_timeout`, and the `unaccent` / `pg_trgm` extensions. Prisma
never creates, changes or drops them, so change them in a hand-edited migration. The view
and trigger read `User` and `Book` columns (names, title, author, `deletedAt`…): a migration
that renames or retypes one of those must drop and recreate the view in the same file, or it
fails on Postgres.

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
| trash / recycle bin (audio) | Corbeille | `DeletedAudioTrack`; `/admin/audio-corbeille`; `lib/audio/trash.ts` |

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
(none currently active). Keep them self-contained with the rollback written next to the flag,
so reverting is one edit rather than an archaeology dig.

### Who can create which users
`POST /api/user` lets `admin` and `super_admin` create non-login records (auditeurs,
lecteurs, bienfaiteurs). Creating a **login-capable account** — `accessLevel: admin` or
`super_admin`, i.e. a permanent — is `super_admin`-only (`isLoginAccount` check in
`app/api/user/route.ts`), consistent with "`accessLevel` only ever moves under a super admin"
above. The `/admin/users/permanents` tab's "Ajouter un membre" button is hidden from plain
admins for the same reason; other tabs show it to any admin.

## The mode d'emploi follows the code (IMPORTANT)

`content/aide/*.md` is the **single source** for the user guide (in-app help at
`/admin/aide/<slug>` and the printable PDF) — never `user_guide/*.pdf|docx`, which is a
frozen original kept for reference only. **Changing a documented flow means updating its
section in the same commit**: prose drift isn't caught by any build check, only by this
rule. Full details — the file-to-section map, slug/link conventions, `pnpm aide:check`, and
the PDF-render traps in `AideGuidePDF.tsx` — live in `.claude/rules/aide-guide.md` and load
automatically whenever you touch `app/`, `lib/`, or `components/`.

## General notes for Claude

- Prefer minimal, targeted diffs that match existing patterns over broad rewrites.
- Reuse the existing kit: form bases, `EntitySearchCombobox`, the enum label maps, the
  `types/models` select configs. Don't hand-roll a search popover or a fetch shape.
- Append-only tables: **insert only** (list above).
- Don't read secret files (`.env*`); real values live outside version control.
- Commit directly to `main` on this repo — no feature branch, no PR, unless asked.
