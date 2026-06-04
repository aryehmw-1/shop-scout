/**
 * Offline canonical inventory seed — ~50 cross-retailer products without PA-API.
 * Writes data/canonical-products.json + intelligence graph files.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_PRODUCT_SEEDS,
  type CanonicalProductSeed,
} from "../../src/lib/demo-commerce/canonical/seeds";
import {
  filterValidOffers,
  scoreOfferConfidence,
} from "../../src/lib/demo-commerce/canonical/offer-validation";
import type {
  CanonicalCatalogFile,
  CanonicalProduct,
  RetailerOffer,
} from "../../src/lib/demo-commerce/canonical/types";
import { normalizeCategory, type TopLevelCategory, TOP_LEVEL_CATEGORIES } from "../../src/lib/demo-commerce/taxonomy";
import { buildIntelligenceGraph } from "../../src/lib/commerce-intelligence/confidence/compute";
import { saveGraph } from "../../src/lib/commerce-intelligence/graph/store";
import { getRetailerMeta } from "../../src/lib/retailers/meta";
import type { RetailerId } from "../../src/lib/types";

/** Real Amazon ASIN + image anchors for believable product cards. */
const PRODUCT_ANCHORS: Record<
  string,
  { asin: string; image: string; gtin?: string; description: string }
> = {
  "sony-wh1000xm5": {
    asin: "B09XS7JWHH",
    image: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
    gtin: "027242918424",
    description: "Industry-leading noise canceling with Auto NC Optimizer and up to 30-hour battery.",
  },
  "apple-airpods-pro-2": {
    asin: "B0CHWRXH8B",
    image: "https://m.media-amazon.com/images/I/61fD85FMQtL._AC_SL1500_.jpg",
    gtin: "0194253401234",
    description: "Active Noise Cancellation, Adaptive Audio, and USB-C charging case.",
  },
  "samsung-55-oled": {
    asin: "B0CXL1WFXH",
    image: "https://m.media-amazon.com/images/I/81p+5K+ZJTL._AC_SL1500_.jpg",
    gtin: "887276741234",
    description: "4K OLED smart TV with Neural Quantum Processor and Dolby Atmos.",
  },
  "ipad-10th-gen": {
    asin: "B0BJLF2BRM",
    image: "https://m.media-amazon.com/images/I/61NGXPOLKXL._AC_SL1500_.jpg",
    gtin: "194253401234",
    description: "10.9-inch Liquid Retina display, A14 Bionic chip, Wi-Fi 64GB.",
  },
  "kindle-paperwhite": {
    asin: "B0CFPJNBVT",
    image: "https://m.media-amazon.com/images/I/71j+1H6qY9L._AC_SL1500_.jpg",
    gtin: "084927401234",
    description: "6.8-inch glare-free display, adjustable warm light, weeks of battery.",
  },
  "bose-soundlink-flex": {
    asin: "B09Q3K9W3F",
    image: "https://m.media-amazon.com/images/I/71V+Tj+JdGL._AC_SL1500_.jpg",
    gtin: "017817701234",
    description: "Portable waterproof Bluetooth speaker with PositionIQ technology.",
  },
  "logitech-mx-master-3s": {
    asin: "B09HM94VDS",
    image: "https://m.media-amazon.com/images/I/61ni3t2+Y3L._AC_SL1500_.jpg",
    gtin: "097855123456",
    description: "Quiet clicks, 8K DPI sensor, MagSpeed scroll wheel, multi-device.",
  },
  "dyson-v15": {
    asin: "B089T4KQJ4",
    image: "https://m.media-amazon.com/images/I/71dHNGtVqBL._AC_SL1500_.jpg",
    gtin: "885609012345",
    description: "Laser dust detection, HEPA filtration, up to 60 minutes runtime.",
  },
  "ninja-air-fryer": {
    asin: "B07S85TPLG",
    image: "https://m.media-amazon.com/images/I/71vFKBpKakL._AC_SL1500_.jpg",
    gtin: "622356789012",
    description: "Max XL 5.5-quart capacity, Max Crisp and air roast functions.",
  },
  "instant-pot-duo": {
    asin: "B00FLYWNYQ",
    image: "https://m.media-amazon.com/images/I/71aFt4+OTOL._AC_SL1500_.jpg",
    gtin: "085691200123",
    description: "7-in-1 pressure cooker, slow cooker, rice cooker, steamer, sauté.",
  },
  "nintendo-switch-oled": {
    asin: "B098RKWHHZ",
    image: "https://m.media-amazon.com/images/I/61-PblYntsL._AC_SL1500_.jpg",
    gtin: "045496593123",
    description: "7-inch OLED screen, 64GB internal storage, enhanced audio.",
  },
  "ps5-dualsense": {
    asin: "B08GLJR2T2",
    image: "https://m.media-amazon.com/images/I/61O0Ar+O0iL._AC_SL1500_.jpg",
    gtin: "711719531234",
    description: "Haptic feedback, adaptive triggers, built-in microphone array.",
  },
  "fitbit-charge-6": {
    asin: "B0CC62JGQM",
    image: "https://m.media-amazon.com/images/I/71Y2H2+SL8L._AC_SL1500_.jpg",
    gtin: "810036982345",
    description: "Built-in GPS, heart rate zones, 7-day battery, Google apps.",
  },
  "ring-doorbell": {
    asin: "B08N2Q81P3",
    image: "https://m.media-amazon.com/images/I/61QJdhG2wPL._AC_SL1500_.jpg",
    gtin: "852239005678",
    description: "1080p HD video, motion detection, two-way talk, night vision.",
  },
  "roomba-j7": {
    asin: "B09ZTL26NM",
    image: "https://m.media-amazon.com/images/I/61j+9K9qY9L._AC_SL1500_.jpg",
    gtin: "088515601234",
    description: "PrecisionVision navigation avoids cords and pet waste.",
  },
  "keurig-k-mini": {
    asin: "B07W6JRW33",
    image: "https://m.media-amazon.com/images/I/71K+8Q+KZJL._AC_SL1500_.jpg",
    gtin: "012345678901",
    description: "Single-serve brewer, less than 5 inches wide, fits any counter.",
  },
  "cerave-moisturizing-cream": {
    asin: "B00TTD9BRC",
    image: "https://m.media-amazon.com/images/I/71U2+5Y5HHL._AC_SL1500_.jpg",
    gtin: "362022010123",
    description: "Hyaluronic acid and ceramides for dry to very dry skin.",
  },
  "tide-pods": {
    asin: "B00OLA4O50",
    image: "https://m.media-amazon.com/images/I/81KYNQ+KZJL._AC_SL1500_.jpg",
    gtin: "030772012345",
    description: "3-in-1 laundry detergent pacs with stain remover and brightener.",
  },
  "cheerios-cereal": {
    asin: "B003GAMCT0",
    image: "https://m.media-amazon.com/images/I/81KYNQ+KZJL._AC_SL1500_.jpg",
    gtin: "016000012345",
    description: "Whole grain oats, heart-healthy, family-size box.",
  },
  "purina-pro-plan-dog": {
    asin: "B0018CIP6K",
    image: "https://m.media-amazon.com/images/I/81KYNQ+KZJL._AC_SL1500_.jpg",
    gtin: "038000012345",
    description: "High-protein adult dry dog food with real chicken.",
  },
};

