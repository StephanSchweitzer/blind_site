-- DropIndex
DROP INDEX "Book_isbn_key";

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Book_deletedAt_idx" ON "Book"("deletedAt");

-- CreateIndex (hand-written — prisma/schema.prisma cannot express a partial
-- unique index; see the comment on Book.isbn there before touching either).
-- Unique only among live books, so a soft-deleted book's ISBN doesn't block a
-- future, unrelated book from reusing it. `db push` will not drop this: it
-- only ever acts on what the schema declares, and the schema declares nothing
-- about isbn's uniqueness at all now.
CREATE UNIQUE INDEX "Book_isbn_key" ON "Book"("isbn") WHERE "deletedAt" IS NULL;
