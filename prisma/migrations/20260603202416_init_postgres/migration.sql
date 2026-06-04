-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "zipCode" TEXT,
    "addressJson" TEXT NOT NULL DEFAULT '{}',
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "brandCanonical" TEXT,
    "brandRaw" TEXT,
    "upc" TEXT,
    "gtin" TEXT,
    "mpn" TEXT,
    "manufacturerPartNumber" TEXT,
    "category" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL DEFAULT '1 unit',
    "basePriceUsd" DOUBLE PRECISION NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'each',
    "imageUrl" TEXT,
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',
    "organic" BOOLEAN NOT NULL DEFAULT false,
    "popularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "searchFrequency" INTEGER NOT NULL DEFAULT 0,
    "clickFrequency" INTEGER NOT NULL DEFAULT 0,
    "refreshPriority" INTEGER NOT NULL DEFAULT 50,
    "embeddingJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'direct',
    "websiteUrl" TEXT,
    "affiliateNetwork" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCanonical" (
    "id" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandCanonical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIdentifier" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "variantGroupId" TEXT,
    "variantId" TEXT,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'catalog',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'keyword',

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "catalogGroupId" TEXT NOT NULL,
    "color" TEXT,
    "colorNormalized" TEXT,
    "styleKey" TEXT,
    "upc" TEXT,
    "gtin" TEXT,
    "mpn" TEXT,
    "manufacturerPartNumber" TEXT,
    "canonicalImageUrl" TEXT,
    "retailerImageUrlsJson" TEXT NOT NULL DEFAULT '{}',
    "imageSource" TEXT,
    "imageConfidence" DOUBLE PRECISION,
    "imageQualityJson" TEXT NOT NULL DEFAULT '{}',
    "matchConfidence" DOUBLE PRECISION,
    "identityConfidence" DOUBLE PRECISION,
    "attributeConfidence" DOUBLE PRECISION,
    "confidenceReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "lastVerifiedAt" TIMESTAMP(3),
    "attributesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantGroupId" TEXT NOT NULL,
    "catalogVariantId" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "sizeNormalized" TEXT NOT NULL,
    "sizeKind" TEXT NOT NULL DEFAULT 'unknown',
    "upc" TEXT,
    "gtin" TEXT,
    "mpn" TEXT,
    "manufacturerPartNumber" TEXT,
    "sizeSpecificImageUrl" TEXT,
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',
    "basePriceUsd" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantGroupId" TEXT,
    "variantId" TEXT,
    "retailerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "storeTitle" TEXT,
    "imageUrl" TEXT,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "wasPriceUsd" DOUBLE PRECISION,
    "shippingUsd" DOUBLE PRECISION,
    "estimatedTaxUsd" DOUBLE PRECISION,
    "deliveredTotalUsd" DOUBLE PRECISION,
    "landedCostUsd" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "identityConfidence" DOUBLE PRECISION,
    "attributeConfidence" DOUBLE PRECISION,
    "imageConfidence" DOUBLE PRECISION,
    "confidenceReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "providerSource" TEXT,
    "sourceLabel" TEXT,
    "externalOfferId" TEXT,
    "sellerName" TEXT,
    "sellerFeedbackPct" DOUBLE PRECISION,
    "sellerFeedbackScore" INTEGER,
    "condition" TEXT,
    "returnPolicy" TEXT,
    "productUrl" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryQaReview" (
    "id" TEXT NOT NULL,
    "priceQuoteId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryQaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerProductIdentity" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "externalSku" TEXT,
    "retailerBrandRaw" TEXT,
    "storeTitle" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "upc" TEXT,
    "gtin" TEXT,
    "mpn" TEXT,
    "manufacturerPartNumber" TEXT,
    "productId" TEXT,
    "variantGroupId" TEXT,
    "variantId" TEXT,
    "rawAttributesJson" TEXT NOT NULL DEFAULT '{}',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerProductIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistorySnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'online',
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "storeTitle" TEXT,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantGroupId" TEXT,
    "variantId" TEXT,
    "retailerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'online',
    "observedPrice" DOUBLE PRECISION NOT NULL,
    "availability" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "storeTitle" TEXT,
    "imageUrl" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "identityConfidence" DOUBLE PRECISION,
    "confidenceReasonsJson" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRetailerPriceStats" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'online',
    "firstSeenPriceUsd" DOUBLE PRECISION,
    "firstSeenAt" TIMESTAMP(3),
    "lowestPriceUsd" DOUBLE PRECISION,
    "lowestPriceAt" TIMESTAMP(3),
    "movingAvgPriceUsd" DOUBLE PRECISION,
    "lastVerifiedPriceUsd" DOUBLE PRECISION,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRetailerPriceStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerQualityMetric" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    "fetchSuccesses" INTEGER NOT NULL DEFAULT 0,
    "parserAttempts" INTEGER NOT NULL DEFAULT 0,
    "parserSuccesses" INTEGER NOT NULL DEFAULT 0,
    "offersRejected" INTEGER NOT NULL DEFAULT 0,
    "offersAccepted" INTEGER NOT NULL DEFAULT 0,
    "avgMatchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgFetchLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerQualityMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "zipCode" TEXT NOT NULL,
    "queryRaw" TEXT NOT NULL,
    "intentJson" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'search',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "bestPriceUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resolvedCatalogId" TEXT,
    "queryNormalized" TEXT NOT NULL,
    "attributesJson" TEXT NOT NULL DEFAULT '{}',
    "offerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_catalogId_key" ON "Product"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_upc_idx" ON "Product"("upc");

