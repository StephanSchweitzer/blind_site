# ECA — Site & portail d'administration

Web application for **ECA — Enregistrements à la Carte pour les Aveugles**, a French nonprofit (a délégation of the *Auxiliaires des Aveugles*) that records books and documents on demand for blind and visually impaired listeners, pairing them with trained volunteer readers.

The repository is a single Next.js (App Router) codebase that contains **two distinct applications**:

1. **The public site** — the association's outward-facing website: presentation, catalogue, staff picks, news, and membership info. Its editorial content is database-backed and edited from the back office.
2. **The admin back office** (`/admin`, authenticated) — the internal tool staff use to run operations: members, book catalogue, demandes, attributions, billing, payments, **the audio corpus**, and the audit trail.

🔗 **Live:** [https://eca-aveugles.fr/](https://eca-aveugles.fr/)

---

## 1. Public site

Server-rendered French pages sharing a common `Frontend-Navbar`, glassmorphism styling, and light/dark theming. Every page declares its own metadata, and `app/sitemap.ts` / `app/robots.ts` publish the SEO surface.

| Route | Purpose |
|---|---|
| `/` | Home. Presents ECA and its à-la-carte recording service — the human bridge between sighted volunteer readers and visually impaired listeners. |
| `/catalogue` | Public, paginated, searchable browse of the audiobook catalogue, filterable by genre. Server-fetches the first page then hydrates a client component for search/pagination. Books flagged `hiddenFromCatalogue` never appear here. Audio descriptions can be synthesized via AWS Polly. |
| `/listes-de-livres` | "Staff picks" (known internally as *Liste des Livres*) — curated book selections with descriptions and an audio player. Paginated one selection at a time, exportable to PDF with editor, page count and duration. |
| `/dernieres-infos` | News/announcements feed. Client page querying `/api/news` with search + type filters (Général, Événement, Annonce, Actualité, Programmation). |
| `/nous-connaitre/equipe` | "Our team" — **DB-backed** (`TeamMember`), edited at `/admin/team`. |
| `/nous-connaitre/historique` | "Our history" — **DB-backed** timeline (`HistoryEvent`), edited at `/admin/historique`. |
| `/nous-connaitre/informations-pratiques` | "Practical info" — **DB-backed** steps (`PracticalInfo`), edited at `/admin/informations-pratiques`. |
| `/nous-rejoindre` | Membership page — **DB-backed** (`MembershipOption`), edited at `/admin/nous-rejoindre`. |
| `/contact` | Address, phone, email and transit directions — **DB-backed** singleton (`SiteContact`), edited at `/admin/site-contact`. |
| `/formulaire-adhesion` | Membership form — currently a placeholder "en développement" landing page. |

### Caching model

The public pages are statically served and read through `unstable_cache`, tagged from a single registry (`lib/cache-tags.ts`: `catalogue`, `coups-de-coeur`, `news`, `site-contact`, `team`, `historique`, `informations-pratiques`, `nous-rejoindre`). Write routes call `revalidatePublic(tag, path)` (`lib/revalidate-public.ts`) **after** a successful mutation — `revalidateTag(tag, 'max')` for the Data Cache plus `revalidatePath` for the client Router Cache. A book or genre edit invalidates both the catalogue and the coups de cœur, since books are embedded in the latter (`revalidateCatalogue()`).

The admin equivalent is `revalidateAdmin()` (`lib/revalidate-admin.ts`), which marks the whole `/admin` subtree stale — demandes, attributions and factures propagate status between each other, so a single mutation can move rows in several tables at once.

## 2. Authentication

| Route | Purpose |
|---|---|
| `/auth/signin` | Staff sign-in (NextAuth credentials). |
| `/auth/change-password` | Forced password change. New accounts are created with `passwordNeedsChange: true`; `middleware.ts` redirects them here until they set a real password. |
| `/auth/password-changed-success` | Confirmation screen after a successful password change. |
| `/auth/forgot-password` | Request a reset link. Reachable signed out, and answers identically whatever the address is, so it cannot be used to enumerate accounts. |
| `/auth/reset-password` | Set a new password from a link's single-use token (30 min, SHA-256 at rest, re-checked against the account's *current* access level). |

Access control lives in `middleware.ts` (protects `/admin/*`, `/profile`, `/auth/change-password`) and in `lib/auth/guards.ts`, which exports the `withAuth` / `withAdmin` / `withSuperAdmin` route wrappers plus `getCurrentUser` / `isAdmin` / `isSuperAdmin`.

**Every API route is guarded, but not all of them by a wrapper.** The exceptions are deliberate and each says so in its own header comment — treat anything *not* on this list as a bug:

- **Public by necessity** — `password-reset` and `password-reset/confirm` (someone locked out cannot authenticate; knowledge of the single-use token *is* the authentication), and `auth/[...nextauth]`.
- **Public reads serving public pages** — `polly`, `news/search`, `listes-de-livres/preview` and `listes-de-livres/position`. They take reference input only, and respect `hiddenFromCatalogue` like every other public query.
- **Secret-authenticated** — `cron/*`, on `CRON_SECRET` (§7).
- **Guarded by hand rather than by a wrapper**, because the rule isn't a flat access level: `user/[id]` GET (admins see anyone; a member only their own record, capped at `basic`) and `upload-audio` (`getCurrentUser` + `isAdmin`).

