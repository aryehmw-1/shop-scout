import type { RetailerId } from "@/lib/types";

/** Curated ~50 high-intent products for canonical comparison (Amazon metadata + multi-retailer offers). */
export interface CanonicalProductSeed {
  id: string;
  title: string;
  brand?: string;
  categoryHint?: string;
  keywords: string[];
  /** Optional retailer subset; defaults to CANONICAL_DEFAULT_RETAILERS */
  retailers?: RetailerId[];
  /** Fallback price when Amazon price missing */
  referencePrice?: number;
}

export const CANONICAL_DEFAULT_RETAILERS: RetailerId[] = [
  "amazon",
  "walmart",
  "target",
  "costco",
  "kroger",
];

export const CANONICAL_PRODUCT_SEEDS: CanonicalProductSeed[] = [
  // Electronics & tech
  { id: "sony-wh1000xm5", title: "Sony WH-1000XM5 Wireless Headphones", brand: "Sony", categoryHint: "Electronics", keywords: ["headphones", "sony", "noise cancelling", "wireless"], referencePrice: 348 },
  { id: "apple-airpods-pro-2", title: "Apple AirPods Pro (2nd generation)", brand: "Apple", categoryHint: "Electronics", keywords: ["airpods", "earbuds", "apple"], referencePrice: 249 },
  { id: "samsung-55-oled", title: "Samsung 55 inch OLED 4K Smart TV", brand: "Samsung", categoryHint: "Electronics", keywords: ["oled", "tv", "samsung", "4k"], referencePrice: 1299 },
  { id: "ipad-10th-gen", title: "Apple iPad 10.9 inch Wi-Fi 64GB", brand: "Apple", categoryHint: "Electronics", keywords: ["ipad", "tablet", "apple"], referencePrice: 349 },
  { id: "kindle-paperwhite", title: "Amazon Kindle Paperwhite E-Reader", brand: "Amazon", categoryHint: "Electronics", keywords: ["kindle", "ebook", "reader"], referencePrice: 139, retailers: ["amazon", "walmart", "target", "costco"] },
  { id: "bose-soundlink-flex", title: "Bose SoundLink Flex Bluetooth Speaker", brand: "Bose", categoryHint: "Electronics", keywords: ["speaker", "bluetooth", "bose"], referencePrice: 149 },
  { id: "logitech-mx-master-3s", title: "Logitech MX Master 3S Wireless Mouse", brand: "Logitech", categoryHint: "Electronics", keywords: ["mouse", "logitech", "wireless"], referencePrice: 99 },
  { id: "dyson-v15", title: "Dyson V15 Detect Cordless Vacuum", brand: "Dyson", categoryHint: "Home", keywords: ["vacuum", "dyson", "cordless"], referencePrice: 749 },
  { id: "ninja-air-fryer", title: "Ninja Air Fryer Max XL", brand: "Ninja", categoryHint: "Kitchen", keywords: ["air fryer", "ninja", "kitchen"], referencePrice: 129 },
  { id: "instant-pot-duo", title: "Instant Pot Duo 7-in-1 Electric Pressure Cooker", brand: "Instant Pot", categoryHint: "Kitchen", keywords: ["instant pot", "pressure cooker"], referencePrice: 89 },
  // Grocery & household
  { id: "organic-whole-milk", title: "Organic Whole Milk", brand: "Horizon", categoryHint: "Grocery", keywords: ["milk", "organic", "dairy"], referencePrice: 5.49 },
  { id: "organic-eggs-dozen", title: "Organic Large Brown Eggs", brand: "Vital Farms", categoryHint: "Grocery", keywords: ["eggs", "organic"], referencePrice: 6.99 },
  { id: "bounty-paper-towels", title: "Bounty Select-A-Size Paper Towels", brand: "Bounty", categoryHint: "Grocery", keywords: ["paper towels", "bounty"], referencePrice: 24.99 },
  { id: "tide-pods", title: "Tide PODS Laundry Detergent", brand: "Tide", categoryHint: "Home", keywords: ["laundry", "detergent", "tide pods"], referencePrice: 19.99 },
  { id: "starbucks-ground-coffee", title: "Starbucks Pike Place Roast Ground Coffee", brand: "Starbucks", categoryHint: "Grocery", keywords: ["coffee", "ground", "starbucks"], referencePrice: 9.99 },
  { id: "barilla-pasta", title: "Barilla Spaghetti Pasta", brand: "Barilla", categoryHint: "Grocery", keywords: ["pasta", "spaghetti"], referencePrice: 1.79 },
  { id: "chobani-greek-yogurt", title: "Chobani Greek Yogurt Plain", brand: "Chobani", categoryHint: "Grocery", keywords: ["yogurt", "greek", "chobani"], referencePrice: 5.49 },
  { id: "kerrygold-butter", title: "Kerrygold Pure Irish Butter", brand: "Kerrygold", categoryHint: "Grocery", keywords: ["butter", "kerrygold"], referencePrice: 4.99 },
  // Beauty & health
  { id: "cerave-moisturizing-cream", title: "CeraVe Moisturizing Cream", brand: "CeraVe", categoryHint: "Beauty", keywords: ["moisturizer", "skincare", "cerave"], referencePrice: 16.99 },
  { id: "olaplex-no3", title: "Olaplex No. 3 Hair Perfector", brand: "Olaplex", categoryHint: "Beauty", keywords: ["hair", "olaplex", "treatment"], referencePrice: 30 },
  { id: "neutrogena-sunscreen", title: "Neutrogena Ultra Sheer Sunscreen SPF 70", brand: "Neutrogena", categoryHint: "Beauty", keywords: ["sunscreen", "spf"], referencePrice: 12.99 },
  { id: "dove-body-wash", title: "Dove Deep Moisture Body Wash", brand: "Dove", categoryHint: "Beauty", keywords: ["body wash", "dove"], referencePrice: 6.99 },
  // Sports & apparel
  { id: "nike-pegasus-running", title: "Nike Air Zoom Pegasus Running Shoes", brand: "Nike", categoryHint: "Sports", keywords: ["running shoes", "nike", "pegasus"], referencePrice: 130 },
  { id: "yeti-rambler-30", title: "YETI Rambler 30 oz Tumbler", brand: "YETI", categoryHint: "Sports", keywords: ["tumbler", "yeti", "water bottle"], referencePrice: 38 },
  { id: "hydro-flask-32", title: "Hydro Flask Wide Mouth 32 oz", brand: "Hydro Flask", categoryHint: "Sports", keywords: ["water bottle", "hydro flask"], referencePrice: 44.95 },
  { id: "lululemon-align-leggings", title: "Lululemon Align High-Rise Leggings", brand: "Lululemon", categoryHint: "Clothing", keywords: ["leggings", "lululemon", "yoga"], referencePrice: 98, retailers: ["amazon", "target", "walmart", "costco"] },
  // Home & office
  { id: "brita-pitcher", title: "Brita Everyday Water Filter Pitcher", brand: "Brita", categoryHint: "Home", keywords: ["water filter", "brita"], referencePrice: 27.99 },
  { id: "keurig-k-mini", title: "Keurig K-Mini Single Serve Coffee Maker", brand: "Keurig", categoryHint: "Kitchen", keywords: ["keurig", "coffee maker"], referencePrice: 79.99 },
  { id: "roomba-j7", title: "iRobot Roomba j7 Robot Vacuum", brand: "iRobot", categoryHint: "Home", keywords: ["roomba", "robot vacuum"], referencePrice: 599 },
  { id: "philips-hue-bulb", title: "Philips Hue White and Color Ambiance Bulb", brand: "Philips", categoryHint: "Home", keywords: ["smart bulb", "hue", "philips"], referencePrice: 49.99 },
  { id: "hp-63-ink", title: "HP 63 Black Ink Cartridge", brand: "HP", categoryHint: "Office", keywords: ["ink", "printer", "hp"], referencePrice: 22.99 },
  // Baby & pets
  { id: "pampers-swaddlers", title: "Pampers Swaddlers Diapers Size 1", brand: "Pampers", categoryHint: "Grocery", keywords: ["diapers", "pampers"], referencePrice: 28.99 },
  { id: "purina-pro-plan-dog", title: "Purina Pro Plan Adult Dog Food", brand: "Purina", categoryHint: "Grocery", keywords: ["dog food", "purina"], referencePrice: 54.99 },
  // More grocery staples
  { id: "cheerios-cereal", title: "Cheerios Original Cereal", brand: "General Mills", categoryHint: "Grocery", keywords: ["cereal", "cheerios"], referencePrice: 4.99 },
  { id: "skippy-peanut-butter", title: "Skippy Creamy Peanut Butter", brand: "Skippy", categoryHint: "Grocery", keywords: ["peanut butter"], referencePrice: 3.49 },
  { id: "la-croix-sparkling", title: "LaCroix Sparkling Water Variety Pack", brand: "LaCroix", categoryHint: "Grocery", keywords: ["sparkling water", "lacroix"], referencePrice: 15.99 },
  { id: "clorox-bleach", title: "Clorox Disinfecting Bleach", brand: "Clorox", categoryHint: "Home", keywords: ["bleach", "clorox", "cleaner"], referencePrice: 5.99 },
  { id: "charmin-ultra-soft", title: "Charmin Ultra Soft Toilet Paper", brand: "Charmin", categoryHint: "Grocery", keywords: ["toilet paper", "charmin"], referencePrice: 22.99 },
  { id: "crest-toothpaste", title: "Crest Pro-Health Toothpaste", brand: "Crest", categoryHint: "Beauty", keywords: ["toothpaste", "crest"], referencePrice: 4.99 },
  { id: "gillette-fusion-razor", title: "Gillette Fusion5 Razor Refills", brand: "Gillette", categoryHint: "Beauty", keywords: ["razor", "gillette"], referencePrice: 24.99 },
  { id: "oral-b-electric-toothbrush", title: "Oral-B Pro 1000 Electric Toothbrush", brand: "Oral-B", categoryHint: "Beauty", keywords: ["toothbrush", "oral-b"], referencePrice: 49.99 },
  { id: "fitbit-charge-6", title: "Fitbit Charge 6 Fitness Tracker", brand: "Fitbit", categoryHint: "Electronics", keywords: ["fitbit", "fitness tracker"], referencePrice: 159.95 },
  { id: "ring-doorbell", title: "Ring Video Doorbell", brand: "Ring", categoryHint: "Electronics", keywords: ["doorbell", "ring", "smart home"], referencePrice: 99.99 },
  { id: "lego-classic-box", title: "LEGO Classic Creative Brick Box", brand: "LEGO", categoryHint: "Toys", keywords: ["lego", "toys"], referencePrice: 39.99 },
  { id: "nintendo-switch-oled", title: "Nintendo Switch OLED Model", brand: "Nintendo", categoryHint: "Electronics", keywords: ["nintendo switch", "gaming"], referencePrice: 349.99 },
  { id: "ps5-dualsense", title: "PlayStation 5 DualSense Wireless Controller", brand: "Sony", categoryHint: "Electronics", keywords: ["ps5", "controller", "playstation"], referencePrice: 74.99 },
  { id: "crocs-classic-clog", title: "Crocs Classic Clog", brand: "Crocs", categoryHint: "Clothing", keywords: ["crocs", "clogs", "shoes"], referencePrice: 49.99 },
  { id: "carhartt-midweight-hoodie", title: "Carhartt Midweight Hooded Sweatshirt", brand: "Carhartt", categoryHint: "Clothing", keywords: ["hoodie", "carhartt"], referencePrice: 59.99 },
  { id: "oxo-good-grips-can-opener", title: "OXO Good Grips Can Opener", brand: "OXO", categoryHint: "Kitchen", keywords: ["can opener", "oxo"], referencePrice: 15.99 },
  { id: "pyrex-storage-set", title: "Pyrex Simply Store Glass Food Storage Set", brand: "Pyrex", categoryHint: "Kitchen", keywords: ["food storage", "pyrex", "glass"], referencePrice: 24.99 },
  { id: "ziploc-gallon-bags", title: "Ziploc Gallon Storage Bags", brand: "Ziploc", categoryHint: "Grocery", keywords: ["ziploc", "storage bags"], referencePrice: 12.99 },
  { id: "reynolds-parchment", title: "Reynolds Kitchens Parchment Paper", brand: "Reynolds", categoryHint: "Grocery", keywords: ["parchment paper", "baking"], referencePrice: 4.99 },
  { id: "weber-spirit-grill", title: "Weber Spirit II E-310 Gas Grill", brand: "Weber", categoryHint: "Home", keywords: ["grill", "weber", "gas grill"], referencePrice: 549 },
  { id: "coleman-cooler", title: "Coleman Xtreme Cooler 70 Quart", brand: "Coleman", categoryHint: "Sports", keywords: ["cooler", "coleman"], referencePrice: 69.99 },
];
