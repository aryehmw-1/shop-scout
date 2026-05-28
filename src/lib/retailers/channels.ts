import { regionalAvailabilityBoost } from "../geo/markets";
import type { RetailerId } from "../types";
import { RETAILER_IDS } from "./meta";
import { isShoppableRetailer } from "./retailers-shoppable";

const LOCAL_RETAILER_CANDIDATES: RetailerId[] = [
  "walmart",
  "target",
  "kroger",
  "aldi",
  "costco",
  "sams",
  "publix",
  "dicks",
  "kohls",
  "macys",
  "oldnavy",
  "gap",
  "tjmaxx",
  "footlocker",
  "hm",
  "zara",
  "uniqlo",
  "levis",
  "ralphlauren",
  "lululemon",
  "northface",
  "skechers",
  "victoriassecret",
  "calvinklein",
  "tommyhilfiger",
  "coach",
  "michaelkors",
  "next",
  "barnesnoble",
  "booksamillion",
  "halfpricebooks",
  "mattressfirm",
  "ashley",
  "ikea",
  "nordstrom",
  "dillards",
  "rei",
  "columbia",
  "jcrew",
  "bloomingdales",
  "childrensplace",
  "carters",
  "marshalls",
  "buybuybaby",
  "potterybarnkids",
  "basspro",
  "cabelas",
  "academy",
  "scheels",
  "big5",
  "hibbett",
  "dunhams",
  "sportsmanswarehouse",
  "campingworld",
  "decathlon",
  "albertsons",
  "safeway",
  "vons",
  "jewelosco",
  "sprouts",
  "wholefoods",
  "heb",
  "meijer",
  "hyvee",
  "wegmans",
  "stopandshop",
  "giantfood",
  "weismarkets",
];

/** Chains with physical stores — eligible for "near you" row */
export const LOCAL_RETAILERS: RetailerId[] = LOCAL_RETAILER_CANDIDATES.filter(
  isShoppableRetailer,
);

/** Ships nationwide — always in online row (may also appear locally if they have a store) */
const ONLINE_ONLY_CANDIDATES: RetailerId[] = [
  "amazon",
  "instacart",
  "zappos",
  "nike",
  "adidas",
  "newbalance",
  "underarmour",
  "asics",
  "puma",
  "louisvuitton",
  "chanel",
  "hermes",
  "dior",
  "gucci",
  "prada",
  "burberry",
  "moncler",
  "indigo",
  "waterstones",
  "abebooks",
  "fnac",
  "whsmith",
  "kinokuniya",
  "powells",
  "bookshop",
  "worldofbooks",
  "alibris",
  "betterworldbooks",
  "dymocks",
  "strand",
  "bookoutlet",
  "wayfair",
  "sleepnumber",
  "brooklinen",
  "bollbranch",
  "saatva",
  "purple",
  "casper",
  "nectar",
  "dreamcloud",
  "parachute",
  "cozyearth",
  "potterybarn",
  "westelm",
  "quince",
  "avocado",
  "helix",
  "brooklynbedding",
  "frette",
  "sferra",
  "peacockalley",
  "zinus",
  "tuftandneedle",
  "leesa",
  "buffy",
  "tempurpedic",
  "nordstromrack",
  "anthropologie",
  "athleta",
  "patagonia",
  "oshkosh",
  "hannaandersson",
  "primary",
  "monicaandandy",
  "kytebaby",
  "littlesleepies",
  "poshpeanut",
  "maisonette",
  "gymboree",
  "honest",
  "burtsbeesbaby",
  "backcountry",
  "moosejaw",
  "evo",
  "sierra",
  "shein",
  "urbanoutfitters",
  "forever21",
  "llbean",
  "skims",
  "freshdirect",
  "thrivemarket",
  "boxed",
  "shipt",
  "katespade",
  "samsonite",
  "tumi",
  "rimowa",
  "away",
  "herschel",
  "dagnedover",
  "beis",
  "mcm",
  "bottegaveneta",
  "saintlaurent",
  "marcjacobs",
  "toryburch",
  "longchamp",
  "verabradley",
];

export const ONLINE_ONLY_RETAILERS: RetailerId[] = ONLINE_ONLY_CANDIDATES.filter(
  isShoppableRetailer,
);

function hash01(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return (Math.abs(h) % 1000) / 1000;
}

export function isRetailerNearZip(zip: string, retailer: RetailerId): boolean {
  if (!LOCAL_RETAILERS.includes(retailer)) return false;
  const h = hash01(`${zip}-${retailer}`) + regionalAvailabilityBoost(zip, retailer);
  if (retailer === "aldi") return h > 0.32;
  if (retailer === "publix") return h > 0.45;
  if (retailer === "tjmaxx" || retailer === "marshalls") return h > 0.18;
  if (
    retailer === "dicks" ||
    retailer === "footlocker" ||
    retailer === "basspro" ||
    retailer === "cabelas" ||
    retailer === "academy" ||
    retailer === "scheels" ||
    retailer === "big5" ||
    retailer === "hibbett" ||
    retailer === "dunhams" ||
    retailer === "sportsmanswarehouse"
  )
    return h > 0.14;
  if (retailer === "kohls" || retailer === "macys" || retailer === "gap" || retailer === "oldnavy")
    return h > 0.1;
  if (retailer === "hm" || retailer === "zara" || retailer === "uniqlo") return h > 0.2;
  if (retailer === "lululemon" || retailer === "northface" || retailer === "levis")
    return h > 0.12;
  if (retailer === "ralphlauren" || retailer === "coach" || retailer === "michaelkors")
    return h > 0.15;
  if (retailer === "costco" || retailer === "sams") return h > 0.12;
  if (
    retailer === "barnesnoble" ||
    retailer === "booksamillion" ||
    retailer === "halfpricebooks"
  )
    return h > 0.1;
  if (retailer === "mattressfirm" || retailer === "ashley") return h > 0.14;
  if (retailer === "ikea") return h > 0.08;
  if (retailer === "nordstrom" || retailer === "bloomingdales" || retailer === "dillards")
    return h > 0.12;
  if (retailer === "rei" || retailer === "columbia" || retailer === "jcrew") return h > 0.1;
  if (retailer === "childrensplace" || retailer === "carters") return h > 0.14;
  if (
    retailer === "albertsons" ||
    retailer === "safeway" ||
    retailer === "vons" ||
    retailer === "jewelosco"
  )
    return h > 0.1;
  if (retailer === "sprouts" || retailer === "wholefoods" || retailer === "wegmans")
    return h > 0.12;
  if (retailer === "heb" || retailer === "meijer" || retailer === "hyvee") return h > 0.14;
  if (retailer === "stopandshop" || retailer === "giantfood" || retailer === "weismarkets")
    return h > 0.11;
  return h > 0.04;
}

/** Stores with a location near this ZIP — pickup / in-store */
export function getLocalRetailersForZip(zip: string): RetailerId[] {
  return LOCAL_RETAILERS.filter((r) => isRetailerNearZip(zip, r));
}

/**
 * Online row: all retailers (same store can appear in both rows).
 * Near-you chains also ship online at the same item price.
 */
export function getOnlineRetailersForZip(_zip: string): RetailerId[] {
  return [...RETAILER_IDS];
}
