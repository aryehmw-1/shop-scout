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
  dealLabel?: "best_deal" | "good_deal" | "verified";
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
}

export interface ReferenceProduct {
  title: string;
  sourceUrl: string;
  sourceRetailer?: RetailerId;
  referencePrice: number;
  imageUrl?: string;
  priceVerified?: boolean;
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

export interface ChatResponse {
  reply: string;
  chips?: string[];
  productResults?: ProductSearchResults;
  compareMode?: boolean;
  session: SessionState;
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
