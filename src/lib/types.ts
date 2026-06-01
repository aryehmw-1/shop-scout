export type ThemeId = "warm" | "sage" | "ocean" | "slate" | "rose";

export type RetailerId =
  | "walmart"
  | "target"
  | "kroger"
  | "aldi"
  | "amazon"
  | "instacart"
  | "costco"
  | "sams"
  | "publix"
  | "burlington"
  | "dicks"
  | "kohls"
  | "macys"
  | "oldnavy"
  | "ross"
  | "tjmaxx"
  | "footlocker"
  | "zappos"
  | "hm"
  | "nike"
  | "adidas"
  | "newbalance"
  | "underarmour"
  | "asics"
  | "puma"
  | "zara"
  | "uniqlo"
  | "gap"
  | "levis"
  | "ralphlauren"
  | "lululemon"
  | "northface"
  | "skechers"
  | "victoriassecret"
  | "calvinklein"
  | "tommyhilfiger"
  | "coach"
  | "michaelkors"
  | "next"
  | "louisvuitton"
  | "chanel"
  | "hermes"
  | "dior"
  | "gucci"
  | "prada"
  | "burberry"
  | "moncler"
  | "barnesnoble"
  | "indigo"
  | "waterstones"
  | "abebooks"
  | "fnac"
  | "whsmith"
  | "kinokuniya"
  | "booksamillion"
  | "powells"
  | "bookshop"
  | "worldofbooks"
  | "alibris"
  | "betterworldbooks"
  | "halfpricebooks"
  | "dymocks"
  | "strand"
  | "bookoutlet"
  | "wayfair"
  | "mattressfirm"
  | "sleepnumber"
  | "ashley"
  | "brooklinen"
  | "bollbranch"
  | "saatva"
  | "purple"
  | "casper"
  | "nectar"
  | "dreamcloud"
  | "parachute"
  | "cozyearth"
  | "potterybarn"
  | "westelm"
  | "ikea"
  | "quince"
  | "avocado"
  | "helix"
  | "brooklynbedding"
  | "frette"
  | "sferra"
  | "peacockalley"
  | "zinus"
  | "tuftandneedle"
  | "leesa"
  | "buffy"
  | "tempurpedic"
  | "nordstrom"
  | "nordstromrack"
  | "jcrew"
  | "anthropologie"
  | "athleta"
  | "patagonia"
  | "rei"
  | "dillards"
  | "bloomingdales"
  | "childrensplace"
  | "carters"
  | "oshkosh"
  | "shein"
  | "urbanoutfitters"
  | "forever21"
  | "llbean"
  | "columbia"
  | "skims"
  | "albertsons"
  | "safeway"
  | "vons"
  | "jewelosco"
  | "sprouts"
  | "wholefoods"
  | "heb"
  | "meijer"
  | "hyvee"
  | "wegmans"
  | "stopandshop"
  | "giantfood"
  | "weismarkets"
  | "freshdirect"
  | "thrivemarket"
  | "boxed"
  | "shipt"
  | "katespade"
  | "samsonite"
  | "tumi"
  | "longchamp"
  | "marcjacobs"
  | "toryburch"
  | "rimowa"
  | "away"
  | "herschel"
  | "jansport"
  | "fjallraven"
  | "dagnedover"
  | "beis"
  | "verabradley"
  | "mcm"
  | "bottegaveneta"
  | "saintlaurent"
  | "potterybarnkids"
  | "gerber"
  | "buybuybaby"
  | "hannaandersson"
  | "primary"
  | "monicaandandy"
  | "kytebaby"
  | "crateandkids"
  | "littlesleepies"
  | "poshpeanut"
  | "maisonette"
  | "janieandjack"
  | "gymboree"
  | "honest"
  | "burtsbeesbaby"
  | "albeebaby"
  | "marshalls"
  | "basspro"
  | "cabelas"
  | "academy"
  | "sportsmanswarehouse"
  | "scheels"
  | "backcountry"
  | "moosejaw"
  | "evo"
  | "sierra"
  | "big5"
  | "hibbett"
  | "dunhams"
  | "fleetfeet"
  | "orvis"
  | "westmarine"
  | "campingworld"
  | "decathlon"
  | "publiclands";

export type ClothingGender = "mens" | "womens";
export type ClothingAgeGroup = "toddler" | "kids" | "adult";

export type ShoppingChannel = "local" | "online";

export type ProductCategory =
  | "salad"
  | "dairy"
  | "bakery"
  | "produce"
  | "meat"
  | "pantry"
  | "household"
  | "clothing"
  | "shoes"
  | "sports"
  | "books"
  | "bedding"
  | "home"
  | "general";