Everything else goes through a wrapper, which also opens the audit-actor scope — that is what puts a name on the writes underneath.

Two independent axes, easy to conflate:

- **`accessLevel`** (permission): `member` → « Membre », `admin` → **« Permanent »**, `super_admin` → « Super Admin ».
- **`memberType`** (role): `auditeur`, `lecteur`, `bienfaiteur` (« Donateur »), `administration` (« Administrateur »), `informaticien`, `tresoriere` (« Trésorière »), plus the legacy `ecouteur` which still renders as « Auditeur ».

Super-admin-only screens 404 or redirect rather than showing a 403 — `/admin/stats` in particular must not reveal that the URL exists.

## 3. Admin back office (`/admin`)

Isolated from the public layout via its own `layout.tsx` + `Backend-Navbar`, grouped into **Livres**, **Gestion**, **Membres** and **Pages**. The landing page is a dashboard of live counts.

### Livres

| Route | Purpose |
|---|---|
| `/admin/books`, `/books/new`, `/books/[id]` | Catalogue CRUD. Search with availability pills, audio-presence and "hidden from catalogue" filters consolidated into a *Filtres* popover; create with ISBN check + Google Books lookup; per-book edit. |
| `/admin/genres` | Genre taxonomy applied to books. |
| `/admin/listes-de-livres` (+ `new`, `[id]`) | Build staff-pick selections: pick books, record a description, reorder, export to PDF. |
| `/admin/review` | **Doublons.** The duplicate-fusion queue, fed by `needsReview` / `id_arbre` from the Access import. Pairs a flagged book with its counterpart, shows the diff, and fuses on confirmation. A pair holding **two different recordings** cannot be fused: it is escalated instead (`escalatedAt` + an email via `lib/email/sendReviewEscalation.ts`) and left for a human. |
| `/admin/audio-orphelins` | **Audio orphelin.** Bucket folders no book points at, in three tabs — *à traiter*, *rattachés*, *écartés*. A folder can be listened to in place before being relinked, so a recording is never attached to the wrong catalogue entry on the strength of a folder name. Deleting a linked book re-opens its row as *à traiter* rather than letting it drop silently out of the queue. |

### Gestion

| Route | Purpose |
|---|---|
| `/admin/orders` | **Demandes** — listeners' recording requests: book, media format (required per ouvrage), delivery method, status, billing status, tarif. |
| `/admin/assignments` | **Attributions** — the work of recording a demanded book, tracked through a status state machine, with reader assignment/history and reception/sent/returned dates. |
| `/admin/bills` | **Factures** — invoices grouping billable demandes per client, with issue/payment tracking and a `BillEvent` audit trail. |
| `/admin/payments` | **Paiements** — payments recorded against clients/bills (cotisations, enregistrements, dons, divers). |
| `/admin/stats` | **Super-admin only.** Trend cards, a per-staff heatmap, a members chart and the 14-day audit journal, with a click-through detail drawer. Day/time maths is pinned to Europe/Paris. |

### Membres

| Route | Purpose |
|---|---|
| `/admin/users` → `/admin/users/[type]` | Member directory, tabbed by member type (auditeurs, lecteurs, bienfaiteurs, permanents). |
| `/admin/users/dossier/[id]` | A member's full dossier: profile plus sub-tabs for **attributions**, **demandes**, **factures** and **paiements**, with a cotisation status banner. |
| `/admin/disponibilites` | **Disponibilités** — planning view over member availability: a timeline of indisponibilités, a coverage chart, per-person editing without leaving the page, language filters, and a count of genuinely free lecteurs. Loading the page also closes any indisponibilité that has reached its term, so it is never cached. |
| `/admin/profile` | The signed-in staff member's own profile / password. |

### Pages (CMS, super-admin only)

`/admin/news`, `/admin/site-contact`, `/admin/team`, `/admin/historique`, `/admin/informations-pratiques`, `/admin/nous-rejoindre` — the editable content behind the public pages, with drag-and-drop ordering, an icon picker and a theme picker (`components/admin/IconPicker.tsx`, `ThemePicker.tsx`). Every save invalidates the matching public cache tag.

---

## 4. Audio storage (Backblaze B2)

The recordings are the association's most valuable and least replaceable asset: most are the only copy in existence. Everything in this section is shaped by that.

### The bucket

Storage is **Backblaze B2 through its S3-compatible API** — not AWS S3, and not Vercel Blob (which still holds only Polly blurbs and the small `upload-audio` clips). The bucket is **private**; nothing is ever served from a public URL.

Layout, inherited from the Access-era NAS and preserved verbatim:

```
dirt/<année>/<n° de dossier>  <titre>/<n° de tête> <n° de piste> <titre>.mp3
dirt/2022/21525  Le secret de l!abbé Saunière/1000 22- Le secret de l'abbé Saunière.mp3
corbeille/<bookId>/<timestamp>-<filename>            # soft-deleted tracks
```

`Book.audio_filepath` **is** the bucket prefix since the path backfill — no translation at read time. The folder number is the Access id (`source_access_id`), which is what lets the orphan screen match a folder back to a book.

### The upload / download workflow

