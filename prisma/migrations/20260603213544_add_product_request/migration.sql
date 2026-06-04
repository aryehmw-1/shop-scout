-- CreateTable
CREATE TABLE "ProductRequest" (
    "id" TEXT NOT NULL,
    "productQuery" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRequest_status_createdAt_idx" ON "ProductRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductRequest_userEmail_idx" ON "ProductRequest"("userEmail");