export type ProductImageSource = "retailer" | "web_search" | "catalog";

export interface OfferPipelineDebug {
  priceBadge: "verified_live" | "estimated" | "unavailable";
  scrapeAgeMinutes?: number;
  source: string;
  extractionMethod?: string;
  scrapeTimestamp?: string;
  cacheHit?: boolean;
  validationStatus: "ok" | "rejected" | "skipped" | "pending";
  rejectedReason?: string;
  imageFallbackLevel: 1 | 2 | 3 | 4 | 5 | 6;
  imageExtractionMethod?: string;
  imageUrlResolved?: string;
  imageNormalized?: boolean;
  retailerStatus?: "success" | "blocked" | "parser_missing" | "no_match" | "low_confidence";
  amazonMatchScore?: number;
  persistRejected?: boolean;
  persistRejectionReason?: string;
  urlValidation?: {
    ok: boolean;
    httpStatus?: number;
    finalUrl?: string;
    reason?: string;
  };
}

export interface ProductOffer {
  id: string;
  title: string;
  /** Full product name as listed on that retailer's site */
  storeTitle?: string;
  brand: string;
  size: string;
  upc?: string;
  catalogId?: string;
  imageUrl: string;
  /** Where the product photo came from — drives UI disclosure */
  imageSource?: ProductImageSource;
  retailer: RetailerId;
  retailerName: string;
  channel: ShoppingChannel;
  price: number;
  wasPrice?: number;
  savingsPercent?: number;
  unitPrice: number;
  unitLabel: string;
  inStock: boolean;
  pickupAvailable: boolean;
  deliveryFee?: number;
  /** Estimated shipping component of delivered total. */
  estimatedShipping?: number;
  /** Estimated sales tax component of delivered total. */
  estimatedTax?: number;
  /** Item + shipping + tax — primary ranking key. */
  deliveredTotal?: number;
  deliveredPriceConfidence?: number;
  deliveredPriceNote?: string;
  freeShippingThreshold?: number;
  freeShippingEligible?: boolean;
  memberPricingApplied?: boolean;
  pickupEligible?: boolean;
  landedCost: number;
  productUrl: string;
  affiliateUrl: string;
  matchConfidence: number;
  identityConfidence?: number;
  attributeConfidence?: number;
  imageConfidence?: number;
  confidenceReasons?: Array<{ code: string; message: string; weight: number }>;
  /** 0–1 trust in listed price (scraped/live vs estimated). */
  priceConfidence?: number;
  /** How this price was produced (demo model, cache, future API). */
  priceSource?:
    | "catalog_model"
    | "cached_quote"
    | "connector_api"
    | "nightly_index"
    | "daily_index"
    | "historical_model"
    | "scraped"
    | "nightly_index";
  priceAsOf?: string;
  priceExpiresAt?: string;
  /** Tiered freshness — fresh | aging | stale_visible | expired */
  freshnessTier?: "fresh" | "aging" | "stale_visible" | "expired";
  freshnessLabel?: string;
  lastUpdatedAt?: string;
  /** Price confidence after freshness decay */
  displayPriceConfidence?: number;
  isBestDeal?: boolean;
  priceNote?: string;
  /** Composite deal ranking score (0–1). Higher = better trustworthy deal. */
  dealScore?: number;
  marketMedianPrice?: number;
  marketMeanPrice?: number;
  percentBelowMarket?: number;
  percentBelowCatalog?: number;
  historicalLowPrice?: number;
  movingAvgPrice?: number;
  verificationCount?: number;
  lastVerifiedAt?: string;
  retailerTrustScore?: number;
  isGoodDeal?: boolean;
  isHistoricalLow?: boolean;
  dealLabel?: "best_deal" | "good_deal" | "verified" | "closest_match";
  /** Sparkline points (oldest→newest) for mini price chart */
  priceHistorySparkline?: number[];
  /** User-facing explanation of deal ranking */
  dealExplanation?: {
    headline: string;
    bullets: string[];
    dealScore?: number;
    isGoodTimeToBuy?: boolean;
    goodTimeReason?: string;
  };
  /** Server-side pipeline trace for debug UI (stripped in production unless enabled). */
  pipelineDebug?: OfferPipelineDebug;
  /** True when offer came from verified persisted inventory DB row. */
  verifiedPersistedInventory?: boolean;
  normalizationStatus?: string;
  qaStatus?: "approved" | "pending" | "rejected" | "none";
  /** Retrieval relevance band — drives trust-preserving UI labels. */
  matchBand?:
    | "exact_verified"
    | "likely_match"
    | "similar"
    | "brand_alternative"
    | "weak"
    | "rejected";
  matchDisplayLabel?: string;
  packSizeLabel?: string;
}

