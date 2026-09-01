---
paths:
  - "lib/audit/**"
---

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