**The bytes never transit Vercel.** A folder of forty tracks is several gigabytes; proxying that through a serverless function would be slow, metered and pointless.

```
browser ──① POST /api/books/[id]/audio/upload-url ──► server   (names files, signs PUT URLs)
        ◄── presigned PUT URLs + assigned filenames ───┘
browser ──② PUT ────────────────────────────────────► B2       (the actual bytes)
browser ──③ POST /api/books/[id]/audio/commit ─────► server   (HEAD-verifies each key,
                                                                refreshes the cached state)
```

Consequences that shape the code:

- **The server names the files, not the browser.** Playback order comes from `naturalCompare` over the whole filename, because the corpus has no uniform track numbering (`1000 22- Titre.mp3`, `1000  01 Titre.mp3`, date stamps like `1000 141201_1224.MP3`). `nextTrackName` (`lib/audio/naming.ts`) guarantees a new name **sorts after** the folder's current last track, or refuses — a track that sorts into the middle plays an audiobook's chapters out of order. **Nothing renames an existing key on its own** — no upload, backfill or repair ever touches one. The single exception is deliberate and manual: `PATCH /api/books/[id]/audio/track`, where an admin fixes a filename that is *itself* what puts the track in the wrong position (see *Deletion is a corbeille*), confirming the target by echoing its exact current name.
- **The Content-Type is decided server-side**, because the signature covers it and browsers guess differently.
- **`XMLHttpRequest`, not `fetch`**, in `hooks/useAudioUpload.ts` — fetch cannot report upload progress, and a 50 MB track with no progress bar looks hung. A `finalisation` phase covers the gap between the last byte leaving the machine and B2 acknowledging the write.
- **B2 answers a share of requests with 500/503 by design** (a full or offline storage vault means "ask for another one"). The AWS SDK absorbs this for server-side calls; the browser bypasses the SDK, so the retry layer is built by hand — retried PUTs, retried signing, retried verification, and a second full pass for files the server could not confirm. What survives all of that is reported per file, with the original filename and a sentence saying what to do.
- **A CORS rule allowing `s3_put` from the site origin is mandatory.** The B2 console cannot express "two specific origins + PUT", so `scripts/set-audio-cors.ts` sets it through `PutBucketCors`.
- **Downloads are presigned GETs** (1 h TTL), and `hooks/useAudioFolderZip.ts` zips a whole folder in the browser — streaming to disk via `showSaveFilePicker` where available, buffered into a Blob elsewhere (and the dialogue warns first). `client-zip` stores rather than deflates: MP3s do not compress.

### Deletion is a corbeille, not a delete

`lib/audio/trash.ts`. Removing a track **copies it to `corbeille/`, verifies the copy at the right size, writes the `DeletedAudioTrack` row, and only then removes the original**. B2 versioning exists but expires noncurrent versions after 30 days and cannot record *which portal user* deleted what.

- Bulk deletion (`softDeleteTracks`) is one operation, not a loop: copies run pooled, rows go in two `createMany` calls, originals leave in one `DeleteObjects` call, and the folder placeholder + state refresh happen once. A 77-track folder costs ~20 sequential steps instead of ~900.
- It is **resumable** — already-parked tracks are skipped, so a timed-out call can simply be made again.
- Emptying a folder writes a `.bzEmpty` placeholder so the prefix survives; otherwise "an admin emptied this" (`FOLDER_EMPTY`) would read as "this book's path points nowhere" (`FOLDER_MISSING`).
- Restoring refuses to overwrite an occupied key.
- A **nightly purge** (14 days) really removes the bucket object. Every row that predates the purge shipping carries `retainForever = true`, so the "restorable at any time" promise already shown for those deletions keeps holding.

Renaming (`lib/audio/rename.ts`) is the same copy-verify-delete sequence — S3/B2 has no rename primitive.

### AppleDouble stubs

The corpus was migrated through a Mac, which writes a `._name.ext` beside every file copied onto a non-Mac filesystem. Those stubs carry the audio extension and none of the content: they were counted as tracks, doubling the reported count of ~160 books and blocking their duration outright (a total is refused unless every track resolves). They are now ignored on read (`isAudioKey`), refused on upload (`isAppleDoubleName`), and the ~1 856 already stored were removed by `scripts/purge-apple-double.ts` — which checks the name, the size **and** the AppleDouble magic number `00 05 16 07` before deleting anything.

### Durations, measured from header bytes

`lib/audio/duration-probe.ts` reads a track's playback length out of its own header — MP3 Xing/VBRI frame counts, MPEG CBR bitrate, MP4 `mvhd`, WAV byte rate, FLAC sample count. A 500 MB folder is measured with a few **ranged GETs of 16–64 KB**, not a transfer. `exact: true` means the encoder stated the count; `exact: false` is a bitrate estimate, only recorded once the file is confirmed constant-bitrate.

Results are cached per file in `AudioTrackDuration`, keyed on filename **and size** — a track replaced by a re-recording under the same name misses the cache and is re-measured. `Book.readingDurationMinutes` is written **only when every current track resolves**: a partial sum understates the recording, and this figure reaches the public catalogue and the Coup de cœur PDF. The « Recalculer » button (`POST /api/books/[id]/audio/duration`) is what made durations possible for the ~10 200 imported books that could never have an upload event.

### The cached state columns

