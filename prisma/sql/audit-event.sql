-- AuditEvent — append-only trail of writes to the audited models.
--
-- Purely additive: it creates one enum, one table and three indexes and touches
-- nothing that already exists, so it is safe to run against production while the
-- app is serving. Every statement is IF NOT EXISTS / guarded, so re-running it
-- is a no-op.
--
-- Apply with (never `migrate dev` / `migrate deploy` on this repo):
--   pnpm prisma db execute --file prisma/sql/audit-event.sql --schema prisma/schema.prisma

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditOperation') THEN
        CREATE TYPE "AuditOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id"         SERIAL           NOT NULL,
    "model"      TEXT             NOT NULL,
    "recordId"   TEXT             NOT NULL,
    "operation"  "AuditOperation" NOT NULL,
    "actorId"    INTEGER,
    "actorEmail" TEXT,
    "changes"    JSONB            NOT NULL,
    "snapshot"   JSONB,
    "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- createdAt drives both the timeline query and the retention purge.
CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- "everything that happened to this record".
CREATE INDEX IF NOT EXISTS "AuditEvent_model_recordId_idx" ON "AuditEvent"("model", "recordId");

-- actor filter on /admin/stats.
CREATE INDEX IF NOT EXISTS "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- No foreign key on "actorId" on purpose: the trail has to keep naming its
-- author after that user is deleted, which is exactly why "actorEmail" is
-- denormalized alongside it.
