---
paths:
  - "lib/users/**"
  - "app/api/user/**"
---

### User activity status
- Status is a `UserActivityStatus` enum; history is tracked in **`UserActivityEvent`**, which
  is **append-only** — never mutate or delete existing events.
- Deactivating a user auto-sets `isAvailable = false` (sync guard in
  `app/api/user/[id]/activity/route.ts`). Keep this invariant.
- Indisponibilités expire on their own: `/admin/disponibilites` closes due ones on load, and a
  nightly cron does the same. Both go through `lib/users/expireUnavailability.ts`.
