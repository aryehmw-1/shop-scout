import { isShoppableRetailer } from "../retailers/retailers-shoppable";
import type { ProductCategory, RetailerId } from "../types";

const BLOCKED_PRODUCT_LINK_HOST =
  /google\.|gstatic\.|youtube\.|facebook\.|instagram\.|pinterest\.|serpapi\.|doubleclick\./i;

export const URL_HOST_RETAILER: Record<string, RetailerId> = {
  "walmart.com": "walmart",
  "target.com": "target",
  "kroger.com": "kroger",
  "amazon.com": "amazon",
  "ebay.com": "ebay",
  "bestbuy.com": "bestbuy",
  "costco.com": "costco",
  "samsclub.com": "sams",
  "aldi.us": "aldi",
  "instacart.com": "instacart",
  "publix.com": "publix",
  "burlington.com": "burlington",
  "burlingtonstores.com": "burlington",
  "dickssportinggoods.com": "dicks",
  "kohls.com": "kohls",
  "macys.com": "macys",
  "oldnavy.com": "oldnavy",
  "rossstores.com": "ross",
  "tjmaxx.com": "tjmaxx",
  "tjmaxx.tjx.com": "tjmaxx",
  "footlocker.com": "footlocker",
  "zappos.com": "zappos",
  "hm.com": "hm",
  "nike.com": "nike",
  "oldnavy.gap.com": "oldnavy",
  "gap.com": "gap",
  "adidas.com": "adidas",
  "newbalance.com": "newbalance",
  "underarmour.com": "underarmour",
  "asics.com": "asics",
  "puma.com": "puma",
  "us.puma.com": "puma",
  "zara.com": "zara",
  "uniqlo.com": "uniqlo",
  "levi.com": "levis",
  "levis.com": "levis",
  "ralphlauren.com": "ralphlauren",
  "lululemon.com": "lululemon",
  "thenorthface.com": "northface",
  "skechers.com": "skechers",
  "victoriassecret.com": "victoriassecret",
  "calvinklein.us": "calvinklein",
  "tommy.com": "tommyhilfiger",
  "coach.com": "coach",
  "michaelkors.com": "michaelkors",
  "next.co.uk": "next",
  "louisvuitton.com": "louisvuitton",
  "chanel.com": "chanel",
  "hermes.com": "hermes",
  "dior.com": "dior",
  "gucci.com": "gucci",
  "prada.com": "prada",
  "burberry.com": "burberry",
  "moncler.com": "moncler",
  "barnesandnoble.com": "barnesnoble",
  "indigo.ca": "indigo",
  "waterstones.com": "waterstones",
  "abebooks.com": "abebooks",
  "fnac.com": "fnac",
  "whsmith.co.uk": "whsmith",
  "kinokuniya.com": "kinokuniya",
  "booksamillion.com": "booksamillion",
  "powells.com": "powells",
  "bookshop.org": "bookshop",
  "worldofbooks.com": "worldofbooks",
  "alibris.com": "alibris",
  "betterworldbooks.com": "betterworldbooks",
  "hpb.com": "halfpricebooks",
  "dymocks.com.au": "dymocks",
  "strandbooks.com": "strand",
  "bookoutlet.com": "bookoutlet",
  "wayfair.com": "wayfair",
  "mattressfirm.com": "mattressfirm",
  "sleepnumber.com": "sleepnumber",
  "ashleyfurniture.com": "ashley",
  "brooklinen.com": "brooklinen",
  "bollandbranch.com": "bollbranch",
  "saatva.com": "saatva",
  "purple.com": "purple",
  "casper.com": "casper",
  "nectarsleep.com": "nectar",
  "dreamcloudsleep.com": "dreamcloud",
  "parachutehome.com": "parachute",
  "cozyearth.com": "cozyearth",
  "potterybarn.com": "potterybarn",
  "westelm.com": "westelm",
  "ikea.com": "ikea",
  "quince.com": "quince",
  "avocadogreenmattress.com": "avocado",
  "helixsleep.com": "helix",
  "brooklynbedding.com": "brooklynbedding",
  "frette.com": "frette",
  "sferra.com": "sferra",
  "peacockalley.com": "peacockalley",
  "zinus.com": "zinus",
  "tuftandneedle.com": "tuftandneedle",
  "leesa.com": "leesa",
  "buffys.co": "buffy",
  "tempurpedic.com": "tempurpedic",
  "nordstrom.com": "nordstrom",
  "nordstromrack.com": "nordstromrack",
  "jcrew.com": "jcrew",
  "anthropologie.com": "anthropologie",
  "athleta.gap.com": "athleta",
  "athleta.com": "athleta",
  "patagonia.com": "patagonia",
  "rei.com": "rei",
  "dillards.com": "dillards",
  "bloomingdales.com": "bloomingdales",
  "childrensplace.com": "childrensplace",
  "carters.com": "carters",
  "oshkosh.com": "oshkosh",
  "shein.com": "shein",
  "us.shein.com": "shein",
  "urbanoutfitters.com": "urbanoutfitters",
  "forever21.com": "forever21",
  "llbean.com": "llbean",
  "columbia.com": "columbia",
  "skims.com": "skims",
  "albertsons.com": "albertsons",
  "safeway.com": "safeway",
  "vons.com": "vons",
  "jewelosco.com": "jewelosco",
  "sprouts.com": "sprouts",
  "wholefoodsmarket.com": "wholefoods",
  "heb.com": "heb",
  "meijer.com": "meijer",
  "hy-vee.com": "hyvee",
  "wegmans.com": "wegmans",
  "stopandshop.com": "stopandshop",
  "giantfood.com": "giantfood",
  "weismarkets.com": "weismarkets",
  "freshdirect.com": "freshdirect",
  "thrivemarket.com": "thrivemarket",
  "boxed.com": "boxed",
  "shipt.com": "shipt",
  "katespade.com": "katespade",
  "samsonite.com": "samsonite",
  "tumi.com": "tumi",
  "longchamp.com": "longchamp",
  "marcjacobs.com": "marcjacobs",
  "toryburch.com": "toryburch",
  "rimowa.com": "rimowa",
  "awaytravel.com": "away",
  "herschel.com": "herschel",
  "jansport.com": "jansport",
  "fjallraven.com": "fjallraven",
  "dagnedover.com": "dagnedover",
  "beistravel.com": "beis",
  "verabradley.com": "verabradley",
  "mcmworldwide.com": "mcm",
  "bottegaveneta.com": "bottegaveneta",
  "ysl.com": "saintlaurent",
  "potterybarnkids.com": "potterybarnkids",
  "gerberchildrenswear.com": "gerber",
  "buybuybaby.com": "buybuybaby",
  "hannaandersson.com": "hannaandersson",
  "primary.com": "primary",
  "monicaandandy.com": "monicaandandy",
  "kytebaby.com": "kytebaby",
  "crateandkids.com": "crateandkids",
  "littlesleepies.com": "littlesleepies",
  "poshpeanut.com": "poshpeanut",
  "maisonette.com": "maisonette",
  "janieandjack.com": "janieandjack",
  "gymboree.com": "gymboree",
  "honest.com": "honest",
  "burtsbeesbaby.com": "burtsbeesbaby",
  "albeebaby.com": "albeebaby",
  "marshalls.com": "marshalls",
  "basspro.com": "basspro",
  "cabelas.com": "cabelas",
  "academy.com": "academy",
  "sportsmans.com": "sportsmanswarehouse",
  "scheels.com": "scheels",
  "backcountry.com": "backcountry",
  "moosejaw.com": "moosejaw",
  "evo.com": "evo",
  "sierra.com": "sierra",
  "big5sportinggoods.com": "big5",
  "hibbett.com": "hibbett",
  "dunhamssports.com": "dunhams",
  "fleetfeet.com": "fleetfeet",
  "orvis.com": "orvis",
  "westmarine.com": "westmarine",
  "campingworld.com": "campingworld",
  "decathlon.com": "decathlon",
  "publiclands.com": "publiclands",
};

