-- prisma/migrations/migration.sql
ALTER TABLE "Book" RENAME COLUMN "readingDurationHours" TO "readingDurationMinutes";
ALTER TABLE "Genre" RENAME COLUMN "descritption" TO "description";