---
paths:
  - "lib/cache-tags.ts"
  - "lib/revalidate-*.ts"
  - "app/api/**"
  - "app/{catalogue,listes-de-livres,dernieres-infos,nous-connaitre,nous-rejoindre,contact,formulaire-adhesion}/**"
---

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
  the back office. Public queries must respect it — including the **unauthenticated** ones
  (`/api/polly`, `listes-de-livres/preview`), which accept any id the caller sends.
- **`Book.polly_audio_url` is a cache too.** The spoken announcement is synthesized once and
  reused forever, so whoever changes a field it reads out has to clear it: title, author and
  description in `PUT /api/books/[id]`, reading duration in `refreshBookAudioState`. Add a
  field to the announcement in `/api/polly` and you owe it an invalidation point.
