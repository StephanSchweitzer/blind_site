-- Cache of per-track playback lengths measured from the bucket.
--
-- Backs the « Recalculer » button next to Durée de la lecture: measuring a
-- folder costs one ranged GET per track, and a row here means the next press
-- costs nothing for that track.
--
-- Not an event log: rows are updated in place. The (bookId, filename) unique is
-- what the upsert targets; sizeBytes is stored rather than keyed on, so a track
-- replaced under the same name overwrites its row instead of accumulating one
-- per revision — and is re-measured, because the reader compares the stored
-- weight against the bucket listing before believing the row.

-- CreateTable
CREATE TABLE "AudioTrackDuration" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "exact" BOOLEAN NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTrackDuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioTrackDuration_bookId_filename_key"
    ON "AudioTrackDuration"("bookId", "filename");

-- CreateIndex
CREATE INDEX "AudioTrackDuration_bookId_idx" ON "AudioTrackDuration"("bookId");

-- AddForeignKey
ALTER TABLE "AudioTrackDuration"
    ADD CONSTRAINT "AudioTrackDuration_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
