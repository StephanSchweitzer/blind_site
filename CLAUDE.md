# ECA Portal

Internal management portal for **ECA (Les Auxiliaires des Aveugles)**, a French nonprofit
producing audiobooks for visually impaired readers. The portal manages readers/volunteers,
books, requests (*demandes*), assignments (*attributions*), billing, and payments.

The domain is **French**. UI copy, enum labels, and terminology are in French — keep new
user-facing strings in French and match existing wording.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Prisma 7** ORM — config lives in `prisma.config.ts` (new architecture), using
  `@prisma/adapter-pg`. Do **not** reintroduce the legacy `datasource`-block-only pattern.
- **PostgreSQL**
- **AWS** for audio storage (S3) and email
- **pnpm** is the package manager (`packageManager: pnpm@10.9.0`) — use `pnpm`, not `npm`/`npx`.
- Deployed on **Vercel**

## Commands

- `pnpm dev` — local dev server (`next dev`)
- `pnpm build` — production build (`prisma generate && next build`)
- `pnpm start` — serve the production build (`next start`)
- `pnpm lint` — ESLint (`eslint . --ext .js,.jsx,.ts,.tsx`)
- `pnpm prisma migrate dev` — apply/create migrations
- `pnpm prisma generate` — regenerate client
- `pnpm prisma studio` — inspect the DB
- `pnpm dev:claude-user` — (re)create the local dev sign-in account, see below

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

Only **one** dev server should ever be running on this project. A live `next dev` holds a lock
on `.next/` (Windows keeps the build output and the `.next/trace` / SWC files open), so a second
agent that starts its own server either fails or silently falls back to another port — leaving
stale servers, split state, and a `.next` directory nobody can clean.

Rules:

1. **Before starting a server, reuse the running one.** Call `preview_list` first. If a `dev`
   server is already up, `preview_start` the `dev` config again (it reuses the existing process)
   or just `navigate` to it — do **not** start a second server and do **not** launch it on
   another port.
2. **Never run the dev server through Bash/PowerShell** (`pnpm dev`, `next dev`, `start-process`…).
   Always go through `preview_start` so the process is tracked and can be stopped.
3. **When your changes are finished and verified, stop the server** with
   `preview_stop { serverId }` for every server id `preview_list` reports. Do this at the end of
   the task — before you report back — not "later". Stopping it releases the `.next` lock so the
   next agent can start cleanly on port 3000.
