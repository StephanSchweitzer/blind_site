---
paths:
  - "lib/cache-tags.ts"
  - "lib/revalidate-*.ts"
  - "app/api/**"
  - "app/(public)/**"
---

### Public pages and cache invalidation
- The editorial content of `Contact`, `Équipe`, `Historique`, `Informations pratiques` and
  `Nous rejoindre` is **DB-backed**, edited under `/admin`, with drag-and-drop ordering.
  Content isn't hardcoded.
- Cached public reads are tagged from **one registry**, `lib/cache-tags.ts`. After a
  successful write (never before), call `revalidatePublic(tag, path)`.
- **Every invalidation is paid in ISR writes** (Vercel bills each regenerated page and cache
  entry, in 8 KB units). Invalidate on a real change to what the public site shows, never
  "just in case", and keep the fallback `revalidate` at a day, not an hour.
- **A write to a book**: `snapshotPublicBooks([ids])` before it, `revalidateChangedBooks(snapshot)`
  after. It compares what the public site shows (`toPublicBook`, visibility, active lists) and
  invalidates the catalogue only when the book is on its cached first page or the title count
  moved, the coups de cœur only when the book is (or was) in an active list, and nothing when
  nothing public changed. A new visible book: `revalidatePublic(CACHE_TAGS.catalogue, …)`.
  `revalidateCatalogue()` (both, unconditionally) is for genre writes only.
- **No path-wide admin invalidation.** Back-office pages are `force-dynamic`; a
  `revalidatePath('/admin', 'layout')` refreshes none of them and only throws away the
  prerendered admin pages and the reference-data cache. Server Actions call `refresh()` from
  `next/cache`; route handlers call nothing. Reference lists (genres, statuts…) are invalidated
  by `revalidateReferenceData()`, whose tag the prerendered admin pages carry too.
- `Book.hiddenFromCatalogue` hides a title from the public site only; it stays fully usable in
  the back office. Public queries must respect it — including the **unauthenticated** ones
  (`/api/polly`, `listes-de-livres/preview`), which accept any id the caller sends.
- **`Book.polly_audio_url` is a cache too.** The spoken announcement is synthesized once and
  reused forever, so whoever changes a field it reads out has to clear it: title, author and
  description in `PUT /api/books/[id]`, reading duration in `refreshBookAudioState`. Add a
  field to the announcement in `/api/polly` and you owe it an invalidation point.