export interface ReferenceProduct {
  title: string;
  sourceUrl: string;
  sourceRetailer?: RetailerId;
  referencePrice: number;
  imageUrl?: string;
  priceVerified?: boolean;
  priceFromPersistedCache?: boolean;
  normalizationNote?: string;
  matchTier?: "exact" | "near" | "family" | "none";
  matchConfidence?: number;
  equivalenceReasons?: string[];
  variantWarning?: string;
  pdpFetchOk?: boolean;
}

export interface LinkMatchMeta {
  matchTier: "exact" | "near" | "family" | "none";
  matchConfidence: number;
  equivalenceReasons: string[];
  variantWarning?: string;
  useExactCompare: boolean;
  pdpFetchOk: boolean;
  ingestLatencyMs: number;
}

export interface MatchedProductSummary {
  title: string;
  brand: string;
  imageUrl: string;
  fromPrice?: number;
  imageSource?: ProductImageSource;
}

export interface VerifiedInventoryHitMeta {
  matched: boolean;
  catalogId?: string;
  matchMethod?: string;
  matchScore?: number;
  lastVerifiedAt?: string;
  confidence?: number;
  normalizationStatus?: string;
  qaStatus?: "approved" | "pending" | "rejected" | "none";
  candidateCount?: number;
  candidates?: Array<{
    catalogId: string;
    title: string;
    score: number;
    hasPersistedQuotes: boolean;
    rejectedReason?: string;
  }>;
}

export interface RetrievalMeta {
  tier?: string;
  matchReason?: string;
  confidence?: number;
  catalogId?: string;
  matchedTitle?: string;
  matchedBrand?: string;
  normalizationMessage?: string;
  offerQuality?: "exact" | "verified" | "estimated" | "closest_match";
}

export interface GroceryRetrievalDebugSummary {
  query: string;
  normalizedQuery: string;
  isGroceryQuery: boolean;
  parsedBrand?: string;
  parsedCategory?: string;
  productTypes: string[];
  privateLabel?: string;
  tierReached?: string;
  tierRank?: number;
  resolvedCatalogId?: string;
  resolvedTitle?: string;
  matchReason?: string;
  resolverConfidence?: number;
  candidateRetrievals: Array<{
    catalogId: string;
    title: string;
    brand: string;
    score: number;
    tier?: string;
  }>;
  fallbackTierExecuted: boolean;
  rejectionReasons: string[];
  displayableOfferCount: number;
  verifiedOfferCount: number;
  closestMatchOfferCount: number;
}

export interface SearchPipelineDebugSummary {
  query: string;
  resolvedCatalogId: string;
  resolvedTitle: string;
  matchReason: string;
  stages: Array<{ stage: string; count: number; detail?: string; samples?: string[] }>;
  filterReasons: Array<{
    retailer: string;
    price: number;
    priceSource?: string;
    matchConfidence?: number;
    reasons: string[];
  }>;
  keywordFallbackUsed: boolean;
  semanticNote: string;
  verifiedInventoryResolution?: VerifiedInventoryHitMeta;
}