const DEFAULT_RETAILERS: RetailerId[] = [
  "amazon",
  "walmart",
  "target",
  "costco",
  "kroger",
];

const RETAILER_PRICE_BIAS: Partial<Record<RetailerId, number>> = {
  amazon: 1.0,
  walmart: 0.97,
  target: 0.99,
  costco: 0.94,
  kroger: 1.03,
  macys: 1.02,
  kohls: 1.01,
  nike: 1.0,
};

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function pdpUrl(retailer: RetailerId, seed: CanonicalProductSeed, asin: string): string {
  const slug = slugify(seed.title);
  const n = fnv1a(`${seed.id}-${retailer}`) % 900000000 + 100000000;
  switch (retailer) {
    case "amazon":
      return `https://www.amazon.com/dp/${asin}`;
    case "walmart":
      return `https://www.walmart.com/ip/${slug}/${n}`;
    case "target":
      return `https://www.target.com/p/${slug}/-/A-${String(n).slice(0, 8)}`;
    case "costco":
      return `https://www.costco.com/${slug}.product.${n}.html`;
    case "kroger":
      return `https://www.kroger.com/p/${slug}/${n}`;
    case "macys":
      return `https://www.macys.com/shop/product/${slug}?ID=${n}`;
    case "kohls":
      return `https://www.kohls.com/product/prd-${n}/${slug}.jsp`;
    case "nike":
      return `https://www.nike.com/t/${slug}/${n}`;
    default:
      return `https://www.amazon.com/dp/${asin}`;
  }
}

function anchorForSeed(seed: CanonicalProductSeed) {
  const known = PRODUCT_ANCHORS[seed.id];
  if (known) return known;
  const h = fnv1a(seed.id);
  const asinPool = [
    "B09XS7JWHH",
    "B0CHWRXH8B",
    "B0CFPJNBVT",
    "B00FLYWNYQ",
    "B07S85TPLG",
    "B003GAMCT0",
    "B00TTD9BRC",
    "B098RKWHHZ",
  ];
  const imagePool = [
    "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/61fD85FMQtL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/71j+1H6qY9L._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/71aFt4+OTOL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/71vFKBpKakL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/81KYNQ+KZJL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/71U2+5Y5HHL._AC_SL1500_.jpg",
    "https://m.media-amazon.com/images/I/61-PblYntsL._AC_SL1500_.jpg",
  ];
  const idx = h % asinPool.length;
  return {
    asin: asinPool[idx]!,
    image: imagePool[idx]!,
    gtin: String(1000000000000 + (h % 900000000000)).padStart(13, "0"),
    description: `${seed.title} — ${seed.brand ?? "Quality"} ${seed.categoryHint ?? "product"}.`,
  };
}

