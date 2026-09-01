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
  the back office. Public queries must respect it.
