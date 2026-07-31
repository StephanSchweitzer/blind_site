-- CreateTable
CREATE TABLE "BookMergeEvent" (
    "id" SERIAL NOT NULL,
    "canonicalId" INTEGER NOT NULL,
    "duplicateId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookMergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookMergeEvent_canonicalId_idx" ON "BookMergeEvent"("canonicalId");

-- CreateIndex
CREATE INDEX "BookMergeEvent_duplicateId_idx" ON "BookMergeEvent"("duplicateId");

-- CreateIndex
CREATE INDEX "BookMergeEvent_createdAt_idx" ON "BookMergeEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "BookMergeEvent" ADD CONSTRAINT "BookMergeEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
