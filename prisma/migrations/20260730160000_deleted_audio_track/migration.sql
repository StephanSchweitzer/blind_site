-- CreateTable
CREATE TABLE "DeletedAudioTrack" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "originalKey" TEXT NOT NULL,
    "trashKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedById" INTEGER,
    "restoredAt" TIMESTAMP(3),
    "restoredById" INTEGER,

    CONSTRAINT "DeletedAudioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedAudioTrack_trashKey_key" ON "DeletedAudioTrack"("trashKey");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_bookId_idx" ON "DeletedAudioTrack"("bookId");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_deletedAt_idx" ON "DeletedAudioTrack"("deletedAt");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_restoredAt_idx" ON "DeletedAudioTrack"("restoredAt");

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_restoredById_fkey" FOREIGN KEY ("restoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
