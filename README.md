# ECA — Site & portail d'administration

Web application for **ECA — Enregistrements à la Carte pour les Aveugles**, a French nonprofit (a délégation of the *Auxiliaires des Aveugles*) that records books and documents on demand for blind and visually impaired listeners, pairing them with trained volunteer readers.

The repository is a single Next.js (App Router) codebase that contains **two distinct applications**:

1. **The public site** — the association's outward-facing website: presentation, catalogue, staff picks, news, and membership info.
2. **The admin back office** (`/admin`, authenticated) — the internal tool staff use to run operations: members, book catalogue, orders, recording assignments, billing, and payments.

🔗 **Live:** [https://eca-aveugles.fr/](https://blind-site-omega.vercel.app)

---

## 1. Public site

Server-rendered French pages sharing a common `Frontend-Navbar`, glassmorphism styling, and light/dark theming.

| Route | Purpose                                                                                                                                                                                                                                    |
|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/` | Home. Presents ECA and its à-la-carte recording service — the human bridge between sighted volunteer readers and visually impaired listeners.                                                                                              |
| `/catalogue` | Public, paginated, searchable browse of the audiobook catalogue, filterable by genre. Server-fetches the first page (9 books) then hydrates a client component for search/pagination. Audio descriptions can be synthesized via AWS Polly. |
| `/coups-de-coeur` | "Staff picks" (Now known as Liste des Livres) — curated book selections with descriptions and an audio player (leaving an audio description is possible). Paginated one selection at a time.                                               |
| `/dernieres-infos` | News/announcements feed. Client page that queries `/api/news` with search + type filters (Général, Événement, Annonce, Actualité, Programmation).                                                                                          |
| `/nous-connaitre/equipe` | "Our team" — who runs the association.                                                                                                                                                                                                     |
| `/nous-connaitre/historique` | "Our history" — the association's background.                                                                                                                                                                                              |
| `/nous-connaitre/informations-pratiques` | "Practical info" — how the service works, step by step.                                                                                                                                                                                    |
| `/nous-rejoindre` | Membership page explaining the roles (auditeur, lecteur…) and the annual cotisation.                                                                                                                                                       |
| `/contact` | Address, phone, email, and transit directions for the Paris office.                                                                                                                                                                        |
| `/formulaire-adhesion` | Membership form — currently a placeholder "en développement" landing page.                                                                                                                                                                 |

## 2. Authentication

| Route | Purpose |
|---|---|
| `/auth/signin` | Staff sign-in (NextAuth credentials). |
| `/auth/change-password` | Forced password change. New accounts are created with `passwordNeedsChange: true`; `middleware.ts` redirects them here until they set a real password. |
| `/auth/password-changed-success` | Confirmation screen after a successful password change. |

Access control lives in `middleware.ts`: it protects `/admin/*`, `/profile`, and `/auth/change-password`, requires a valid session, and enforces the first-login password change.

## 3. Admin back office (`/admin`)

Isolated from the public layout via its own `layout.tsx` + `Backend-Navbar`. The landing page is a dashboard of live counts.

| Route | Purpose                                                                                                                                                             |
|---|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/admin` | Dashboard. Live counts (books, genres, news, staff picks, readers, listeners, admins, assignments, orders, bills, payments) as navigation cards.                    |
| `/admin/books`, `/admin/books/new`, `/admin/books/[id]` | Catalogue CRUD. Book search, create (with ISBN check + Google Books lookup), and per-book edit.                                                                     |
| `/admin/genres`, `/admin/genres/new`, `/admin/genres/[id]` | Manage the genre taxonomy applied to books.                                                                                                                         |
| `/admin/news`, `/admin/news/new`, `/admin/news/[id]` | Author and edit the news items shown on `/dernieres-infos`.                                                                                                         |
| `/admin/manage_coups_de_coeur` (+ `new`, `[id]`) | Build staff-pick selections (Liste des Livres): pick books and record an optional description.                                                                      |
| `/admin/orders` | **Demandes** — listeners' recording requests: which book, media format, delivery method, status, billing status.                                                    |
| `/admin/assignments` | **Attributions** — the work of recording an ordered book, tracked through a status state machine, with reader assignment/history and reception/sent/returned dates. |
| `/admin/bills` | **Factures** — invoices grouping billable orders per client, with issue/payment tracking and a `BillEvent` audit trail.                                             |
| `/admin/payments` | **Paiements** — payments recorded against clients/bills (cotisations, recordings, donations, misc).                                                                 |
| `/admin/users` → `/admin/users/[type]` | Member directory, tabbed by member type (lecteurs, auditeurs, permanents…).                                                                                         |
| `/admin/users/dossier/[id]` | A member's full "dossier": profile plus sub-tabs for **attributions** (assignments as reader), **demandes** (orders as listener), **factures**, and **paiements**.  |
| `/admin/profile` | The signed-in staff member's own profile / password.                                                                                                                |

## 4. API layer (`app/api`)

Route handlers backing both apps. Standard REST CRUD exists for each entity (`books`, `genres`, `news`, `orders`, `assignments`, `bills`, `payments`, `coups-de-coeur`, `user`), plus notable specialized routes:

- **`polly`** — synthesizes a staff-pick blurb to speech (AWS Polly neural, ~2800-char cap) and stores it in Vercel Blob.
- **`google-books`** — server-side proxy to the Google Books API for metadata; auto-detects ISBN vs. title queries.
- **`upload-audio`** — admin-only audio upload (25 MB cap) to Vercel Blob.
- **`books/check-isbn`**, **`user/check-duplicate`** — soft duplicate warnings on the create forms.
- **`user/invite`**, **`user/[id]/reset-password`**, **`user/[id]/status`**, **`user/[id]/activity`** — member account lifecycle.
- **`civilities`**, **`media-formats`**, **`statuses`** — reference/lookup data for dropdowns.
- **`auth/[...nextauth]`** — NextAuth handler.

## 5. Data model (Prisma / PostgreSQL)

Core entities: `User` (members, with `memberType` and `accessLevel`), `Book`, `Genre`, `Orders`, `Assignment` (+ `AssignmentReader` history), `Bill`, `Payment`, `CoupsDeCoeur`, `News`, plus reference tables `MediaFormat`, `Civility`, `Status`, `Address`.

Notable patterns:
- **Soft delete** — `deletedAt` on `User`, `Bill`, `Orders`; a global Prisma query extension (`lib/prisma.ts`) hides deleted users from all reads.
- **Audit/history tables** — `BillEvent` (append-only billing state changes) and `UserActivityEvent` (append-only member activity-status history), replacing older single-field flags marked `LEGACY` in the schema.
- **Enums** for delivery method, billing/order status, payment type/method, member type, access level, news type, and user activity status.

The Prisma client is generated to `app/generated/prisma` (custom output).

## 6. Component architecture

Components split into three layers: app-specific components at the top of `components/`, the shadcn/ui primitives in `components/ui`, and the back-office kit in `components/ui/admin`.

### First layer (`components/*.tsx`)

App-specific components, split by which half of the app they serve.

| Component | Role |
|---|---|
| `Frontend-Navbar` | Public site navigation (client). Calls `useSession()` and appends an "Administration" link only when authenticated — the bridge from the public site into the back office. Rendered directly by each public page. |
| `Backend-Navbar` | Admin navigation (client), grouped Livres / Gestion / Membres. Rendered once in `app/admin/layout.tsx`, so it wraps every admin page. |
| `ThemeToggle` | Light/dark switch via `next-themes`, hydration-safe (`useSyncExternalStore`). Embedded in both navbars. |
| `BookModal` | Public, read-only book detail dialog used by the catalogue. Expandable description, clickable genre chips that drive the catalogue filter, and a Polly-backed "speak" button. (Admin counterpart is `BookModalBackend`.) |
| `AudioRecorder` | Wraps the `MediaRecorder` API (record → segment → confirm/clear). Exposes `onConfirm(blob)` / `onClear`; feeds the `upload-audio` route. |
| `ChangePasswordDialog` | Controlled dialog with a password-strength meter, used in the profile / forced-change flow. |
| `NewsTypeBadge` | Presentational badge mapping `NewsType` → label + color. Reused in the public news feed and admin news. |
| `loading-skeleton` | Shared spinner with a `'frontend' \| 'admin'` variant so it matches the active theme context. |
| `userWarnIfUnsavedChanges` | Exports the `useWarnIfUnsavedChanges` hook + an `AlertDialog` that intercepts navigation when a form is dirty. Consumed inside the form bases. |

### Back-office kit (`components/ui/admin`)

Three tiers, all built on semantic theme tokens (`bg-card`, `border-border`, `text-foreground`) so light/dark theming is consistent.

- **Layout primitives** (exported via the barrel `index.ts`): `AdminCard` (page shell), `AdminTable` / `AdminTableHeader` / `AdminTableRow` (styled wrappers over the base table, used by every `*-table.tsx`), `AdminPagination` (link-based pager building `?page=&search=` URLs), and `AdminDashboardCard` (the accent-colored count cards on `/admin`).
- **Form bases** — `BookFormBackendBase`, `UserFormBackendBase`, `OrderFormBackendBase`, `AssignmentFormBackendBase`, `BillFormBackendBase`, `PaymentFormBackendBase`. The reusable engine for each entity: fields + validation, parameterized by `initialData`, `onSubmit` (returns the created/edited id), and `onSuccess`/`onDelete`. **The "new" page and the "edit" modal render the same base**, differing only in whether `initialData` is present and whether `onSubmit` creates or updates — the DRY spine of the admin.
- **Modals** wrap the form bases and are opened from tables: `BookModalBackend` (add), `EditBookModal`, `AddAssignmentModal` + `EditAssignmentModal`, `EditOrderModal`, `EditBillModal`, `EditPaymentModal`, `EditUserModal`, plus dedicated `DeleteBillModal` / `DeletePaymentModal`. Consistent prop contract: `isOpen` + `onOpenChange` (owned by the parent table), the entity id / pre-fetched selections, and `onX{Created,Edited,Updated,Deleted}` callbacks. `EditBillModal` encodes the billing state machine (DRAFT→BILLED→PAID→SOLDE, BILLED can reopen to DRAFT); `EditUserModal` is permission-aware via `currentUserAccessLevel` + `userType`.
- **Auxiliary display** — `BillHistory` (`BillEvent` audit trail), `UserActivityHistory` (`UserActivityEvent` history), `UserActivityGuardDialog` (blocks assigning work to inactive users, pairs with `useUserActivityGuard`), and `BillPDF` / `BillPDFButton` (invoice via `@react-pdf/renderer`; the button also issues the bill DRAFT→BILLED).

**Page interaction pattern (uniform across the admin):** a server `page.tsx` fetches rows via Prisma → passes them to a client `*-table.tsx` → the table composes `AdminCard` + `AdminTable` + pagination and owns the modal open-state → on a row action it renders an Edit/Add/Delete modal → which renders the shared `FormBackendBase` → which calls `/api/<entity>` → whose callback triggers `router.refresh()`.

## 7. Type system

`types/index.ts` re-exports three barrels — `models`, `api`, `shared` — plus a couple of Prisma enums. Together they form one typed chain from database to UI:

**Prisma model → `model.ts` fetch configs → `api.ts` validated I/O → `shared` `FormData` → `FormBackendBase` → modal → table → page.**

- **`types/models/*.model.ts` — database shape.** Re-exports the raw Prisma model, defines relation-expanded variants via `Prisma.XGetPayload<...>` (`BookWithGenres`, `BookWithAllRelations`, `CoupsDeCoeurWithBooks`…), and reusable `select`/`include` configs written `as const satisfies Prisma.XSelect` (`basicBookSelect`, `detailedBookSelect`, `bookIncludeConfigs`). These configs are the single source of truth for *how to fetch* an entity, shared across route handlers so response shapes never drift. `common.model.ts` covers the smaller entities (Genre, Status, MediaFormat, Address, Bill, News, CoupsDeCoeur, join tables).
- **`types/api/*.api.ts` — the wire contract.** Per entity: `Summary`/`BasicInfo` picks, query-mode and include-relation Zod enums (`basic|detailed|full`), `Response` types derived from the model selects (`Prisma.BookGetPayload<{ select: typeof basicBookSelect }>`), and Zod `Create`/`Update` input schemas with inferred types (`BookCreateInputSchema` → `BookCreateInput`) — so the route validates with the schema and the client imports the inferred type from the same file. `common.api.ts` carries CRUD schemas for the smaller entities.
- **`types/shared/frontend.types.ts` — UI shapes not 1:1 with DB rows.** `Simple*` projections, list-item view models (`OrderListItem`, `AssignmentListItem`, `AssignmentReaderHistoryItem`), the `*FormData` interfaces the form bases bind to (`BookFormData`, `OrderFormData`, `UserFormData`, `AddressFormData`), and generic envelopes (`PaginatedResponse<T>`, `ApiResponse<T>`, `PaginationParams`, `DateRangeFilter`, `SearchFilter`).

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL · NextAuth v4 · Tailwind CSS + shadcn/ui + Radix · TanStack Query · Zod · AWS Polly + Vercel Blob · React Email + Resend · `@react-pdf/renderer` · pnpm · Husky + lint-staged · deployed on Vercel.

## Project structure

```
app/
  (public pages)/       Home, catalogue, coups-de-coeur, dernieres-infos, etc.
  admin/                Authenticated back office
  api/                  Route handlers (REST + Polly/Google Books/upload)
  auth/                 Sign-in and password flows
  generated/prisma/     Generated Prisma client
components/             Shared components, UI kit, email templates
hooks/                  React hooks (book search, activity guard, toasts…)
lib/                    Auth, billing, statusSync, prisma client, email
prisma/                 schema.prisma, migrations, seed
types/                  Shared + API + model types
middleware.ts           Auth gating + forced password change
```

## Getting started

Requires **Node.js**, **pnpm 10.9+**, and a **PostgreSQL** database.

```bash
pnpm install
cp .env.example .env        # fill in values (see below)
pnpm prisma migrate dev
pnpm prisma db seed         # optional
pnpm dev                    # http://localhost:3000
```

## Environment variables

Confirm exact names against your actual `.env`:

```bash
DATABASE_URL=              # PostgreSQL

NEXTAUTH_URL=
NEXTAUTH_SECRET=

AWS_ACCESS_KEY_ID=         # Polly (region us-east-1 is set in code)
AWS_SECRET_ACCESS_KEY=

BLOB_READ_WRITE_TOKEN=     # Vercel Blob (audio storage)
GOOGLE_BOOKS_API_KEY=      # catalogue metadata lookup
RESEND_API_KEY=            # transactional email
```

> ⚠️ Keep AWS/Polly credentials server-side only — never expose them via `NEXT_PUBLIC_`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | `prisma generate` + Next.js build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm prisma migrate dev` / `db seed` | Migrate / seed the database |

## Deployment

Deployed on **Vercel**. `pnpm build` runs `prisma generate` first; ensure `DATABASE_URL` and all integration credentials are set in the Vercel project, and run pending migrations against the production database as part of releases.

## Status

Internal project built pro bono for ECA. Not open for external contribution.
