-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('RETRAIT', 'ENVOI', 'NON_APPLICABLE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('UNBILLED', 'BILLED', 'PAID');

-- CreateTable
CREATE TABLE "Status" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFormat" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),

    CONSTRAINT "MediaFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "stateId" INTEGER NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "invoiceAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
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

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "readerId" INTEGER NOT NULL,
    "catalogueId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "receptionDate" TIMESTAMP(3),
    "sentToReaderDate" TIMESTAMP(3),
    "returnedToECADate" TIMESTAMP(3),
    "statusId" INTEGER NOT NULL,
    "notes" TEXT,
    "processedByStaffId" INTEGER,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Status_name_key" ON "Status"("name");

-- CreateIndex
CREATE INDEX "Status_name_idx" ON "Status"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFormat_name_key" ON "MediaFormat"("name");

-- CreateIndex
CREATE INDEX "MediaFormat_name_idx" ON "MediaFormat"("name");

-- CreateIndex
CREATE INDEX "Bill_clientId_idx" ON "Bill"("clientId");

-- CreateIndex
CREATE INDEX "Bill_stateId_idx" ON "Bill"("stateId");

-- CreateIndex
CREATE INDEX "Bill_creationDate_idx" ON "Bill"("creationDate");

-- CreateIndex
CREATE INDEX "Order_aveugleId_idx" ON "Order"("aveugleId");

-- CreateIndex
CREATE INDEX "Order_catalogueId_idx" ON "Order"("catalogueId");

-- CreateIndex
CREATE INDEX "Order_statusId_idx" ON "Order"("statusId");

-- CreateIndex
CREATE INDEX "Order_billingStatus_idx" ON "Order"("billingStatus");

-- CreateIndex
CREATE INDEX "Order_mediaFormatId_idx" ON "Order"("mediaFormatId");

-- CreateIndex
CREATE INDEX "Order_billId_idx" ON "Order"("billId");

-- CreateIndex
CREATE INDEX "Assignment_readerId_idx" ON "Assignment"("readerId");

-- CreateIndex
CREATE INDEX "Assignment_catalogueId_idx" ON "Assignment"("catalogueId");

-- CreateIndex
CREATE INDEX "Assignment_orderId_idx" ON "Assignment"("orderId");

-- CreateIndex
CREATE INDEX "Assignment_statusId_idx" ON "Assignment"("statusId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_aveugleId_fkey" FOREIGN KEY ("aveugleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_mediaFormatId_fkey" FOREIGN KEY ("mediaFormatId") REFERENCES "MediaFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
