-- CreateEnum
CREATE TYPE "BillKind" AS ENUM ('STANDARD', 'PROFORMA');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "kind" "BillKind" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "Orders" ADD COLUMN     "billedPages" INTEGER,
ADD COLUMN     "pages" INTEGER,
ADD COLUMN     "pricePerPage" DECIMAL(10,2),
ADD COLUMN     "transferFee" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "Bill_kind_idx" ON "Bill"("kind");
