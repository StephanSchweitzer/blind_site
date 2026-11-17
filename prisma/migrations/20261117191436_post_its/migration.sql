-- CreateTable
CREATE TABLE "PostIt" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER,
    "remindOn" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" INTEGER,
    "userId" INTEGER,
    "orderId" INTEGER,
    "assignmentId" INTEGER,
    "billId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostIt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostIt_doneAt_idx" ON "PostIt"("doneAt");

-- CreateIndex
CREATE INDEX "PostIt_userId_idx" ON "PostIt"("userId");

-- CreateIndex
CREATE INDEX "PostIt_orderId_idx" ON "PostIt"("orderId");

-- CreateIndex
CREATE INDEX "PostIt_assignmentId_idx" ON "PostIt"("assignmentId");

-- CreateIndex
CREATE INDEX "PostIt_billId_idx" ON "PostIt"("billId");

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIt" ADD CONSTRAINT "PostIt_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
