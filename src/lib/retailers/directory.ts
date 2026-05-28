import type { RetailerId } from "../types";
import type { RetailerMeta } from "./meta";
import { RETAILERS } from "./meta";

export type StoreDepartment =
  | "grocery"
  | "fashion"
  | "luxury"
  | "bags"
  | "sports"
  | "home"
  | "books"
  | "kids";

export interface StoreDepartmentGroup {
  id: StoreDepartment;
  label: string;
  description: string;
}

export const STORE_DEPARTMENTS: StoreDepartmentGroup[] = [
  {
    id: "grocery",
    label: "Grocery & delivery",
    description: "Supermarkets and grocery delivery",
  },
  {
    id: "fashion",
    label: "Fashion & apparel",
    description: "Clothing, shoes, and everyday wear",
  },
  {
    id: "luxury",
    label: "Luxury designers",
    description: "High-end fashion houses",
  },
  {
    id: "bags",
    label: "Bags & luggage",
    description: "Handbags, backpacks, and travel",
  },
  {
    id: "kids",
    label: "Kids & baby",
    description: "Children's clothing and baby",
  },
  {
    id: "sports",
    label: "Sports & outdoor",
    description: "Athletic gear and outdoor",
  },
  {
    id: "home",
    label: "Home & bedding",
    description: "Furniture, mattresses, and décor",
  },
  {
    id: "books",
    label: "Books",
    description: "Bookstores and used books",
  },
];

const LUXURY_IDS = new Set<RetailerId>([
  "louisvuitton",
  "chanel",
  "hermes",
  "gucci",
  "prada",
  "dior",
  "burberry",
  "moncler",
  "bottegaveneta",
  "saintlaurent",
]);

const BAGS_IDS = new Set<RetailerId>([
  "katespade",
  "samsonite",
  "tumi",
  "longchamp",
  "marcjacobs",
  "toryburch",
  "rimowa",
  "away",
  "herschel",
  "jansport",
  "fjallraven",
  "dagnedover",
  "beis",
  "verabradley",
  "mcm",
  "coach",
  "michaelkors",
]);

const KIDS_IDS = new Set<RetailerId>([
  "childrensplace",
  "carters",
  "oshkosh",
  "potterybarnkids",
  "gerber",
  "buybuybaby",
  "hannaandersson",
  "primary",
  "monicaandandy",
  "kytebaby",
  "crateandkids",
  "littlesleepies",
  "poshpeanut",
  "maisonette",
  "janieandjack",
  "gymboree",
  "honest",
  "burtsbeesbaby",
  "albeebaby",
]);

const SPORTS_IDS = new Set<RetailerId>([
  "dicks",
  "rei",
  "patagonia",
  "northface",
  "columbia",
  "nike",
  "adidas",
  "underarmour",
  "llbean",
  "asics",
  "puma",
  "newbalance",
  "footlocker",
  "basspro",
  "cabelas",
  "academy",
  "sportsmanswarehouse",
  "scheels",
  "backcountry",
  "moosejaw",
  "evo",
  "sierra",
  "big5",
  "hibbett",
  "dunhams",
  "fleetfeet",
  "orvis",
  "westmarine",
  "campingworld",
  "decathlon",
  "publiclands",
]);

const BOOK_IDS = new Set<RetailerId>([
  "barnesnoble",
  "indigo",
  "waterstones",
  "abebooks",
  "fnac",
  "whsmith",
  "kinokuniya",
  "booksamillion",
  "powells",
  "bookshop",
  "worldofbooks",
  "alibris",
  "betterworldbooks",
  "halfpricebooks",
  "dymocks",
  "strand",
  "bookoutlet",
]);

const HOME_IDS = new Set<RetailerId>([
  "wayfair",
  "mattressfirm",
  "sleepnumber",
  "ashley",
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
  "ikea",
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
]);

export function getStoreDepartment(meta: RetailerMeta): StoreDepartment {
  if (LUXURY_IDS.has(meta.id)) return "luxury";
  if (BAGS_IDS.has(meta.id)) return "bags";
  if (KIDS_IDS.has(meta.id)) return "kids";
  if (SPORTS_IDS.has(meta.id)) return "sports";
  if (BOOK_IDS.has(meta.id)) return "books";
  if (HOME_IDS.has(meta.id)) return "home";
  if (meta.types.includes("grocery")) return "grocery";
  if (
    meta.types.includes("bedding") ||
    meta.types.includes("home")
  )
    return "home";
  if (meta.types.includes("books")) return "books";
  return "fashion";
}

export function groupRetailersByDepartment(
  retailers: RetailerMeta[] = RETAILERS,
): Record<StoreDepartment, RetailerMeta[]> {
  const groups = Object.fromEntries(
    STORE_DEPARTMENTS.map((d) => [d.id, [] as RetailerMeta[]]),
  ) as Record<StoreDepartment, RetailerMeta[]>;

  for (const r of retailers) {
    groups[getStoreDepartment(r)].push(r);
  }

  for (const dept of STORE_DEPARTMENTS) {
    groups[dept.id].sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups;
}

export function searchRetailers(query: string, retailers: RetailerMeta[] = RETAILERS): RetailerMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return retailers;
  return retailers.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.shortName.toLowerCase().includes(q) ||
      r.tagline.toLowerCase().includes(q),
  );
}
