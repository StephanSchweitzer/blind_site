-- AlterTable
ALTER TABLE "DeletedAudioTrack" ADD COLUMN     "purgedById" INTEGER;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_purgedById_fkey" FOREIGN KEY ("purgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
