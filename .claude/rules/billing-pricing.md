---
paths:
  - "lib/billing.ts"
  - "lib/pricing*.ts"
  - "lib/cotisation.ts"
  - "app/api/bills/**"
  - "app/api/payments/**"
---

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
