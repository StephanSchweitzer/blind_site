// Temporary, leadership-requested toggles. Keep these self-contained so a
// rollback is a single edit rather than an archaeology dig through the codebase.

// TEMP (leadership request, 2026): restrict *all* user creation to super_admins.
// This is expected to be reverted. Rollback: set to `true` (restores the prior
// behaviour where admins could also create users), or delete this flag and its
// two usages in app/api/user/route.ts and app/admin/users/[type]/users-table.tsx.
export const ADMINS_CAN_CREATE_USERS = false;
