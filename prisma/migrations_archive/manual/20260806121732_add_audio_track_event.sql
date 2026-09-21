-- CreateEnum
CREATE TYPE "AudioTrackAction" AS ENUM ('UPLOAD', 'RENAME', 'DELETE', 'RESTORE');

-- CreateTable
CREATE TABLE "AudioTrackEvent" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "action" "AudioTrackAction" NOT NULL,
    "filename" TEXT NOT NULL,
    "newFilename" TEXT,
    "sizeBytes" BIGINT,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTrackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudioTrackEvent_bookId_idx" ON "AudioTrackEvent"("bookId");

-- CreateIndex
CREATE INDEX "AudioTrackEvent_createdAt_idx" ON "AudioTrackEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AudioTrackEvent" ADD CONSTRAINT "AudioTrackEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTrackEvent" ADD CONSTRAINT "AudioTrackEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