4. If a lock survives anyway (`EPERM`/`EBUSY` on `.next`, or port 3000 reported busy with no
   server in `preview_list`), an orphaned node process is holding it. Kill it, then delete the
   stale build output:

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   Remove-Item -Recurse -Force .next
   ```

   Only remove `.next` after the process is gone — it is regenerated on the next `pnpm dev`.

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

## Glossary — English ↔ French UI ↔ code

When the user says the English term on the left, they mean the entity on that row. Use this to
stay on the same page instantly. "Code identifier" is the Prisma model / route / enum value —
these mostly kept their original English names even though the French rename happened.

| English (what the user says) | French UI term | Code identifier (model / route / enum) |
|---|---|---|
| listeners / the visually impaired | Auditeurs *(sing. auditeur)* | `memberType: auditeur`; users tab `auditeurs` *(legacy `ecouteur` → displays as Auditeur)* |
| readers | Lecteurs *(lecteur)* | `memberType: lecteur`; users tab `lecteurs` |
| admins / staff | Permanents *(permanent)* | `accessLevel: admin` **(label "Permanent")**; users tab `permanents` |
| donors / benefactors | Donateurs *(bienfaiteur)* | `memberType: bienfaiteur` **(label "Donateur")**; users tab `bienfaiteurs` |
| user / person / member | Personne / Membre | `User` model; `/admin/users`; `/api/user` |
| catalogue / books | Catalogue / Livres | `Book` model; `/admin/books`; `/api/books`; public `/catalogue` |
| staff picks / book list | Coups de cœur / "Liste des Livres" | `CoupsDeCoeur` model; `/admin/manage_coups_de_coeur`; `/api/coups-de-coeur`; public `/coups-de-coeur` |
| orders / requests | Demandes | `Orders` model; `/admin/orders`; `/api/orders` *(formerly `commandes`)* |
| assignments | Attributions | `Assignment` model; `/admin/assignments`; `/api/assignments` *(formerly `affectations`)* |
| bill / invoice | Facture | `Bill` model; `/admin/bills`; `/api/bills` |
| payments | Paiements | `Payment` model; `/admin/payments`; `/api/payments` |
| news | Dernières infos | `News` model; `/admin/news`; `/api/news`; public `/dernieres-infos` |

**Two separate "admin" axes — don't conflate them:**
- `accessLevel` (permission): `member` → "Membre", `admin` → **"Permanent"**, `super_admin` → "Super Admin".
- `memberType` (role): includes `administration` → **"Administrateur"**, a *role* distinct from the
  `admin` *access level*. A "permanent" (access level `admin`) is not the same as an "administrateur"
  (member type). When the user says **"admins"/"permanents"** they mean `accessLevel: admin`.

Enum-to-label maps live in `lib/user-enums.ts` (member types, access levels, save types,
languages), `lib/user-activity-enums.ts` (activity status), `lib/payment-enums.ts` (payment
type/method), and `lib/billing-enums.ts` (bill status: `DRAFT`→"Brouillon", `BILLED`→"Émise",
`PAID`→"Payée", `SOLDE`→"Soldée"). These are the source of truth for French labels — reuse
them, don't hardcode French strings.

## Security conventions (non-negotiable)

- **Every API route is guarded.** Wrap handlers in `withAuth` (authenticated) or `withAdmin`
  (admin-only) — both live in `lib/auth/guards.ts`. Never ship an unguarded route.
- **AWS credentials are server-side only.** No AWS keys or SDK calls in client components.
  All S3 / email operations happen on the server.
- **All outbound email goes through the centralized `sendEmail` chokepoint** (`lib/email/sendEmail.ts`).
  Do not call the email provider (SES/etc.) directly from routes or components — always route
  through it.

## Business rules

### Billing (handle with care)
- Bill totals **auto-recompute** — don't hand-edit derived totals.
- Bills **lock** once status is `PAID` or `SOLDE`. Do not mutate a locked bill's line items
  or amounts.
- Every bill mutation is recorded in the **`BillEvent` audit log**, which is **append-only** —
  insert events, never update or delete them.
- Exporting a PDF from a `DRAFT` bill triggers a confirmation dialog before proceeding.
- `components/ui/admin/BillPDF.tsx` uses adaptive density spacing for layout — preserve that
  logic when editing.

### User activity status
- Status is a `UserActivityStatus` enum; history is tracked in **`UserActivityEvent`**, which
  is **append-only** — never mutate or delete existing events.
- Deactivating a user auto-sets `isAvailable = false` (sync guard in
  `app/api/user/[id]/activity/route.ts`). Keep this invariant.

### Status sync
- `lib/statusSync.ts` holds the guard functions enforcing the demande/attribution status state
  machine. An attribution owns its reader and send/return dates; a demande may only sync a
  status onto its attribution when that status stays consistent with those attribution-owned
  fields — sync is intentionally **asymmetric**, not a free bidirectional mirror. Be very
  careful editing it — changes here can cascade. Don't remove the guards.

### CMS pages
- Some pages (`Historique`, `Informations pratiques`, `Nous rejoindre`) are **DB-backed**,
  with drag-and-drop ordering and **on-demand cache invalidation**. Content isn't hardcoded.

## Folder structure

```
app/
  (public pages)/       Home, catalogue, coups-de-coeur, dernieres-infos, etc.
  admin/                Authenticated back office (orders, assignments, bills, payments, users…)
  api/                  Route handlers — REST CRUD per entity + Polly/Google Books/upload-audio
  auth/                 Sign-in and forced password-change flows
  generated/prisma/     Generated Prisma client (custom output, see prisma.config.ts)
components/
  *.tsx                 App-specific components (navbars, BookModal, AudioRecorder…)
  ui/                    shadcn/ui primitives
  ui/admin/              Back-office kit: layout primitives, form bases, modals, BillPDF
  emails/                React Email templates (sent via lib/email/sendEmail.ts)
hooks/                  React hooks (book search, activity guard, toasts…)
lib/                    Auth guards, billing, statusSync, prisma client, email, enums
  auth/                  withAuth / withAdmin guards
  email/                 sendEmail chokepoint + templated senders
  users/                 User-related helpers (address formatting, deletion guard…)
prisma/                 schema.prisma, migrations, seed
types/                  models / api / shared type barrels (re-exported from types/index.ts)
middleware.ts           Auth gating + forced password change
prisma.config.ts        Prisma 7 config (adapter-pg, migrations path)
```

## Code style / lint

Respect the existing ESLint config. Rules that have bitten this repo before:
- `react-hooks/set-state-in-effect` — avoid unguarded `setState` inside effects
- `static-components` — don't define components inside render
- `error-boundaries` — keep error boundary usage intact

## General notes for Claude

- Prefer minimal, targeted diffs that match existing patterns over broad rewrites.
- Append-only tables (`BillEvent`, `UserActivityEvent`): **insert only**.
- Don't read secret files (`.env*`); real values live outside version control.
