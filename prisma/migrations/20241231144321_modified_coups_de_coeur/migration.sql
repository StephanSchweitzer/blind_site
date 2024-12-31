/*
  Warnings:

  - You are about to drop the column `postDate` on the `CoupsDeCoeur` table. All the data in the column will be lost.
  - Added the required column `addedById` to the `CoupsDeCoeur` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CoupsDeCoeur" DROP COLUMN "postDate",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "addedById" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeur" ADD CONSTRAINT "CoupsDeCoeur_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
