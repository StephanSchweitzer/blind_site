/*
  Warnings:

  - You are about to drop the column `coupsDeCoeurId` on the `Book` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Book" DROP CONSTRAINT "Book_coupsDeCoeurId_fkey";

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "coupsDeCoeurId";
