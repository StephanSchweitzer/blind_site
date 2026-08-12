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

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Prisma 7** ORM — config lives in `prisma.config.ts` (new architecture), using
  `@prisma/adapter-pg`. Do **not** reintroduce the legacy `datasource`-block-only pattern.
- **PostgreSQL**, hosted on **Supabase** in production
- **Backblaze B2** (S3-compatible API, via `@aws-sdk/client-s3`) for the audio corpus —
  **not** AWS S3. **Vercel Blob** holds only Polly blurbs and small `upload-audio` clips.
- **AWS Polly** for speech synthesis; **Resend** (+ React Email) for transactional mail
- **pnpm** is the package manager (`packageManager: pnpm@10.9.0`) — use `pnpm`, not `npm`/`npx`.
- Deployed on **Vercel**

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

House style for French copy: always « aux ECA », never « à l'ECA ». Say *demande*, never
*commande*, anywhere a user can read it.

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
| treasurer | Trésorière | `memberType: tresoriere` |
| user / person / member | Personne / Membre | `User` model; `/admin/users`; `/api/user` |
| catalogue / books | Catalogue / Livres | `Book` model; `/admin/books`; `/api/books`; public `/catalogue` |
| staff picks / book list | Coups de cœur / "Liste des Livres" | `CoupsDeCoeur` model; `/admin/manage_coups_de_coeur`; `/api/coups-de-coeur`; public `/coups-de-coeur` |
| orders / requests | Demandes | `Orders` model; `/admin/orders`; `/api/orders` *(formerly `commandes`)* |
| assignments | Attributions | `Assignment` model; `/admin/assignments`; `/api/assignments` *(formerly `affectations`)* |
| bill / invoice | Facture | `Bill` model; `/admin/bills`; `/api/bills` |
| payments | Paiements | `Payment` model; `/admin/payments`; `/api/payments` |
| news | Dernières infos | `News` model; `/admin/news`; `/api/news`; public `/dernieres-infos` |
| duplicates / merge queue | Doublons | `Book.needsReview` / `id_arbre`; `/admin/review`; `BookMergeEvent` |
| orphaned audio folders | Audio orphelin | `OrphanAudioFolder`; `/admin/audio-orphelins`; `/api/audio-orphans` |
| audio tracks / recordings | Pistes / Enregistrement | bucket objects; `/api/books/[id]/audio/*`; `lib/audio/` |
| trash / recycle bin (audio) | Corbeille | `DeletedAudioTrack`; `lib/audio/trash.ts` |
| availability / planning | Disponibilités | `/admin/disponibilites`; `/api/availability`; `lib/users/availability.ts` |
| stats / audit log | Statistiques / Journal | `AuditEvent`; `/admin/stats`; `/api/stats/*`; `lib/audit/` |
| site content pages | Pages | `SiteContact`, `TeamMember`, `HistoryEvent`, `PracticalInfo`, `MembershipOption` |

**Two separate "admin" axes — don't conflate them:**
- `accessLevel` (permission): `member` → "Membre", `admin` → **"Permanent"**, `super_admin` → "Super Admin".
- `memberType` (role): includes `administration` → **"Administrateur"**, a *role* distinct from the
  `admin` *access level*. A "permanent" (access level `admin`) is not the same as an "administrateur"
  (member type). When the user says **"admins"/"permanents"** they mean `accessLevel: admin`.

Enum-to-label maps live in `lib/user-enums.ts` (member types, access levels, save types,
languages, delivery methods), `lib/user-activity-enums.ts` (activity status),
`lib/payment-enums.ts` (payment type/method), `lib/billing-enums.ts` (bill status:
`DRAFT`→"Brouillon", `BILLED`→"Émise", `PAID`→"Payée", `SOLDE`→"Soldée", **plus** the
separate `Orders.billingStatus`: `UNBILLED`→"Non facturé", `BILLED`→"Facturé",
`UNBILLABLE`→"Non facturable"), and `lib/audio-enums.ts` (audio link status labels/hints/
colors, `AUDIO_TRACK_ACTION_LABELS`, plus `bookHoldsTracks` / `isDoubleRecording`). These
are the source of truth for French labels — reuse them, don't hardcode French strings.
Stats-only labels (metric names) live in `app/admin/stats/stats-utils.ts`, which re-exports
the audio-action labels as `AUDIO_ACTION_LABEL` for its existing call sites.

