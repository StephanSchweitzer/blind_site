-- DropForeignKey
ALTER TABLE "CoupsDeCoeurBooks" DROP CONSTRAINT "CoupsDeCoeurBooks_coupsDeCoeurId_fkey";

-- AddForeignKey
ALTER TABLE "CoupsDeCoeurBooks" ADD CONSTRAINT "CoupsDeCoeurBooks_coupsDeCoeurId_fkey" FOREIGN KEY ("coupsDeCoeurId") REFERENCES "CoupsDeCoeur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
