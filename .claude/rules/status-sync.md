---
paths:
  - "lib/statusSync.ts"
  - "app/api/orders/**"
  - "app/api/assignments/**"
---

### Status sync
- `lib/statusSync.ts` holds the guard functions enforcing the demande/attribution status state
  machine. An attribution owns its reader and send/return dates; a demande may only sync a
  status onto its attribution when that status stays consistent with those attribution-owned
  fields — sync is intentionally **asymmetric**, not a free bidirectional mirror. Be very
  careful editing it — changes here can cascade. Don't remove the guards.
- **The recording statuses travel upwards only.** « En cours » describes a book out with a
  lecteur, so it's never typed on a demande: `guardManualEnCours` rejects it on a demande with
  no attribution, and the demande form renders the option disabled with the reason.
- **Finishing an attribution no longer closes its demande.** An attribution « Terminé » pushes
  the demande to « Attente envoi vers auditeur » (`STATUS.ATTENTE_AUDITEUR`, demande-only like
  `SOLDE` — see `isOrderOnlyStatus` / `orderStatusForAssignmentStatus`). The retour du lecteur
  and the envoi à l'auditeur are different events; closing the demande stays a human act, which
  is what makes its `closureDate` the day of the expédition. Filter demandes on that status to
  get the shipping worklist.
- **`SOLDE` is retired as a workflow status** — it belongs to factures (`BillingStatus.SOLDE`).
  The `Status` row still exists so the guards can recognise and refuse it; neither a demande
  nor an attribution may be set to it.
- **`A_FAIRE` is duplication-only.** A duplication owns no attribution, so the recording
  statuses say nothing true about it — its lifecycle is « À faire » → « Terminé », enforced by
  `guardDuplicationStatus`.
