-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "readingDuration" TEXT,
ALTER COLUMN "publishedDate" DROP NOT NULL,
ALTER COLUMN "isbn" DROP NOT NULL;
