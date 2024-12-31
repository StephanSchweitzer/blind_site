-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coupsDeCoeurId" INTEGER;

-- CreateTable
CREATE TABLE "CoupsDeCoeur" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "postDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audioPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoupsDeCoeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoupsDeCoeurBooks" (
    "coupsDeCoeurId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,

    CONSTRAINT "CoupsDeCoeurBooks_pkey" PRIMARY KEY ("coupsDeCoeurId","bookId")
);

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_coupsDeCoeurId_fkey" FOREIGN KEY ("coupsDeCoeurId") REFERENCES "CoupsDeCoeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeurBooks" ADD CONSTRAINT "CoupsDeCoeurBooks_coupsDeCoeurId_fkey" FOREIGN KEY ("coupsDeCoeurId") REFERENCES "CoupsDeCoeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeurBooks" ADD CONSTRAINT "CoupsDeCoeurBooks_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
