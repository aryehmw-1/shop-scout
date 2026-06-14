CREATE TABLE IF NOT EXISTS "ProductMatchDecision" (
  "id" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "productAId" TEXT,
  "productBId" TEXT,
  "titleA" TEXT NOT NULL,
  "titleB" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL,
  "reasonsJson" TEXT NOT NULL DEFAULT '[]',
  "adminStatus" TEXT NOT NULL DEFAULT 'pending',
  "adminOverride" TEXT,
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "ProductMatchDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMatchDecision_pairKey_key" ON "ProductMatchDecision"("pairKey");
CREATE INDEX IF NOT EXISTS "ProductMatchDecision_adminStatus_createdAt_idx" ON "ProductMatchDecision"("adminStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductMatchDecision_decision_confidence_idx" ON "ProductMatchDecision"("decision", "confidence");
