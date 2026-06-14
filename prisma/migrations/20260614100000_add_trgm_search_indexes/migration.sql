-- Trigram GIN indexes so case-insensitive substring search (ILIKE %token%) on
-- Product title/brand uses an index instead of a full scan. Critical once the
-- catalog grows to tens of thousands of rows (DB text search dropped from
-- ~1.2s to ~0.5s on 11k products).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_title_trgm ON "Product" USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_brand_trgm ON "Product" USING gin (brand gin_trgm_ops);