const SKIP_SEGMENTS = new Set([
  "ip",
  "p",
  "dp",
  "gp",
  "product",
  "products",
  "search",
  "s",
  "pd",
  "store",
  "a",
]);

function decodeSegment(raw: string): string {
  return decodeURIComponent(raw)
    .replace(/[-_+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shopify-style slugs: strip SKU suffixes and "1 pack" quantity prefixes */
function cleanDecodedProductTitle(raw: string): string {
  const cleaned = raw
    .replace(/\bop\d+\b/gi, "")
    .replace(/^\d+\s*pack\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMostlyNumeric(text: string): boolean {
  return /^[\d./]+$/.test(text.replace(/\s/g, ""));
}

function inferCategoryFromText(text: string): ProductCategory | undefined {
  const lower = text.toLowerCase();
  if (
    /\b(toddler|toddlers|baby|babies|infant|2t|3t|4t|5t|12m|18m|24m)\b/.test(lower)
  )
    return "clothing";
  if (/\b(kids?|children|child|youth|boys?|girls?)\b/.test(lower) && /cloth|shirt|shoe|dress|hoodie|pants|jeans/.test(lower))
    return "clothing";
  if (/audiobook|audible|hardcover|paperback|novel|fiction|nonfiction|\bbook\b|books\b/.test(lower))
    return "books";
  if (/mattress|pillow|sheets?|comforter|duvet|bedding|memory\s+foam/.test(lower))
    return "bedding";
  if (/sofa|couch|furniture|lamp|rug|home\s+decor/.test(lower)) return "home";
  if (/\b(beds?|mattress|bed\s+frame|box\s+spring)\b/.test(lower))
    return "bedding";
  if (/shoe|sneaker|boot|sandal|cleat|footwear|loafer|heel/.test(lower))
    return "shoes";
  if (/shirt|pants|jeans|dress|hoodie|jacket|clothing|apparel|fashion|polo|tee|sweater|coat|shorts|skirt|blouse/.test(lower))
    return "clothing";
  if (/sport|athletic|gym|yoga|basketball|football|soccer|fitness|workout|dumbbell/.test(lower))
    return "sports";
  if (/salad|greens|lettuce|spinach|arugula|kale/.test(lower)) return "salad";
  if (/milk|egg|butter|dairy|cheese|yogurt/.test(lower)) return "dairy";
  if (/bread|bakery|toast|bagel/.test(lower)) return "bakery";
  if (/banana|produce|fruit|vegetable|apple|berry/.test(lower)) return "produce";
  if (/chicken|meat|beef|pork|protein|fish|salmon/.test(lower)) return "meat";
  if (/towel|soap|shampoo|clean|household|detergent/.test(lower)) return "household";
  if (
    /pasta|rice|cereal|coffee|snack|chips|soda|juice|pretzel|popcorn|cracker|cookie|candy|nuts/.test(
      lower,
    )
  )
    return "pantry";
  return undefined;
}

function extractTitleFromPath(pathParts: string[]): string | null {
  const dpIdx = pathParts.indexOf("dp");
  if (dpIdx > 0) {
    const seg = pathParts[dpIdx - 1];
    if (!SKIP_SEGMENTS.has(seg.toLowerCase()) && !isMostlyNumeric(seg))
      return decodeSegment(seg);
  }

  const ipIdx = pathParts.indexOf("ip");
  if (ipIdx >= 0) {
    for (let i = ipIdx + 1; i < pathParts.length; i++) {
      const seg = pathParts[i];
      if (SKIP_SEGMENTS.has(seg.toLowerCase())) continue;
      if (!isMostlyNumeric(seg) && seg.length > 3) return decodeSegment(seg);
    }
  }

  const pIdx = pathParts.indexOf("p");
  if (pIdx >= 0 && pathParts[pIdx + 1] && pathParts[pIdx + 1] !== "-") {
    const seg = pathParts[pIdx + 1];
    if (!isMostlyNumeric(seg)) return decodeSegment(seg);
  }

  const candidates = pathParts
    .filter((p) => {
      const low = p.toLowerCase();
      return (
        p.length > 3 &&
        !SKIP_SEGMENTS.has(low) &&
        !isMostlyNumeric(p) &&
        /[a-zA-Z]{2,}/.test(p)
      );
    })
    .map(decodeSegment)
    .sort((a, b) => b.length - a.length);

  return candidates[0] ?? null;
}

function titleFromPathParts(pathParts: string[]): string | null {
  const raw = extractTitleFromPath(pathParts);
  if (!raw) return null;
  return cleanDecodedProductTitle(raw);
}

function estimateReferencePrice(title: string, category?: ProductCategory): number {
  const lower = title.toLowerCase();
  if (/shoe|sneaker|boot/.test(lower)) return 79.99;
  if (/jacket|coat/.test(lower)) return 89.99;
  if (/hoodie|sweater/.test(lower)) return 44.99;
  if (/jeans|pants/.test(lower)) return 49.99;
  if (/dress/.test(lower)) return 59.99;
  if (category === "shoes") return 74.99;
  if (category === "clothing") return 39.99;
  if (category === "sports") return 34.99;
  if (category === "books") return 17.99;
  if (category === "bedding") return 849.99;
  if (category === "home") return 249.99;
  if (category === "dairy") return 4.99;
  if (category === "salad") return 4.49;
  return 24.99;
}

export interface ParsedProductUrl {
  sourceRetailer?: RetailerId;
  hostname: string;
  slug: string;
  guessedTitle: string;
  category?: ProductCategory;
  referencePrice: number;
  upc?: string;
  catalogId?: string;
}

export function parseProductUrl(rawUrl: string): ParsedProductUrl | null {
  try {
    const url = new URL(rawUrl.trim());
    const hostname = url.hostname.replace(/^www\./, "");
    const sourceRetailer = URL_HOST_RETAILER[hostname];
    const pathParts = url.pathname.split("/").filter(Boolean);

    const fromQuery =
      url.searchParams.get("q") ??
      url.searchParams.get("searchTerm") ??
      url.searchParams.get("keyword");

    let title =
      titleFromPathParts(pathParts) ??
      (fromQuery ? decodeSegment(fromQuery.replace(/\+/g, " ")) : null);

    if (!title || title.length < 2 || /^search$/i.test(title)) {
      if (fromQuery) title = decodeSegment(fromQuery.replace(/\+/g, " "));
    }

    if (!title || title.length < 2) return null;

    const guessedTitle = titleCase(title);
    // Pasted links should not fuzzy-match catalog rows (e.g. "1-pack …" → socks).
    const category: ProductCategory | undefined =
      inferCategoryFromText(guessedTitle);

    const referencePrice = estimateReferencePrice(guessedTitle, category);

    const slug =
      pathParts.filter((p) => !isMostlyNumeric(p)).pop() ?? slugify(guessedTitle);

    return {
      sourceRetailer,
      hostname,
      slug: String(slug),
      guessedTitle,
      category,
      referencePrice,
      upc: undefined,
      catalogId: undefined,
    };
  } catch {
    return null;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveHostToRetailer(hostname: string): RetailerId | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (BLOCKED_PRODUCT_LINK_HOST.test(host)) return undefined;

  const entries = Object.entries(URL_HOST_RETAILER).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [pattern, id] of entries) {
    if (host === pattern || host.endsWith(`.${pattern}`)) {
      return isShoppableRetailer(id) ? id : undefined;
    }
  }
  return undefined;
}

/** Authoritative retailer for a product URL (used for live price links). */
export function retailerIdFromProductUrl(url: string): RetailerId | undefined {
  try {
    return resolveHostToRetailer(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

/** Primary hostname for favicon / retailer branding fallbacks. */
export function primaryDomainForRetailer(retailerId: RetailerId): string | null {
  const entry = Object.entries(URL_HOST_RETAILER).find(([, id]) => id === retailerId);
  return entry?.[0] ?? null;
}

export function productUrlMatchesRetailer(
  url: string,
  retailerId: RetailerId,
): boolean {
  return retailerIdFromProductUrl(url) === retailerId;
}