`Book.audioLinkStatus` / `audioTrackCount` / `audioSizeKb` / `audioCheckedAt` are a **cache of the bucket**, refreshed in bulk by `scripts/sync-audio-links.ts` and on every mutating route through `refreshBookAudioState()` (`lib/audio/state.ts`) — the single writer, so the UI and the next nightly run agree instead of flip-flopping. Statuses: `OK`, `FOLDER_EMPTY`, `FOLDER_MISSING`, `NO_PATH`, `UNVERIFIED`.

Two guards apply to every key the client sends back: `resolvePrefix` forces a trailing slash (so `…/21525 Titre` cannot match `…/21525 Titre bis/`), and `isKeyInsidePrefix` re-checks containment at every write entry point rather than trusting the listing the browser was handed.

### Module layout, and the `-core` split

```
lib/audio/
  bucket-core.ts     S3/B2 client, listing, presigning, copy/delete  (no `server-only`)
  bucket.ts          `import 'server-only'` + re-export — what app code imports
  measure-core.ts    measuring one track from a range reader          (no `server-only`)
  measure.ts         server-only wrapper: bucket + AudioTrackDuration cache
  duration-probe.ts  pure header parsers (MP3/MP4/WAV/FLAC)
  naming.ts          upload naming rules, AppleDouble detection, folder prefixes
  folder-selection.ts turning a picked folder into an upload batch
  state.ts           refreshBookAudioState, prefix/containment guards
  trash.ts / trash-prefix.ts / purge.ts   corbeille + retention
  rename.ts          copy-verify-delete rename
```

The `-core` files omit `server-only` **on purpose**: the maintenance scripts run under plain Node, where `server-only` throws, and a second implementation is how a backfill and a button end up disagreeing about the length of the same file. The B2 credentials stay server-side either way — app code imports the guarded wrapper, and the browser only ever receives expiring presigned URLs.

## 5. Pricing, billing and the demande lifecycle

**The tarif is derived from the weight of the recording** (`lib/pricing.ts`): a CD holds 700 Mio, every started 700 Mio block costs 3 €, minimum one CD. It is always a *proposal* — the field stays hand-editable; it exists so large books stop being billed at the default.

`repriceOpenOrdersForBook` (`lib/pricing-sync.ts`) is called from `refreshBookAudioState`, i.e. the one function every path that can change the weight already goes through (upload, delete, restore, orphan relink, fusion). It only touches demandes that are still adjustable — `ADJUSTABLE_ORDER_WHERE`: unbilled, and on no facture or on a `DRAFT` one. An issued facture has been printed and sent; a paid or soldée one is locked.

The chain, in order:

```
audio deposited → book re-read, demande re-priced   (usually on no facture yet)
attribution « Terminé »                              (refused without weighed audio)
demande → « Attente envoi vers auditeur »            (automatic)
demande closed by hand, the day it ships             (closureDate = the expédition)
accrual onto a DRAFT facture
```

Status rules live in `lib/statusSync.ts` and are **deliberately asymmetric** — an attribution owns its reader and its send/return dates, so a demande may only push a status down when it stays consistent with those:

- `SOLDE` is retired as a workflow status (it belongs to factures) and `ATTENTE_AUDITEUR` is demande-only — both are `isOrderOnlyStatus`.
- « En cours » describes a book out with a lecteur, so it is never typed on a demande.
- `A_FAIRE` is duplication-only: a duplication owns no attribution and has a two-state lifecycle.
- **Finishing an attribution no longer closes its demande.** The retour du lecteur and the envoi à l'auditeur are different events; a recording that came back but was never sent stays visible instead of closing itself.

Bill totals auto-recompute, bills lock at `PAID`/`SOLDE`, and every mutation is recorded in the append-only `BillEvent` log. Exporting a PDF from a `DRAFT` bill triggers a confirmation dialog. Cotisation status is computed by the pure `lib/cotisation.ts` (usable from both server and client), and donateurs are never nagged about a cotisation they do not owe.

## 6. Audit trail

`lib/audit/*` installs a **Prisma client extension** that turns every write to an audited model into an `AuditEvent` row. There are deliberately **no per-action logging calls anywhere in the codebase** — a route that forgets to log is not possible.

- `create` → CREATE with `{ field: [null, value] }`; `update`/`upsert` → UPDATE with only the fields that *moved*; `delete` → DELETE with a full row snapshot; `updateMany`/`deleteMany` → one event per row up to a limit, then a single summary event.
- Audited models are the business core. **Not** audited: `AuditEvent` itself, the other append-only logs, machine-written tables rewritten wholesale by scripts, and the pure join tables. `AudioTrackEvent` is the deliberate exception — audio actions otherwise touch no audited row, since `refreshBookAudioState` writes are wrapped in `withoutAudit()`.
- Stated limits: `$queryRaw`/`$executeRaw` bypass the pipeline entirely; nested writes are captured on the parent's event; the event is written after the observed write succeeds, so the trail may over-report but never under-reports.
- **Retention is 14 days, dropping itself to 7** if the table alone gets fat enough to matter. The production database is a Supabase free tier — 500 MB, and it goes **read-only** past that, so an unbounded audit log would take the portal down.

