-- AlterTable
ALTER TABLE "ProductRequest" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "userEmail" SET DEFAULT '';

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryNormalized" TEXT,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "pageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductClick" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "retailer" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'product',
    "query" TEXT,
    "category" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingProduct" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryNormalized" TEXT,
    "category" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchEvent_createdAt_idx" ON "SearchEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_sessionId_idx" ON "SearchEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SearchEvent_userId_idx" ON "SearchEvent"("userId");

-- CreateIndex
CREATE INDEX "SearchEvent_query_idx" ON "SearchEvent"("query");

-- CreateIndex
CREATE INDEX "ProductClick_createdAt_idx" ON "ProductClick"("createdAt");

-- CreateIndex
CREATE INDEX "ProductClick_productId_idx" ON "ProductClick"("productId");

-- CreateIndex
CREATE INDEX "ProductClick_retailer_idx" ON "ProductClick"("retailer");

-- CreateIndex
CREATE INDEX "ProductClick_kind_idx" ON "ProductClick"("kind");

-- CreateIndex
CREATE INDEX "ProductClick_sessionId_idx" ON "ProductClick"("sessionId");

-- CreateIndex
CREATE INDEX "MissingProduct_createdAt_idx" ON "MissingProduct"("createdAt");

-- CreateIndex
CREATE INDEX "MissingProduct_query_idx" ON "MissingProduct"("query");

-- CreateIndex
CREATE INDEX "MissingProduct_sessionId_idx" ON "MissingProduct"("sessionId");

-- CreateIndex
CREATE INDEX "ProductRequest_createdAt_idx" ON "ProductRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ProductRequest_sessionId_idx" ON "ProductRequest"("sessionId");

-- CreateIndex
CREATE INDEX "ProductRequest_userId_idx" ON "ProductRequest"("userId");
