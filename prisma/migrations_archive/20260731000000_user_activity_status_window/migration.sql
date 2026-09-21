-- Additive only: nothing is dropped, nothing is rewritten, and the columns are
-- nullable, so the code running before this migration keeps working unchanged.
-- Written with IF NOT EXISTS throughout so a partially-applied run can simply be
-- replayed.

-- Five offered statuses, same list for every member type. UNAVAILABLE is new;
-- INACTIVE / ON_VACATION / SUSPENDED / PB_SANTE_MENTALE stay in the enum so the
-- records already carrying them keep rendering, but are no longer offered.
-- NOTE: Postgres forbids USING a new enum value in the same transaction that
-- added it. Nothing below references 'UNAVAILABLE', so this file is safe as one
-- unit; keep it that way if you ever add a backfill (that goes in its own run).
ALTER TYPE "UserActivityStatus" ADD VALUE IF NOT EXISTS 'UNAVAILABLE';

-- Unavailability window, both ends inclusive, stored as UTC-midnight days.
-- The effective status is derived from these at read time; no job rewrites rows.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "unavailableFrom" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "unavailableUntil" TIMESTAMP(3);

-- Same window recorded on the (append-only) history event.
ALTER TABLE "UserActivityEvent" ADD COLUMN IF NOT EXISTS "unavailableFrom" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "unavailableUntil" TIMESTAMP(3);