**A diff in the journal des modifications words its enum values through the same maps**:
`ENUM_VALUE_LABELS` in `lib/audit/labels.ts` maps `Model.champ` → label map, and
`formatAuditValue(value, model, field)` uses it. Keyed on the model as well as the field
because `type` is a `PaymentType` on a Payment and a `NewsType` on a News. Add an entry
there whenever you add an enum column to an audited model, or the journal will print the
raw value.

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

## Business rules

### Audio storage (`lib/audio/`) — handle with care

The recordings are frequently the **only copy in existence**. Every rule here exists because
of that.

- **Import `./bucket`, never `./bucket-core`.** The `-core` files (`bucket-core.ts`,
  `measure-core.ts`) deliberately omit `import 'server-only'` so the `scripts/` can run them
  under plain Node. App code must go through the guarded wrapper, which is what turns an
  accidental client import into a build error. Don't add a second implementation of anything
  in a script — that's how a backfill and a button end up disagreeing.
- **`refreshBookAudioState()` (`lib/audio/state.ts`) is the single writer** of
  `Book.audioLinkStatus` / `audioTrackCount` / `audioSizeKb` / `audioCheckedAt` /
  `readingDurationMinutes`. Every mutating audio path calls it. Don't write those columns
  from a route, and don't skip the call.
- **Never delete a bucket object directly.** Removal goes through `softDeleteTrack` /
  `softDeleteTracks`: copy to `corbeille/`, verify the copy at the right size, write the
  `DeletedAudioTrack` row, *then* remove the original. The only real deletion is the nightly
  retention purge (`lib/audio/purge.ts`). Rename is the same copy-verify-delete sequence —
  S3/B2 has no rename primitive.
- **Re-check every client-supplied key** with `resolvePrefix` + `isKeyInsidePrefix` at each
  write entry point. The browser sends back keys it got from a listing; a crafted request
  must not be able to name another book's track.
- **Never rename existing keys.** Playback order comes from `naturalCompare` over the whole
  filename, and the corpus has no uniform track numbering. New uploads are named by
  `nextTrackName` (`lib/audio/naming.ts`), which guarantees the name **sorts after** the
  folder's current last track or throws. A track that sorts into the middle plays an
  audiobook's chapters out of order.
- **AppleDouble stubs (`._name.ext`) are not tracks.** Filter with `isAudioKey` on read and
  refuse with `isAppleDoubleName` on write — both directions, one definition.
- **Bytes never transit Vercel.** Uploads are presigned PUTs straight to B2 (`upload-url` →
  browser PUT → `commit`); downloads and the folder zip are presigned GETs. Don't add a route
  that proxies audio.
- **B2 answers a share of requests with 5xx by design.** Anything that loops over objects
  needs retry/backoff (`lib/audio/measure-core.ts`, `hooks/useAudioUpload.ts`) and bounded
  concurrency (`pool` from `lib/concurrency.ts`) — not an unbounded `Promise.all`.
- Durations are read from **header bytes** (`lib/audio/duration-probe.ts`), cached in
  `AudioTrackDuration` keyed on filename **and size**. `Book.readingDurationMinutes` is only
  written when **every** current track resolves — a partial sum silently understates a
  recording that reaches the public catalogue.

### Audit trail (`lib/audit/`)

- **Never add a per-action logging call.** A Prisma client extension turns every write to an
  audited model into an `AuditEvent` automatically, precisely so no future route can forget.
  If a new model should be traced, add it to `AUDITED_MODELS` in `lib/audit/config.ts` —
  that's the whole change.
- Wrap a write in `withoutAudit()` only when the event provably could never survive (pure
  derived/noise fields, e.g. the cache columns in `refreshBookAudioState`). Scope it to the
  one statement — never around a block that also makes a real decision.
- `$queryRaw` / `$executeRaw` bypass the extension entirely. If you use raw SQL to change
  business data, you are outside the trail; say so, or don't.
- Retention self-trims (14 days, 7 under table pressure). See the 500 MB ceiling above.

### Append-only tables — insert only, never update or delete

`BillEvent`, `OrderEvent`, `AssignmentEvent`, `UserActivityEvent`, `BookMergeEvent`,
`AuditEvent`, `AudioTrackEvent`.