`/admin/stats` reads it: bursts of related events are folded into one row, records are named rather than shown as bare ids, the journal is searchable, and only decisions are traced — observations are kept out.

## 7. Scheduled jobs

Declared in `vercel.json`, all three implemented under `app/api/cron/`:

| Cron | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/expire-unavailability` | `10 2 * * *` | Closes indisponibilités that have reached their term. |
| `/api/cron/purge-audit-events` | `40 2 * * *` | Drops `AuditEvent` rows past the retention window. |
| `/api/cron/purge-audio-trash` | `10 3 * * *` | Permanently removes corbeille objects past 14 days (`retainForever` rows exempt). |

All three accept Vercel's scheduler, which sends `Authorization: Bearer $CRON_SECRET`. **With no `CRON_SECRET` configured they refuse rather than standing open.**

The two purges additionally accept a **signed-in super admin**, so they can be forced from `/admin/stats` when the size warning appears. `expire-unavailability` does not, and does not need to: its on-demand equivalent is `POST /api/availability/expire` (`withAdmin`), the « Clôturer » button on `/admin/disponibilites`, which runs the same idempotent sweep.

## 8. API layer (`app/api`)

Standard REST CRUD per entity (`books`, `genres`, `news`, `orders`, `assignments`, `bills`, `payments`, `listes-de-livres`, `user`), plus:

**Audio**
- `books/[id]/audio` — ordered tracks with presigned playback URLs (`withAuth`: auditeurs are the audience).
- `books/[id]/audio/manage` — the same folder as the management dialogue needs it: raw keys, empty folders included (`withAdmin`).
- `books/[id]/audio/state` — the cached columns only; cheap enough to ask for on sight, for a badge.
- `books/[id]/audio/upload-url` — mints presigned PUTs, assigns filenames, creates the folder on explicit consent (never as a side effect), refuses a prefix that is already occupied.
- `books/[id]/audio/commit` — HEAD-verifies what landed; a wrong-size object is removed as a truncated upload.
- `books/[id]/audio/track` — delete one track (to the corbeille) or rename it; the caller must echo the exact filename back.
- `books/[id]/audio/tracks` — bulk delete of a whole folder; the caller must echo the track count, re-checked against a fresh listing.
- `books/[id]/audio/trash` — the corbeille for one book, with restore.
- `books/[id]/audio/duration` — « Recalculer »: measure from the bucket and rewrite the duration.
- `audio-orphans/[id]/tracks` — listen to an orphaned folder before relinking it. The prefix comes from the row, never the request.

**Stats & audit** — `stats/trends`, `stats/staff`, `stats/staff/details`, `stats/members`, `stats/audit`, `stats/audit/[id]/restore`.

**Availability** — `availability`, `availability/[id]`, `availability/expire`.

**CMS** — `site-contact`, `team`, `historique`, `practical-info`, `membership`.

**Accounts & sign-in** — `auth/[...nextauth]`, `password-reset` / `password-reset/confirm` (the forgotten-password flow), `user/change-password`, `user/password-status`, `user/[id]/reset-password` (a super admin re-sends credentials), `user/[id]/status` / `activity` / `cotisation` / `restore` / `mailing-label`, `user/search`, `user/update`, and the self-service `user/me/activity` / `user/me/unavailability`.

**Other** — `polly` (a catalogue book's spoken announcement — title, author, reading duration, description — synthesized once per book and cached in `Book.polly_audio_url`, the file itself on Vercel Blob), `google-books` (metadata proxy with retry aligned to Google's guidance), `upload-audio` (the small recorded clips behind a coup de cœur description → Vercel Blob), `books/check-isbn` / `user/check-duplicate` (soft duplicate warnings), `orders/recording-check`, `orders/[id]/assignment`, `bills/eligible-orders`, `listes-de-livres/preview` / `position` (public search helpers), `news/search`, and the `civilities` / `media-formats` / `statuses` lookups.

## 9. Data model (Prisma / PostgreSQL)

Core entities: `User` (+ `Address`, `ReaderLanguage`), `Book`, `Genre`, `Orders`, `Assignment` (+ `AssignmentReader`), `Bill`, `Payment`, `CoupsDeCoeur`, `News`, plus the reference tables `MediaFormat`, `Civility`, `Status`.

**Append-only event logs** — insert only, never update or delete: `BillEvent`, `OrderEvent`, `AssignmentEvent`, `UserActivityEvent`, `BookMergeEvent`, `AuditEvent`, `AudioTrackEvent`.

**Audio tables** — `OrphanAudioFolder` (folders no book claims), `DeletedAudioTrack` (the corbeille), `AudioTrackDuration` (the measurement cache), `AudioFilepathBackup` (pre-backfill snapshot of the NAS paths, since the rewrite is one-way).

**CMS tables** — `SiteContact` (singleton, id = 1), `TeamMember`, `HistoryEvent`, `PracticalInfo`, `MembershipOption`.

Notable patterns:

- **Soft delete** — `deletedAt` on `User`, `Orders`, `Assignment`, `Bill` and `Payment`. A global Prisma query extension (`lib/prisma.ts`) hides deleted rows for `User`, `Orders` and `Assignment` — the three whose children cascade onto append-only history (`OrderEvent`, `AssignmentEvent`, `AssignmentReader`), which a physical delete would destroy. It filters **list reads only** (`findMany` / `findFirst` / `count` / `aggregate` / `groupBy`): `findUnique` is deliberately left alone, because Prisma forbids a non-unique `deletedAt` in its `where` and because a by-id read is intentional admin access that must still resolve a deleted row — so detail routes check `deletedAt` themselves. Raw SQL bypasses the extension entirely; the `/admin/stats` queries filter it by hand.
- **`audioSizeKb` is in kibioctets, not bytes** — a byte count overflows `Int` past 2 Gio and would force `BigInt`, which neither `NextResponse.json` nor the client-component boundary can serialize, and a raw `Book` row crosses both.
- **`hiddenFromCatalogue`** keeps sensitive or personal titles off the public site while leaving them fully usable in the back office.
- Enums for delivery method, billing/order status, payment type/method, member type, access level, news type, language, save type, user activity status, audio link status and audio track action.

The Prisma client is generated to `app/generated/prisma` (custom output), configured in `prisma.config.ts` with `@prisma/adapter-pg`.

## 10. Component architecture

Three layers: app-specific components at the top of `components/`, the shadcn/ui primitives in `components/ui`, and the back-office kit in `components/ui/admin`.

### First layer (`components/*.tsx`)

| Component | Role |
|---|---|
| `Frontend-Navbar` | Public navigation (client). Appends an "Administration" link only when authenticated. |
| `Backend-Navbar` | Admin navigation (client), grouped Livres / Gestion / Membres / Pages. Rendered once in `app/admin/layout.tsx`. |
| `ThemeToggle` | Light/dark switch via `next-themes`, hydration-safe (`useSyncExternalStore`). |
| `BookModal` | Public, read-only book detail dialog. Expandable description, clickable genre chips, Polly "speak" button. |
| `Markdown` | Shared `react-markdown` + `remark-gfm` renderer for DB-backed content. |
| `AudioRecorder` | Wraps `MediaRecorder` (record → segment → confirm/clear); feeds `upload-audio`. |
| `ChangePasswordDialog`, `NewsTypeBadge`, `loading-skeleton`, `userWarnIfUnsavedChanges` | Password strength meter; news type badge; themed spinner; dirty-form navigation guard. |
| `components/admin/IconPicker`, `ThemePicker` | Pickers for the CMS editors. |

### Back-office kit (`components/ui/admin`)

Built on semantic theme tokens (`bg-card`, `border-border`, `text-foreground`) so light/dark stays consistent.

- **Layout primitives** — `AdminCard`, `AdminDashboardCard`.
- **Entity search kit** — `EntitySearchCombobox` (debounced search-and-pick popover: `AbortController` cancellation, stale-results-while-loading, keyboard navigation, a spinner while a selection resolves) on `hooks/useEntitySearch`, plus `UserSearchCombobox` (optionally `assignable`-filtered) and `BookSearchCombobox`. Don't hand-roll a search popover.
- **Form bases** — `BookFormBackendBase`, `UserFormBackendBase`, `OrderFormBackendBase`, `AssignmentFormBackendBase`, `BillFormBackendBase`, `PaymentFormBackendBase`, `GenreFormBackendBase`, `NewsFormBackendBase`. **The "new" page and the "edit" modal render the same base**, differing only in whether `initialData` is present — the DRY spine of the admin.
- **Modals** — `BookModalBackend`, `EditBookModal`, `Add`/`EditAssignmentModal`, `EditOrderModal`, `EditBillModal`, `EditPaymentModal`, `EditUserModal`, `DeleteBillModal` / `DeletePaymentModal`. `EditBillModal` encodes the billing state machine (DRAFT→BILLED→PAID→SOLDE, BILLED can reopen); `EditUserModal` is permission-aware.
- **Audio manager** — `BookAudioButton` / `BookAudioModal` (upload with per-file progress, folder or plain-file picker with the same batching UX, per-track durations, folder zip download, corbeille with restore), plus `RenameAudioTrackModal`, `DeleteAudioTrackModal`, `DeleteAllAudioTracksModal`.
- **Auxiliary display** — `BillHistory`, `UserActivityHistory`, `UserActivityGuardDialog` (blocks assigning work to inactive users, pairs with `useUserActivityGuard`), `CotisationStatusBanner`, `ActivityStatusFields`, `ReaderLanguagesField`, `AssignmentFormErrors`, and `BillPDF` / `BillPDFButton` (`@react-pdf/renderer`; the button also issues the bill DRAFT→BILLED). **`BillPDF` uses adaptive density spacing — preserve that logic when editing.**

**Page interaction pattern (uniform across the admin):** a server `page.tsx` fetches rows via Prisma → passes them to a client `*-table.tsx` → the table owns search/pagination and modal open-state → a row action renders an Edit/Add/Delete modal → which renders the shared `FormBackendBase` → which calls `/api/<entity>` → whose callback triggers `router.refresh()`. Deep-link params open the matching modal directly (payments, news).

### Hooks (`hooks/`)

`useEntitySearch`, `useAudioUpload`, `useAudioFolderZip`, `useUserActivityGuard`, `useRecordingCheck`, `useFormToast`, `useInvalidField`, `use-toast`.

## 11. Type system

`types/index.ts` re-exports three barrels — `models`, `api`, `shared` — forming one typed chain:

**Prisma model → `model.ts` fetch configs → `api.ts` validated I/O → `shared` `FormData` → `FormBackendBase` → modal → table → page.**

- **`types/models/*.model.ts`** — database shape. Relation-expanded variants via `Prisma.XGetPayload<…>` and reusable `select`/`include` configs written `as const satisfies Prisma.XSelect`. These are the single source of truth for *how to fetch* an entity, shared across route handlers so response shapes never drift.
- **`types/api/*.api.ts`** — the wire contract. `Summary`/`BasicInfo` picks, query-mode Zod enums (`basic|detailed|full`), `Response` types derived from the model selects, and Zod `Create`/`Update` schemas with inferred types — the route validates with the schema and the client imports the inferred type from the same file.
- **`types/shared/frontend.types.ts`** — UI shapes not 1:1 with DB rows: `Simple*` projections, list-item view models, the `*FormData` interfaces the form bases bind to, and generic envelopes (`PaginatedResponse<T>`, `ApiResponse<T>`, `PaginationParams`…).

## 12. Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL (Supabase) · NextAuth v4 · Tailwind CSS + shadcn/ui + Radix · Zod 4 · **Backblaze B2 via `@aws-sdk/client-s3` + `s3-request-presigner`** · AWS Polly · Vercel Blob · `client-zip` · React Email + Resend · `@react-pdf/renderer` · pnpm · Husky + lint-staged · deployed on Vercel.

Server state is fetched in the route handlers and in `hooks/` with plain `fetch` + `AbortController` (see `useEntitySearch`), and freshness comes from `router.refresh()` after a mutation plus the two revalidation helpers. There is **no client-side query cache**: `@tanstack/react-query` is still in `package.json` but is imported nowhere, so don't reach for it as though it were the house pattern — either adopt it deliberately or drop the dependency.

## 13. Project structure

```
app/
  (public pages)/       Home, catalogue, listes-de-livres, dernieres-infos, nous-connaitre…
  admin/                Authenticated back office
  api/                  Route handlers (REST + audio + stats + cron + Polly/Google Books)
  auth/                 Sign-in and password flows
  generated/prisma/     Generated Prisma client
  sitemap.ts robots.ts  SEO surface
components/             Shared components, UI kit, admin kit, email templates
hooks/                  React hooks (entity search, audio upload/zip, activity guard, toasts…)
lib/
  audio/                Bucket access, naming, state cache, corbeille, durations
  audit/                Prisma-extension audit trail, retention, labels
  auth/                 withAuth / withAdmin guards
  books/ orders/ users/  Domain helpers
  email/                sendEmail chokepoint + templated senders
  billing.ts pricing.ts pricing-sync.ts statusSync.ts stats.ts cotisation.ts
  cache-tags.ts revalidate-public.ts revalidate-admin.ts concurrency.ts feature-flags.ts
prisma/                 schema.prisma, migrations, seed, dev-claude-user
scripts/                Audio audits, backfills, probes, one-off maintenance
types/                  models / api / shared barrels
middleware.ts           Auth gating + forced password change
prisma.config.ts        Prisma 7 config (adapter-pg, migrations path)
vercel.json             Cron schedules
```

## 14. Getting started

Requires **Node.js**, **pnpm 10.9+**, and a **PostgreSQL** database.

```bash
pnpm install
cp .env.example .env        # fill in values (see below)
pnpm prisma db push         # NOT `migrate dev` — see the warning below
pnpm prisma db seed         # optional
pnpm dev                    # http://localhost:3000
```

## 15. Environment variables

```bash
DATABASE_URL=              # PostgreSQL. On Supabase: port 6543, pgbouncer transaction mode
DIRECT_URL=                # Supabase port 5432, session mode — used by the Prisma CLI
                           # and by every script in scripts/ (see scripts/db-url.ts)

NEXTAUTH_URL=
NEXTAUTH_SECRET=

APP_NAME=                  # branding in transactional emails
APP_URL=                   # absolute links in emails

# Backblaze B2 (S3-compatible API) — the audio corpus
S3_AUDIO_BUCKET=           # B2 bucket name
S3_ENDPOINT=               # e.g. https://s3.eu-central-003.backblazeb2.com (bare host also accepted)
S3_REGION=                 # must match the endpoint, e.g. eu-central-003
S3_ACCESS_KEY_ID=          # B2 application keyID
S3_SECRET_ACCESS_KEY=      # B2 applicationKey (shown once at creation)
S3_AUDIO_PREFIX=           # optional, restricts audits/listings to one prefix

AWS_ACCESS_KEY_ID=         # AWS Polly (falls back for S3_* if those are unset)
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

BLOB_READ_WRITE_TOKEN=     # Vercel Blob — Polly blurbs and small upload-audio clips only
GOOGLE_BOOKS_API_KEY=      # catalogue metadata lookup
RESEND_API_KEY=            # transactional email
RESEND_FROM_EMAIL=
REVIEW_ESCALATION_EMAIL=   # recipient for blocked duplicate fusions
CRON_SECRET=               # required, or the /api/cron/* routes refuse
```

> ⚠️ Keep AWS and B2 credentials server-side only — never expose them via `NEXT_PUBLIC_`. All S3 and email operations happen on the server; the browser only ever receives expiring presigned URLs.

The bucket also needs a **CORS rule allowing `PUT` from the site origins**, or every browser upload fails at preflight:

```bash
pnpm tsx scripts/set-audio-cors.ts
```

## 16. Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | `prisma generate` + Next.js build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm prisma db seed` | Seed the database |
| `pnpm prisma db execute --file <sql>` | Apply a schema change — see the warning below |

### Audio maintenance (`scripts/`)

Every script that opens its own database connection reads `DIRECT_URL` first, via `scriptDatabaseUrl()` (`scripts/db-url.ts`) — the session pooler, not the transaction one. Use it in anything new rather than reading `process.env.DATABASE_URL` yourself. (`audio-manage.e2e.ts` is the exception, and on purpose: it drives the *app's* client and asserts that its `DATABASE_URL` points at localhost before touching anything. The pure test/config scripts open no connection at all.)

| Script | Writes? | Description |
|---|---|---|
| `sync-audio-links.ts` | DB only | Full reconciliation: bucket ↔ `Book.audio_filepath`. Sets `audioLinkStatus` / `audioTrackCount` / `audioSizeKb` / `audioCheckedAt` and rebuilds `OrphanAudioFolder`. **Nothing in the bucket is touched.** `--dry-run` supported. Follow a full run with `backfill-order-costs.ts`. |
| `backfill-audio-durations.ts` | DB only | Measures every book that has audio but no duration, from header bytes. Safe to interrupt and re-run. `--dry-run`, `--limit=N`, `--all`. |
| `backfill-audio-paths.ts` | DB only | Rewrites the legacy NAS path (`T:\2022\…`) to the bucket prefix; snapshots the original into `AudioFilepathBackup` in the same transaction. Idempotent. |
| `backfill-order-costs.ts` | DB only | Re-tarifies unbilled demandes on the recording weight. `--apply`. |
| `backfill-order-events.ts`, `backfill-assignment-events.ts` | DB only | One `CREATED` row per pre-existing demande/attribution so the stats metrics don't reset on deploy. `--apply`. |
| `audit-audio-files.ts` | no | Read-only audit of the bucket against the catalogue, folder by folder; derives which join rule actually explains the data. Writes CSVs to `./audio-audit`. |
| `probe-audio-durations.ts` | no | Census, sampling, `--audit-estimate`, `--validate`. Safe to point at production. |
| `report-damaged-audio.ts` | no | Books whose tracks are still unreadable when asked again, ranked by share of the recording affected. |
| `report-large-books.ts` | no | Books split across an unusual number of files, counted from the bucket rather than the cache. |
| `compare-audio-folders.ts` | no | Do two books' folders hold the same recording? Compares every track's size in order — filenames are shown but are not the test. |
| `inspect-audio-duration-state.ts`, `peek-audio-paths.ts`, `verify-audio-link.ts` | no | Read-only diagnostics. |
| `purge-apple-double.ts` | bucket | Removes AppleDouble stubs. Three independent checks; `--confirm` required. |
| `delete-duplicate-book.ts` | DB only | Deletes a duplicate record whose twin holds a byte-identical folder; refuses one carrying demandes or attributions. Leaves the folder to `/admin/audio-orphelins`. `--confirm`. |
| `set-audio-cors.ts` | bucket config | Sets the CORS rule the browser uploads need. |
| `audio-match-rules.test.ts`, `audio-naming.test.ts` | no | Filename-matching and upload-naming tests. No network, no DB. |
| `audio-manage.e2e.ts` | scratch prefix | End-to-end check of delete/restore/`FOLDER_EMPTY` against the real bucket, in its own scratch prefix. |

### Signing in locally

There is a permanent local dev account (`claude@eca.test`), a `super_admin`/`informaticien`, created by the seed and re-provisioned with `pnpm dev:claude-user`. That script upserts only that one user and refuses to run against anything but a local database.

### Schema changes — do not use `prisma migrate`

The migration history is out of sync with the databases: the migrations in `prisma/migrations/` are recorded as unapplied against databases that already contain those tables. `prisma migrate dev` would try to replay them and can prompt a destructive reset; `prisma migrate deploy` fails on the first one.

Apply schema changes like this instead:

```bash
pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<timestamp>_<name>/migration.sql
```

**Read the generated SQL before running it** — if the target has drifted it can contain `DROP` statements. Then apply it:

```bash
pnpm prisma db execute --file prisma/migrations/<timestamp>_<name>/migration.sql
```

Keep the SQL file in the repo so the change is recorded even though the history itself is not trustworthy. `prisma.config.ts` points the datasource at `DIRECT_URL`, so override that variable to target a different database.

## 17. Deployment

Deployed on **Vercel**. `pnpm build` runs `prisma generate` first. Before a release:

- set `DATABASE_URL`, `DIRECT_URL` and every integration credential in the Vercel project, `CRON_SECRET` included;
- apply pending schema SQL by hand (see above);
- confirm the B2 CORS rule still lists the deployment origin — a new preview domain cannot upload without it.

The production database is a **Supabase free tier**: 500 MB, and it flips to read-only past that. The audit-trail retention and the corbeille purge exist because of that ceiling; don't raise their windows without checking the headroom.

## 18. Status

Internal project built pro bono for ECA. Not open for external contribution.
