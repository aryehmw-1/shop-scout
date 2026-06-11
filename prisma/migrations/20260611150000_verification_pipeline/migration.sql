-- AlterTable
ALTER TABLE "PriceQuote" ADD COLUMN     "confidenceScore" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "duplicateGroupId" TEXT,
ADD COLUMN     "lastInventoryCheck" TIMESTAMP(3),
ADD COLUMN     "lastPriceCheck" TIMESTAMP(3),
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "validationReasonsJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "validationStatus" TEXT NOT NULL DEFAULT 'approved';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "confidenceScore" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "duplicateGroupId" TEXT,
ADD COLUMN     "lastInventoryCheck" TIMESTAMP(3),
ADD COLUMN     "lastPriceCheck" TIMESTAMP(3),
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "processingStatus" TEXT NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validationReasonsJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "validationStatus" TEXT NOT NULL DEFAULT 'approved';

-- CreateTable
CREATE TABLE "RetailerSource" (
    "id" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "retailerDomain" TEXT NOT NULL,
    "brightDataDatasetId" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'url',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawProductRecord" (
    "id" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "retailerDomain" TEXT,
    "productUrl" TEXT,
    "title" TEXT,
    "brand" TEXT,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION,
    "availability" TEXT,
    "upcGtin" TEXT,
    "ean" TEXT,
    "gtin" TEXT,
    "modelNumber" TEXT,
    "size" TEXT,
    "quantity" TEXT,
    "unitCount" INTEGER,
    "color" TEXT,
    "variant" TEXT,
    "category" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "processingStatus" TEXT NOT NULL DEFAULT 'RAW',
    "validationStatus" TEXT,
    "confidenceScore" INTEGER,
    "validationReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "duplicateGroupId" TEXT,
    "matchedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawProductRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "rawProductRecordId" TEXT,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "score" INTEGER,
    "reasonsJson" TEXT NOT NULL DEFAULT '[]',
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiResultJson" TEXT,
    "adminOverride" BOOLEAN NOT NULL DEFAULT false,
    "adminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailerSource_active_idx" ON "RetailerSource"("active");

-- CreateIndex
CREATE INDEX "RetailerSource_retailerName_idx" ON "RetailerSource"("retailerName");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerSource_retailerDomain_brightDataDatasetId_key" ON "RetailerSource"("retailerDomain", "brightDataDatasetId");

-- CreateIndex
CREATE INDEX "RawProductRecord_processingStatus_idx" ON "RawProductRecord"("processingStatus");

-- CreateIndex
CREATE INDEX "RawProductRecord_validationStatus_idx" ON "RawProductRecord"("validationStatus");

-- CreateIndex
CREATE INDEX "RawProductRecord_retailer_idx" ON "RawProductRecord"("retailer");

-- CreateIndex
CREATE INDEX "RawProductRecord_upcGtin_idx" ON "RawProductRecord"("upcGtin");

-- CreateIndex
CREATE INDEX "RawProductRecord_duplicateGroupId_idx" ON "RawProductRecord"("duplicateGroupId");

-- CreateIndex
CREATE INDEX "RawProductRecord_matchedProductId_idx" ON "RawProductRecord"("matchedProductId");

-- CreateIndex
CREATE INDEX "RawProductRecord_scrapedAt_idx" ON "RawProductRecord"("scrapedAt");

-- CreateIndex
CREATE INDEX "ValidationLog_productId_createdAt_idx" ON "ValidationLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ValidationLog_rawProductRecordId_createdAt_idx" ON "ValidationLog"("rawProductRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "ValidationLog_newStatus_createdAt_idx" ON "ValidationLog"("newStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Product_published_idx" ON "Product"("published");

-- CreateIndex
CREATE INDEX "Product_validationStatus_idx" ON "Product"("validationStatus");

-- CreateIndex
CREATE INDEX "Product_duplicateGroupId_idx" ON "Product"("duplicateGroupId");

