-- Adds the column introduced with the auto-derived reading duration (commit
-- 8525564). It reached prisma/schema.prisma and the code, but never the
-- database, so every route that reads or writes it fails with P2022:
-- resolveTrackDurations() in lib/audio/state.ts selects it on every
-- refreshBookAudioState(), and the upload commit route inserts it.
--
-- Nullable and unbackfilled on purpose: it is only ever set for UPLOAD, and
-- only when the browser could read the length off the file.

-- AlterTable
ALTER TABLE "AudioTrackEvent" ADD COLUMN "durationSeconds" INTEGER;
