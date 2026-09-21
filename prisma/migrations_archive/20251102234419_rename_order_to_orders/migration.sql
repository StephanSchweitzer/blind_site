/*
  Warnings:

  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_aveugleId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_billId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_catalogueId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_mediaFormatId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_processedByStaffId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_statusId_fkey";

-- DropTable
DROP TABLE "Order";

-- CreateTable
CREATE TABLE "Orders" (
    "id" SERIAL NOT NULL,
    "aveugleId" INTEGER NOT NULL,
    "catalogueId" INTEGER NOT NULL,
    "requestReceivedDate" TIMESTAMP(3) NOT NULL,
    "statusId" INTEGER NOT NULL,
    "isDuplication" BOOLEAN NOT NULL,
    "mediaFormatId" INTEGER NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "processedByStaffId" INTEGER,
    "createdDate" TIMESTAMP(3),
    "closureDate" TIMESTAMP(3),
    "cost" DECIMAL(10,2),
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'UNBILLED',
    "billId" INTEGER,
    "lentPhysicalBook" BOOLEAN NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Orders_aveugleId_idx" ON "Orders"("aveugleId");

-- CreateIndex
CREATE INDEX "Orders_catalogueId_idx" ON "Orders"("catalogueId");

-- CreateIndex
CREATE INDEX "Orders_statusId_idx" ON "Orders"("statusId");

-- CreateIndex
CREATE INDEX "Orders_billingStatus_idx" ON "Orders"("billingStatus");

-- CreateIndex
CREATE INDEX "Orders_mediaFormatId_idx" ON "Orders"("mediaFormatId");

-- CreateIndex
CREATE INDEX "Orders_billId_idx" ON "Orders"("billId");

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_aveugleId_fkey" FOREIGN KEY ("aveugleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_mediaFormatId_fkey" FOREIGN KEY ("mediaFormatId") REFERENCES "MediaFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