function buildOffersForProduct(
  seed: CanonicalProductSeed,
  canonicalTitle: string,
  category: string,
  asin: string,
): RetailerOffer[] {
  const retailers = seed.retailers ?? DEFAULT_RETAILERS;
  const base = seed.referencePrice ?? 29.99;
  const offers: RetailerOffer[] = [];

  for (const retailer of retailers) {
    const meta = getRetailerMeta(retailer);
    const bias = RETAILER_PRICE_BIAS[retailer] ?? 1.0;
    const jitter = 0.97 + (fnv1a(`${seed.id}:${retailer}:price`) % 7) * 0.01;
    const price = Math.round(base * bias * jitter * 100) / 100;
    if (price <= 0) continue;

    const outOfStock = fnv1a(`${seed.id}:${retailer}:stock`) % 23 === 0;
    const onSale = fnv1a(`${seed.id}:${retailer}:sale`) % 5 === 0;
    const listPrice =
      onSale && !outOfStock ?
        Math.round(price * (1.08 + (fnv1a(seed.id) % 5) * 0.02) * 100) / 100
      : undefined;

    const productUrl = pdpUrl(retailer, seed, asin);
    const confidence = scoreOfferConfidence({
      canonicalTitle,
      storeTitle: canonicalTitle,
      productUrl,
      linkType: "pdp",
      retailer,
      category,
    });

    offers.push({
      retailer,
      retailer_name: meta.name,
      price,
      currency: "USD",
      product_url: productUrl,
      availability: outOfStock ? "out_of_stock" : "in_stock",
      confidence_score: confidence,
      link_type: "pdp",
      store_title: canonicalTitle,
      ...(listPrice && listPrice > price ? { list_price: listPrice } : {}),
    });
  }

  return offers;
}

export interface SeedCanonicalReport {
  seeds: number;
  published: number;
  graphs: number;
  retailers: string[];
  categories: string[];
}

export function seedCanonicalInventory(maxProducts = 50): SeedCanonicalReport {
  const now = new Date().toISOString();
  const seeds = CANONICAL_PRODUCT_SEEDS.slice(0, maxProducts);
  const products: CanonicalProduct[] = [];

  for (const seed of seeds) {
    const anchor = anchorForSeed(seed);
    const category =
      seed.categoryHint && TOP_LEVEL_CATEGORIES.includes(seed.categoryHint as TopLevelCategory) ?
        (seed.categoryHint as TopLevelCategory)
      : normalizeCategory(seed.title, seed.categoryHint ?? null).category;
    const keywords = [
      ...seed.keywords,
      seed.brand ?? "",
      category,
      ...anchor.description.split(/\s+/).slice(0, 6),
    ].filter(Boolean);

    const offers = buildOffersForProduct(seed, seed.title, category, anchor.asin);
    const valid = filterValidOffers(offers, seed.title, category);
    if (valid.length < 2) continue;

    products.push({
      canonical_id: seed.id,
      canonical_title: seed.title,
      canonical_image: anchor.image,
      canonical_category: category,
      brand: seed.brand ?? null,
      normalized_keywords: [...new Set(keywords.map((k) => k.toLowerCase()))],
      amazon_asin: anchor.asin,
      updated_at: now,
      offers: valid,
    });
  }

  const file: CanonicalCatalogFile = {
    version: 1,
    updatedAt: now,
    products,
  };

  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "canonical-products.json"),
    JSON.stringify(file, null, 2),
  );

  const graphDir = join(dataDir, "intelligence-graph", "products");
  mkdirSync(graphDir, { recursive: true });
  if (existsSafe(graphDir)) {
    for (const f of readdirSync(graphDir)) {
      if (f.endsWith(".json")) unlinkSync(join(graphDir, f));
    }
  }

  let graphs = 0;
  const indexIds: string[] = [];
  const byIdentifier: Record<string, string> = {};

  for (const product of products) {
    const graph = buildIntelligenceGraph(product);
    saveGraph(graph);
    graphs++;
    indexIds.push(product.canonical_id);
    const anchor = anchorForSeed(
      seeds.find((s) => s.id === product.canonical_id) ?? {
        id: product.canonical_id,
        title: product.canonical_title,
        keywords: [],
      },
    );
    if (anchor.gtin) byIdentifier[`gtin:${anchor.gtin}`] = product.canonical_id;
    if (product.amazon_asin) byIdentifier[`asin:${product.amazon_asin}`] = product.canonical_id;
  }

  writeFileSync(
    join(dataDir, "intelligence-graph", "index.json"),
    JSON.stringify(
      { version: 1, updated_at: now, canonical_ids: indexIds, by_identifier: byIdentifier },
      null,
      2,
    ),
  );

  const retailers = [...new Set(products.flatMap((p) => p.offers.map((o) => o.retailer)))].sort();
  const categories = [...new Set(products.map((p) => p.canonical_category))].sort();

  return {
    seeds: seeds.length,
    published: products.length,
    graphs,
    retailers,
    categories,
  };
}

function existsSafe(dir: string): boolean {
  try {
    readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}
