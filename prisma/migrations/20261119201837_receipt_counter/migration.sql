-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("year")
);
