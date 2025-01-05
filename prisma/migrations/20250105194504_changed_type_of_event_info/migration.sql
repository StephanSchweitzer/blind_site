/*
  Warnings:

  - The `type` column on the `News` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "News" DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'GENERAL';
