-- CreateEnum
CREATE TYPE "AudioLinkStatus" AS ENUM ('OK', 'FOLDER_EMPTY', 'FOLDER_MISSING', 'NO_PATH', 'UNVERIFIED');

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "audioCheckedAt" TIMESTAMP(3),
ADD COLUMN     "audioLinkStatus" "AudioLinkStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "audioTrackCount" INTEGER;

-- CreateTable
CREATE TABLE "AudioFilepathBackup" (
    "bookId" INTEGER NOT NULL,
    "oldPath" TEXT NOT NULL,
    "newPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioFilepathBackup_pkey" PRIMARY KEY ("bookId")
);

-- CreateTable
CREATE TABLE "OrphanAudioFolder" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER,
    "folderNum" INTEGER,
    "title" TEXT NOT NULL,
    "trackCount" INTEGER NOT NULL,
    "bytes" BIGINT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "linkedBookId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "OrphanAudioFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrphanAudioFolder_prefix_key" ON "OrphanAudioFolder"("prefix");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_folderNum_idx" ON "OrphanAudioFolder"("folderNum");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_year_idx" ON "OrphanAudioFolder"("year");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_dismissedAt_idx" ON "OrphanAudioFolder"("dismissedAt");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_resolvedAt_idx" ON "OrphanAudioFolder"("resolvedAt");

-- CreateIndex
CREATE INDEX "Book_audioLinkStatus_idx" ON "Book"("audioLinkStatus");

-- AddForeignKey
ALTER TABLE "OrphanAudioFolder" ADD CONSTRAINT "OrphanAudioFolder_linkedBookId_fkey" FOREIGN KEY ("linkedBookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
