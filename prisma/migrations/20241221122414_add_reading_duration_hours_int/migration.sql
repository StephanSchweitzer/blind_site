/*
  Warnings:

  - You are about to drop the column `readingDuration` on the `Book` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Book" DROP COLUMN "readingDuration",
ADD COLUMN     "readingDurationHours" INTEGER;
