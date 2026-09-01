---
paths:
  - "app/**"
  - "lib/**"
  - "components/**"
---

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
| staff picks / book list | Coups de cœur / "Liste des Livres" | `CoupsDeCoeur` model; `/admin/listes-de-livres`; `/api/listes-de-livres`; public `/listes-de-livres` |
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