export interface ProductSearchResults {
  local: ProductOffer[];
  online: ProductOffer[];
  /** Unverified catalog/estimate rows — never mixed into `online`. */
  estimatedOnline?: ProductOffer[];
  zipCode: string;
  compareMode?: boolean;
  referenceProduct?: ReferenceProduct;
  similarMode?: boolean;
  /** Primary product we matched for this search */
  matchedProduct?: MatchedProductSummary;
  /** Client-side progressive enrichment state */
  enrichmentPending?: boolean;
  enrichmentCatalogId?: string;
  resolvedQuery?: string;
  /** Populated for pasted-link searches */
  linkMatch?: LinkMatchMeta;
  /** Filtered offers with reasons — shown in debug / low-confidence UI */
  lowConfidenceOnline?: ProductOffer[];
  /** True when no exact/likely match passed trust gates — only similar/weak remain. */
  noExactMatchFound?: boolean;
  /** Grocery search surfaced catalog estimates when no verified quotes exist. */
  closestMatchFallback?: boolean;
  /** User has not set ZIP — shipping/tax are generic estimates. */
  needsZipForShipping?: boolean;
  /** Structured trace when grocery retrieval dead-ends (debug). */
  groceryRetrievalDebug?: GroceryRetrievalDebugSummary;
  /** User-visible retrieval tier + normalization context. */
  retrievalMeta?: RetrievalMeta;
  /** Grouped retrieval tiers for trust-preserving display. */
  matchTiers?: {
    exact: ProductOffer[];
    similar: ProductOffer[];
    brandAlternatives: ProductOffer[];
  };
  /** End-to-end pipeline trace when SEARCH_PIPELINE_DEBUG or NEXT_PUBLIC_SEARCH_DEBUG */
  searchDebug?: SearchPipelineDebugSummary;
  /** Set when search resolved via verified persisted inventory. */
  verifiedInventoryHit?: VerifiedInventoryHitMeta;
  /** Shown when most offers are stale — catalog still visible with labeling. */
  catalogFreshnessWarning?: {
    staleCount: number;
    totalCount: number;
    message: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ProductOffer[];
  productResults?: ProductSearchResults;
  compareMode?: boolean;
  chips?: string[];
  timestamp: number;
  conversationDebug?: import("./types").ConversationDebugSnapshot;
}

export interface LearningProfile {
  version: 1;
  updatedAt: number;
  searchCount: number;
  genderAffinity: Record<ClothingGender | "neutral", number>;
  ageAffinity: Record<ClothingAgeGroup, number>;
  categoryAffinity: Partial<Record<ProductCategory, number>>;
  retailerAffinity: Partial<Record<RetailerId, number>>;
  recentQueries: string[];
}

export interface ShoppingIntent {
  query: string;
  category?: string;
  organic?: boolean;
  maxPrice?: number;
  zipCode?: string;
  /** Men's or women's when query specifies (or learned) */
  gender?: ClothingGender;
  /** Toddler, kids, or adult sizing */
  ageGroup?: ClothingAgeGroup;
  /** e.g. jeans, joggers, running shoes — from clarification or explicit query */
  productSubtype?: string;
  /** e.g. Nike, Levi's — from query or refinement */
  brand?: string;
  /** e.g. black, navy — merged on refinements */
  colors?: string[];
  /** e.g. Large, XL, 32x32 — merged on refinements */
  size?: string;
  /** Personalized ranking from past searches & clicks */
  learningProfile?: LearningProfile;
  /** Browser extension: Amazon PDP ASIN for PA-API GetItems */
  amazonAsin?: string;
  /** Browser extension: page being compared */
  pageUrl?: string;
}

export interface ClarificationState {
  kind:
    | "pants"
    | "shoes"
    | "outerwear"
    | "hoodie"
    | "kids_clothing"
    | "salad"
    | "dairy"
    | "bakery"
    | "produce"
    | "meat"
    | "pantry";
  question: string;
  options: string[];
  baseQuery: string;
  baseIntent: Partial<ShoppingIntent>;
}

export interface SessionState {
  phase: "idle" | "clarifying" | "ready";
  intent: Partial<ShoppingIntent>;
  sourceUrl?: string;
  sourceProductTitle?: string;
  compareUpc?: string;
  compareMode?: boolean;
  asked: string[];
  /** Active follow-up (jeans vs joggers, etc.) */
  clarifying?: ClarificationState;
}

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  session: SessionState;
  zipCode?: string;
  learningProfile?: LearningProfile;
  /** Recent messages for conversational context */
  history?: ChatHistoryEntry[];
  /** Fast cached results first; client enriches in background (default true). */
  progressive?: boolean;
}

export interface ConversationDebugSnapshot {
  action: string;
  message: string;
  merged: boolean;
  priorQuery?: string;
  nextQuery: string;
  fullQuery: string;
  attributes: {
    gender?: string;
    size?: string;
    brand?: string;
    colors?: string[];
    maxPrice?: number;
    productSubtype?: string;
  };
  intentTransition?: {
    action: "refine_current" | "replace_current" | "ambiguous" | "unrelated";
    shouldMerge: boolean;
    confidence: number;
    reason: string;
    priorCategoryFamily?: string;
    nextCategoryFamily?: string;
    tokenOverlap: number;
    taxonomyOverlap: number;
    priorTaxonomy: string[];
    nextTaxonomy: string[];
  };
}

export interface ChatResponse {
  reply: string;
  chips?: string[];
  productResults?: ProductSearchResults;
  compareMode?: boolean;
  session: SessionState;
  conversationDebug?: ConversationDebugSnapshot;
}

export interface UserAddress {
  zipCode: string;
  street?: string;
  city?: string;
  state?: string;
  label?: string;
}

export interface UserPreferences {
  zipCode: string;
  locationSet?: boolean;
  organicPreferred?: boolean;
  favoriteRetailers?: RetailerId[];
  hasPrime?: boolean;
  hasWalmartPlus?: boolean;
  hasTargetCircle?: boolean;
  fulfillmentPreference?: "shipping" | "pickup" | "either";
  learningProfile?: LearningProfile;
  /** Screen color theme — see Settings */
  colorTheme?: ThemeId;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  address: UserAddress;
  preferences: UserPreferences;
  savedOffers: ProductOffer[];
}
