# Amazon persist diagnostics

Generated: 2026-05-29T17:33:33.694Z

## Summary

- Products tested: 8
- Amazon persist pass: **7**
- Amazon persist fail: **1**

### Persist rejection reasons

- `unknown`: 7
- `non_persistable_source`: 1

### Likely root causes

- would_persist: 7
- normalization_ok_but_price_not_applied_to_offer: 1

### pasta-spaghetti · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$1.56 → applied=$1.56 (scraped)
- **Plausibility:** raw ratio=1.05 applied ratio=1.05 (catalog $1.48)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$1.56
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.841 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.47
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B00FR6XGYY · PDP: https://www.amazon.com/dp/B00FR6XGYY
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### coffee-ground · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$11.00 → applied=$11.00 (scraped)
- **Plausibility:** raw ratio=1.1 applied ratio=1.1 (catalog $9.99)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$11
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.841 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.671
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B09HCW1CWG · PDP: https://www.amazon.com/dp/B09HCW1CWG
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### cereal-honey · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$5.37 → applied=$5.37 (scraped)
- **Plausibility:** raw ratio=1.12 applied ratio=1.12 (catalog $4.78)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$5.37
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.841 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.613
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B0D244LQVD · PDP: https://www.amazon.com/dp/B0D244LQVD
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### super-pretzel · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$4.99 → applied=$4.99 (scraped)
- **Plausibility:** raw ratio=1.43 applied ratio=1.43 (catalog $3.49)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$4.99
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.841 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.615
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B000RUSHFS · PDP: https://www.amazon.com/dp/B000RUSHFS
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### potato-chips · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$4.37 → applied=$4.37 (scraped)
- **Plausibility:** raw ratio=1.1 applied ratio=1.1 (catalog $3.99)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$4.37
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.798 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.231
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B07179XBP9 · PDP: https://www.amazon.com/dp/B07179XBP9
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### microwave-popcorn · amazon
- **Root cause:** normalization_ok_but_price_not_applied_to_offer
- **Persist rejection:** non_persistable_source: catalog_model
- **Price:** raw=$2.98 → applied=$2.98 (catalog_model)
- **Plausibility:** raw ratio=1 applied ratio=1 (catalog $2.99)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$2.98
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.798 reason=ok
- **Confidence:** match=0.370 identity=1.000 image=0.600 titleSim=0.098
- **Trust gates:** verified=false consumer=false image=true identifier=true
- **ASIN:** B002Z9LHAG · PDP: https://www.amazon.com/dp/B002Z9LHAG
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.370 (catalog_model)
- **Enrichment:** pricesExtracted=0 persistRejected=3

### cheese-crackers · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$3.21 → applied=$3.21 (scraped)
- **Plausibility:** raw ratio=0.98 applied ratio=0.98 (catalog $3.29)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$3.21
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.798 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.052
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B00KKY54SE · PDP: https://www.amazon.com/dp/B00KKY54SE
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2

### bread-wheat · amazon
- **Root cause:** would_persist
- **Persist rejection:** PASS
- **Price:** raw=$5.39 → applied=$5.39 (scraped)
- **Plausibility:** raw ratio=1.64 applied ratio=1.64 (catalog $3.29)
- **Normalization:** direct accepted=true reason=direct_catalog_match pack=1 normalized=$5.39
- **Bulk listing:** false
- **Amazon validation:** accepted=true score=0.841 reason=ok
- **Confidence:** match=0.864 identity=1.000 image=0.600 titleSim=0.674
- **Trust gates:** verified=true consumer=true image=true identifier=true
- **ASIN:** B004A94260 · PDP: https://www.amazon.com/dp/B004A94260
- **Reasons:** identity.upc: same UPC/GTIN | brand.match: same brand | attr.same_brand: same brand | price.estimated: estimated price only | url.search: search URL not verified PDP
- **Confidence arc:** compare=0.243 (catalog_model) → final=0.864 (scraped)
- **Enrichment:** pricesExtracted=1 persistRejected=2
