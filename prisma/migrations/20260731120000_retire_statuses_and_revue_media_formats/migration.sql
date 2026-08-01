-- Retire four activity statuses and the "revue" media formats.
--
-- 1. « Format média préféré » only lists real media formats again: the six
--    periodicals (revues, magazines, journaux, gazettes) that had been loaded
--    into MediaFormat are removed. Anything still pointing at them is repointed
--    to « Non défini » (Orders) or cleared (User.preferredMediaFormatId).
--
-- 2. DEMISSION disappears: every record carrying it becomes RADIATION. This also
--    settles the rule "un auditeur ou un donateur ne peut pas être
--    démissionnaire" — nobody can be, the status no longer exists.
--
-- 3. ON_VACATION, SUSPENDED and PB_SANTE_MENTALE disappear: their records become
--    INACTIVE (already a stored legacy value, and it needs no invented date
--    window). INACTIVE itself stays in the enum — hundreds of rows carry it.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum is recreated and the
-- three columns using it are re-typed. NOTE: this rewrites the enum column of
-- the append-only UserActivityEvent table. That is a re-labelling of values on
-- rows that stay in place — no event is inserted, updated in substance, or
-- deleted; who/when/why are untouched.
--
-- Re-running is safe: every step is a no-op once applied, except the enum
-- recreation, which is skipped when the old values are already gone.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Les revues quittent « Format média préféré »
-- ---------------------------------------------------------------------------

-- Demandes pointing at a revue fall back to « Non défini » (mediaFormatId is
-- NOT NULL, so they need a landing spot before the delete).
UPDATE "Orders"
SET "mediaFormatId" = (SELECT id FROM "MediaFormat" WHERE name = 'Non défini')
WHERE "mediaFormatId" IN (
    SELECT id FROM "MediaFormat" WHERE name IN (
        'Revue AFTC',
        'LUMEN Magazine UNADEV',
        'Journal COLIN MAILLARD UNADEV',
        'Gazette Paris en Compagnie GCSMS Paris',
        'La vie à Bry Bry Sur Marne',
        'Revue EDF EDF'
    )
);

-- Members whose preferred format was a revue simply have no preference now.
UPDATE "User"
SET "preferredMediaFormatId" = NULL
WHERE "preferredMediaFormatId" IN (
    SELECT id FROM "MediaFormat" WHERE name IN (
        'Revue AFTC',
        'LUMEN Magazine UNADEV',
        'Journal COLIN MAILLARD UNADEV',
        'Gazette Paris en Compagnie GCSMS Paris',
        'La vie à Bry Bry Sur Marne',
        'Revue EDF EDF'
    )
);

DELETE FROM "MediaFormat"
WHERE name IN (
    'Revue AFTC',
    'LUMEN Magazine UNADEV',
    'Journal COLIN MAILLARD UNADEV',
    'Gazette Paris en Compagnie GCSMS Paris',
    'La vie à Bry Bry Sur Marne',
    'Revue EDF EDF'
);

-- ---------------------------------------------------------------------------
-- 2. Démissionnaire -> Radié, et les trois statuts retirés -> Inactif
-- ---------------------------------------------------------------------------

UPDATE "User" SET "activityStatus" = 'RADIATION'
WHERE "activityStatus" = 'DEMISSION';

UPDATE "User" SET "activityStatus" = 'INACTIVE'
WHERE "activityStatus" IN ('ON_VACATION', 'SUSPENDED', 'PB_SANTE_MENTALE');

UPDATE "UserActivityEvent" SET "fromStatus" = 'RADIATION'
WHERE "fromStatus" = 'DEMISSION';

UPDATE "UserActivityEvent" SET "fromStatus" = 'INACTIVE'
WHERE "fromStatus" IN ('ON_VACATION', 'SUSPENDED', 'PB_SANTE_MENTALE');

UPDATE "UserActivityEvent" SET "toStatus" = 'RADIATION'
WHERE "toStatus" = 'DEMISSION';

UPDATE "UserActivityEvent" SET "toStatus" = 'INACTIVE'
WHERE "toStatus" IN ('ON_VACATION', 'SUSPENDED', 'PB_SANTE_MENTALE');

-- ---------------------------------------------------------------------------
-- 3. Recréation de l'enum sans les quatre valeurs retirées
-- ---------------------------------------------------------------------------
-- Guarded so a second run does nothing. Indexes on the re-typed columns are
-- rebuilt by ALTER COLUMN ... TYPE; the NOT NULL default on User is dropped and
-- restored around it because a default cannot be cast across types.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'UserActivityStatus'
          AND e.enumlabel IN ('DEMISSION', 'ON_VACATION', 'SUSPENDED', 'PB_SANTE_MENTALE')
    ) THEN
        ALTER TYPE "UserActivityStatus" RENAME TO "UserActivityStatus_old";

        CREATE TYPE "UserActivityStatus" AS ENUM (
            'ACTIVE',
            'UNAVAILABLE',
            'DECEASED',
            'RADIATION',
            'INACTIVE'
        );

        ALTER TABLE "User" ALTER COLUMN "activityStatus" DROP DEFAULT;

        ALTER TABLE "User"
            ALTER COLUMN "activityStatus" TYPE "UserActivityStatus"
            USING "activityStatus"::text::"UserActivityStatus";

        ALTER TABLE "User"
            ALTER COLUMN "activityStatus" SET DEFAULT 'ACTIVE'::"UserActivityStatus";

        ALTER TABLE "UserActivityEvent"
            ALTER COLUMN "fromStatus" TYPE "UserActivityStatus"
            USING "fromStatus"::text::"UserActivityStatus";

        ALTER TABLE "UserActivityEvent"
            ALTER COLUMN "toStatus" TYPE "UserActivityStatus"
            USING "toStatus"::text::"UserActivityStatus";

        DROP TYPE "UserActivityStatus_old";
    END IF;
END
$$;

COMMIT;
