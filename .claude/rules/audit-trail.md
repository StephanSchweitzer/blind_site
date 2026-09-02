---
paths:
  - "lib/audit/**"
---

### Audit trail (`lib/audit/`)

- **Never add a per-action logging call.** A Prisma client extension turns every write to an
  audited model into an `AuditEvent` automatically, precisely so no future route can forget.
  If a new model should be traced, add it to `AUDITED_MODELS` in `lib/audit/config.ts` —
  that's the whole change.
- **A child table that is a *field* of its owner is not a record.** `Address` and
  `ReaderLanguage` are edited only from the fiche, as a whole set, so they are declared in
  `OWNED_COLLECTIONS` (`lib/audit/owned-collections.ts`) instead of `AUDITED_MODELS`: writes
  to them produce no event of their own, but one `UPDATE` on the `User` that owns them,
  naming the whole collection before and after. Add the next such table there, not above.
- **Sync owned collections, never replace them.** A delete-all + create-all rewrites rows
  nobody touched, and the trail can only report what it is given. See `syncAddresses` /
  `syncLanguages` in `app/api/user/[id]/route.ts`.
- **Nested writes are invisible to the extension.** `user.update({ data: { addresses: {
  create } } })` produces no address event at all — go through the child delegate.
- Wrap a write in `withoutAudit()` only when the event provably could never survive (pure
  derived/noise fields, e.g. the cache columns in `refreshBookAudioState`). Scope it to the
  one statement — never around a block that also makes a real decision.
- `$queryRaw` / `$executeRaw` bypass the extension entirely. If you use raw SQL to change
  business data, you are outside the trail; say so, or don't.
- Retention self-trims (14 days, 7 under table pressure). See the 500 MB ceiling above.