-- CreateIndex
CREATE INDEX "Product_gtin_idx" ON "Product"("gtin");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_brandCanonical_idx" ON "Product"("brandCanonical");

-- CreateIndex
CREATE INDEX "Product_refreshPriority_idx" ON "Product"("refreshPriority");

-- CreateIndex
CREATE INDEX "Retailer_enabled_idx" ON "Retailer"("enabled");

-- CreateIndex
CREATE INDEX "Retailer_sourceType_idx" ON "Retailer"("sourceType");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_path_idx" ON "Category"("path");

-- CreateIndex
CREATE UNIQUE INDEX "BrandCanonical_canonical_key" ON "BrandCanonical"("canonical");

-- CreateIndex
CREATE INDEX "ProductIdentifier_productId_idx" ON "ProductIdentifier"("productId");

-- CreateIndex
CREATE INDEX "ProductIdentifier_variantGroupId_idx" ON "ProductIdentifier"("variantGroupId");

-- CreateIndex
CREATE INDEX "ProductIdentifier_variantId_idx" ON "ProductIdentifier"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductIdentifier_type_value_key" ON "ProductIdentifier"("type", "value");

-- CreateIndex
CREATE INDEX "ProductAlias_alias_idx" ON "ProductAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_productId_alias_key" ON "ProductAlias"("productId", "alias");

-- CreateIndex
CREATE INDEX "VariantGroup_colorNormalized_idx" ON "VariantGroup"("colorNormalized");

-- CreateIndex
CREATE INDEX "VariantGroup_lastVerifiedAt_idx" ON "VariantGroup"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "VariantGroup_upc_idx" ON "VariantGroup"("upc");

-- CreateIndex
CREATE INDEX "VariantGroup_gtin_idx" ON "VariantGroup"("gtin");

-- CreateIndex
CREATE UNIQUE INDEX "VariantGroup_productId_catalogGroupId_key" ON "VariantGroup"("productId", "catalogGroupId");

-- CreateIndex
CREATE INDEX "ProductVariant_variantGroupId_idx" ON "ProductVariant"("variantGroupId");

-- CreateIndex
CREATE INDEX "ProductVariant_sizeNormalized_idx" ON "ProductVariant"("sizeNormalized");

-- CreateIndex
CREATE INDEX "ProductVariant_gtin_idx" ON "ProductVariant"("gtin");

-- CreateIndex
CREATE INDEX "ProductVariant_upc_idx" ON "ProductVariant"("upc");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_catalogVariantId_key" ON "ProductVariant"("productId", "catalogVariantId");

-- CreateIndex
CREATE INDEX "PriceQuote_productId_retailerId_channel_idx" ON "PriceQuote"("productId", "retailerId", "channel");

