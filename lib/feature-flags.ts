// Temporary, leadership-requested toggles. Keep these self-contained so a
// rollback is a single edit rather than an archaeology dig through the codebase.

// TEMP (leadership request, 2026): restrict *all* user creation to super_admins.
// This is expected to be reverted. Rollback: set to `true` (restores the prior
// behaviour where admins could also create users), or delete this flag and its
// two usages in app/api/user/route.ts and app/admin/users/[type]/users-table.tsx.
export const ADMINS_CAN_CREATE_USERS = false;

// TEMP (pending confirmation from the permanence, 2026-08): print the
// « CÉCOGRAMME » postal mention on an étiquette d'adresse that accompanies a
// recording. The franchise covers material for the blind, and an enregistrement
// travels back with the auditeur's own printed book — whether that mixed
// envelope still qualifies, and whether it must travel open for inspection, is
// a question for La Poste that has not been answered yet.
// Rollback: set to `false` (the mention disappears everywhere, nothing else
// changes), or delete this flag and its single usage in
// components/ui/admin/MailingLabelPDF.tsx.
export const PRINT_CECOGRAMME_MENTION = true;
