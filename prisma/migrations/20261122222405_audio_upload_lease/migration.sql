-- CreateTable
CREATE TABLE "AudioUploadLease" (
    "bookId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioUploadLease_pkey" PRIMARY KEY ("bookId")
);
