-- AlterTable
ALTER TABLE "DeletedAudioTrack" ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "retainForever" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_purgedAt_idx" ON "DeletedAudioTrack"("purgedAt");

-- Grandfather every row that already exists: the 14-day purge must never
-- retroactively apply to entries soft-deleted under the old "restorable at
-- any time, no purge, ever" promise. Only deletions made after this migration
-- runs get retainForever = false (the column default), so they alone become
-- eligible for the nightly sweep once they cross 14 days.
UPDATE "DeletedAudioTrack" SET "retainForever" = true;