`AudioTrackDuration` is **not** one of these — it is a cache and is updated in place.

### Billing and pricing (handle with care)

- The **tarif is derived from the recording's weight** (`lib/pricing.ts`): 3 € per started
  700 Mio block, minimum one CD. It is a *proposal* — the field stays hand-editable.
- `repriceOpenOrdersForBook` (`lib/pricing-sync.ts`) is called **from
  `refreshBookAudioState`**, i.e. the one function every weight-changing path already goes
  through. Don't call it from a route: the next audio route written would forget.
- It only touches demandes matching `ADJUSTABLE_ORDER_WHERE` (unbilled, on no facture or on a
  `DRAFT` one). An issued facture has been printed and sent; a paid or soldée one is locked.
- Bill totals **auto-recompute** — don't hand-edit derived totals.
- Bills **lock** once status is `PAID` or `SOLDE`. Do not mutate a locked bill's line items
  or amounts.
- Exporting a PDF from a `DRAFT` bill triggers a confirmation dialog before proceeding.
- `components/ui/admin/BillPDF.tsx` uses adaptive density spacing for layout — preserve that
  logic when editing.
- An attribution may only reach « Terminé » once its book has **weighed** audio
  (`bookHasWeighedAudio`) — "there are files" is not the same claim as "we know what they
  weigh", and only the second makes a facture correct. The guard fails closed on a storage
  outage, and says so rather than reporting an empty folder.

### User activity status
- Status is a `UserActivityStatus` enum; history is tracked in **`UserActivityEvent`**, which
  is **append-only** — never mutate or delete existing events.
- Deactivating a user auto-sets `isAvailable = false` (sync guard in
  `app/api/user/[id]/activity/route.ts`). Keep this invariant.
- Indisponibilités expire on their own: `/admin/disponibilites` closes due ones on load, and a
  nightly cron does the same. Both go through `lib/users/expireUnavailability.ts`.

### Status sync
- `lib/statusSync.ts` holds the guard functions enforcing the demande/attribution status state
  machine. An attribution owns its reader and send/return dates; a demande may only sync a
  status onto its attribution when that status stays consistent with those attribution-owned
  fields — sync is intentionally **asymmetric**, not a free bidirectional mirror. Be very
  careful editing it — changes here can cascade. Don't remove the guards.
- **The recording statuses travel upwards only.** « En cours » describes a book out with a
  lecteur, so it's never typed on a demande: `guardManualEnCours` rejects it on a demande with
  no attribution, and the demande form renders the option disabled with the reason.
- **Finishing an attribution no longer closes its demande.** An attribution « Terminé » pushes
  the demande to « Attente envoi vers auditeur » (`STATUS.ATTENTE_AUDITEUR`, demande-only like
  `SOLDE` — see `isOrderOnlyStatus` / `orderStatusForAssignmentStatus`). The retour du lecteur
  and the envoi à l'auditeur are different events; closing the demande stays a human act, which
  is what makes its `closureDate` the day of the expédition. Filter demandes on that status to
  get the shipping worklist.
- **`SOLDE` is retired as a workflow status** — it belongs to factures (`BillingStatus.SOLDE`).
  The `Status` row still exists so the guards can recognise and refuse it; neither a demande
  nor an attribution may be set to it.
- **`A_FAIRE` is duplication-only.** A duplication owns no attribution, so the recording
  statuses say nothing true about it — its lifecycle is « À faire » → « Terminé », enforced by
  `guardDuplicationStatus`.

### Public pages and cache invalidation
- The editorial content of `Contact`, `Équipe`, `Historique`, `Informations pratiques` and
  `Nous rejoindre` is **DB-backed**, edited under `/admin`, with drag-and-drop ordering.
  Content isn't hardcoded.
- Cached public reads are tagged from **one registry**, `lib/cache-tags.ts`. After a
  successful write (never before), call `revalidatePublic(tag, path)` — or
  `revalidateCatalogue()` for a book/genre change, which invalidates the catalogue *and* the
  coups de cœur, since books are embedded in the latter.
- Admin mutations call `revalidateAdmin()`, which marks the whole `/admin` subtree stale —
  status propagates between demandes, attributions and factures, so one write can move rows
  in several tables.
- `Book.hiddenFromCatalogue` hides a title from the public site only; it stays fully usable in
  the back office. Public queries must respect it.