-- CreateIndex
CREATE INDEX "PriceQuote_productId_expiresAt_idx" ON "PriceQuote"("productId", "expiresAt");

-- CreateIndex
CREATE INDEX "PriceQuote_variantGroupId_idx" ON "PriceQuote"("variantGroupId");

-- CreateIndex
CREATE INDEX "PriceQuote_source_expiresAt_idx" ON "PriceQuote"("source", "expiresAt");

-- CreateIndex
CREATE INDEX "PriceQuote_retailerId_fetchedAt_idx" ON "PriceQuote"("retailerId", "fetchedAt");

-- CreateIndex
CREATE INDEX "PriceQuote_providerSource_fetchedAt_idx" ON "PriceQuote"("providerSource", "fetchedAt");

-- CreateIndex
CREATE INDEX "PriceQuote_externalOfferId_idx" ON "PriceQuote"("externalOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryQaReview_priceQuoteId_key" ON "InventoryQaReview"("priceQuoteId");

-- CreateIndex
CREATE INDEX "InventoryQaReview_catalogId_idx" ON "InventoryQaReview"("catalogId");

-- CreateIndex
CREATE INDEX "InventoryQaReview_status_idx" ON "InventoryQaReview"("status");

-- CreateIndex
CREATE INDEX "RetailerProductIdentity_productId_idx" ON "RetailerProductIdentity"("productId");

-- CreateIndex
CREATE INDEX "RetailerProductIdentity_upc_idx" ON "RetailerProductIdentity"("upc");

-- CreateIndex
CREATE INDEX "RetailerProductIdentity_gtin_idx" ON "RetailerProductIdentity"("gtin");

-- CreateIndex
CREATE INDEX "RetailerProductIdentity_retailerId_lastSeenAt_idx" ON "RetailerProductIdentity"("retailerId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerProductIdentity_retailerId_productUrl_key" ON "RetailerProductIdentity"("retailerId", "productUrl");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_productId_retailerId_observedAt_idx" ON "PriceHistorySnapshot"("productId", "retailerId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_retailerId_observedAt_idx" ON "PriceHistorySnapshot"("retailerId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_observedAt_idx" ON "PriceHistorySnapshot"("observedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_retailerId_observedAt_idx" ON "PriceHistory"("productId", "retailerId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_variantGroupId_observedAt_idx" ON "PriceHistory"("variantGroupId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_variantId_observedAt_idx" ON "PriceHistory"("variantId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_observedAt_idx" ON "PriceHistory"("observedAt");

-- CreateIndex
CREATE INDEX "ProductRetailerPriceStats_productId_idx" ON "ProductRetailerPriceStats"("productId");

-- CreateIndex
CREATE INDEX "ProductRetailerPriceStats_retailerId_idx" ON "ProductRetailerPriceStats"("retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRetailerPriceStats_productId_retailerId_channel_key" ON "ProductRetailerPriceStats"("productId", "retailerId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerQualityMetric_retailerId_key" ON "RetailerQualityMetric"("retailerId");

-- CreateIndex
CREATE INDEX "SearchSession_userId_createdAt_idx" ON "SearchSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchSession_createdAt_idx" ON "SearchSession"("createdAt");

-- CreateIndex
CREATE INDEX "SearchQuery_sessionId_idx" ON "SearchQuery"("sessionId");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_kind_createdAt_idx" ON "LearningEvent"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "SavedOffer_userId_createdAt_idx" ON "SavedOffer"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductIdentifier" ADD CONSTRAINT "ProductIdentifier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantGroup" ADD CONSTRAINT "VariantGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_variantGroupId_fkey" FOREIGN KEY ("variantGroupId") REFERENCES "VariantGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryQaReview" ADD CONSTRAINT "InventoryQaReview_priceQuoteId_fkey" FOREIGN KEY ("priceQuoteId") REFERENCES "PriceQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerProductIdentity" ADD CONSTRAINT "RetailerProductIdentity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistorySnapshot" ADD CONSTRAINT "PriceHistorySnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRetailerPriceStats" ADD CONSTRAINT "ProductRetailerPriceStats_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchSession" ADD CONSTRAINT "SearchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedOffer" ADD CONSTRAINT "SavedOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