### Temporary toggles
`lib/feature-flags.ts` holds leadership-requested switches that are expected to be reverted
(currently `ADMINS_CAN_CREATE_USERS = false`). Keep them self-contained with the rollback
written next to the flag, so reverting is one edit rather than an archaeology dig.

## Maintenance scripts (`scripts/`)

Standalone `tsx` scripts for auditing and backfilling the corpus. Conventions to follow if
you add one:

- Open with a doc comment giving the **exact invocation lines** and stating plainly whether
  it writes to the database, the bucket, both, or neither. Most are read-only; say so.
- Default to a **dry run**; require `--apply` / `--confirm` to write.
- Be **safe to interrupt and re-run** — commit per unit of work and skip what's already done.
- Get the connection string from `scriptDatabaseUrl()` (`scripts/db-url.ts`).
- Import shared logic from `lib/` (the `-core` variants where a `server-only` guard would
  break under plain Node). Never fork a second copy of a rule into a script.

Frequently relevant: `sync-audio-links.ts` (full bucket↔DB reconciliation; follow a full run
with `backfill-order-costs.ts`, since it writes the weight columns in raw SQL and therefore
doesn't re-tarify), `backfill-audio-durations.ts`, `report-damaged-audio.ts`,
`compare-audio-folders.ts`, `set-audio-cors.ts` (the B2 CORS rule browser uploads depend on).

## Folder structure

```
app/
  (public pages)/       Home, catalogue, coups-de-coeur, dernieres-infos, nous-connaitre…
  admin/                Back office. Beyond the CRUD screens: review (doublons),
                        audio-orphelins, disponibilites, stats, and the CMS page editors
  api/                  Route handlers — REST CRUD per entity, books/[id]/audio/*,
                        stats/*, availability/*, cron/*, Polly/Google Books/upload-audio
  auth/                 Sign-in and forced password-change flows
  generated/prisma/     Generated Prisma client (custom output, see prisma.config.ts)
  sitemap.ts robots.ts  SEO surface
components/
  *.tsx                 App-specific components (navbars, BookModal, AudioRecorder, Markdown…)
  ui/                    shadcn/ui primitives
  ui/admin/              Back-office kit: layout primitives, form bases, modals, audio
                         manager, BillPDF
  admin/                 IconPicker / ThemePicker for the CMS editors
  emails/                React Email templates (sent via lib/email/sendEmail.ts)
hooks/                  React hooks (entity search, audio upload/zip, activity guard, toasts…)
lib/
  audio/                 Bucket access, naming, state cache, corbeille, duration probes
  audit/                 Prisma-extension audit trail, retention, labels
  auth/                  withAuth / withAdmin guards
  books/ orders/ users/  Domain helpers (audio filters, duplication, availability…)
  email/                 sendEmail chokepoint + templated senders
  *.ts                   billing, pricing, pricing-sync, statusSync, stats, cotisation,
                         cache-tags, revalidate-*, concurrency, feature-flags, enums
prisma/                 schema.prisma, migrations, seed, dev-claude-user
scripts/                Audio audits, backfills, probes, one-off maintenance
types/                  models / api / shared type barrels (re-exported from types/index.ts)
middleware.ts           Auth gating + forced password change
prisma.config.ts        Prisma 7 config (adapter-pg, migrations path)
vercel.json             Cron schedules
```

## Code style / lint

Respect the existing ESLint config. Rules that have bitten this repo before:
- `react-hooks/set-state-in-effect` — avoid unguarded `setState` inside effects
- `static-components` — don't define components inside render
- `error-boundaries` — keep error boundary usage intact

Comments in this codebase explain **why**, not what, and are often long where the reasoning
was expensive (see `lib/audio/*`, `lib/statusSync.ts`). Match that when you touch those
files; don't strip a comment that records a decision.

## General notes for Claude

- Prefer minimal, targeted diffs that match existing patterns over broad rewrites.
- Reuse the existing kit: form bases, `EntitySearchCombobox`, the enum label maps, the
  `types/models` select configs. Don't hand-roll a search popover or a fetch shape.
- Append-only tables: **insert only** (list above).
- Don't read secret files (`.env*`); real values live outside version control.
- Commit directly to `main` on this repo — no feature branch, no PR, unless asked.
