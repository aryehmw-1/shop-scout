import type { RetailerId } from "../types";
import { BOOKS_HOME_RETAILERS } from "./retailers-books-home";
import { FASHION_EXTRA_RETAILERS } from "./retailers-fashion-extra";
import { GROCERY_EXTRA_RETAILERS } from "./retailers-grocery-extra";
import { BAGS_LUXURY_RETAILERS } from "./retailers-bags-luxury";
import { KIDS_EXTRA_RETAILERS } from "./retailers-kids-extra";
import { SPORTS_EXTRA_RETAILERS } from "./retailers-sports-extra";
import { filterShoppableRetailers } from "./retailers-shoppable";

export interface RetailerMeta {
  id: RetailerId;
  name: string;
  shortName: string;
  color: string;
  tagline: string;
  types: (
    | "grocery"
    | "general"
    | "clothing"
    | "shoes"
    | "sports"
    | "books"
    | "bedding"
    | "home"
  )[];
}

const ALL_RETAILERS: RetailerMeta[] = [
  {
    id: "walmart",
    name: "Walmart",
    shortName: "Walmart",
    color: "#0071CE",
    tagline: "Everyday low prices",
    types: ["grocery", "general", "clothing", "shoes"],
  },
  {
    id: "target",
    name: "Target",
    shortName: "Target",
    color: "#CC0000",
    tagline: "Expect more, pay less",
    types: ["grocery", "general", "clothing", "shoes"],
  },
  {
    id: "amazon",
    name: "Amazon",
    shortName: "Amazon",
    color: "#FF9900",
    tagline: "Ships nationwide",
    types: ["grocery", "general", "clothing", "sports", "shoes"],
  },
  {
    id: "kroger",
    name: "Kroger",
    shortName: "Kroger",
    color: "#004B87",
    tagline: "Fresh for everyone",
    types: ["grocery", "general"],
  },
  {
    id: "publix",
    name: "Publix",
    shortName: "Publix",
    color: "#3C8638",
    tagline: "Where shopping is a pleasure",
    types: ["grocery", "general"],
  },
  {
    id: "costco",
    name: "Costco",
    shortName: "Costco",
    color: "#E31837",
    tagline: "Bulk savings",
    types: ["grocery", "general", "clothing"],
  },
  {
    id: "aldi",
    name: "Aldi",
    shortName: "Aldi",
    color: "#00529B",
    tagline: "Simply lower prices",
    types: ["grocery"],
  },
  {
    id: "instacart",
    name: "Instacart",
    shortName: "Instacart",
    color: "#43B02A",
    tagline: "Delivery from local stores",
    types: ["grocery", "general"],
  },
  {
    id: "sams",
    name: "Sam's Club",
    shortName: "Sam's",
    color: "#0060A9",
    tagline: "Members save more",
    types: ["grocery", "general", "clothing"],
  },
  {
    id: "burlington",
    name: "Burlington",
    shortName: "Burlington",
    color: "#C4122E",
    tagline: "Off-price fashion & home",
    types: ["clothing", "general", "shoes"],
  },
  {
    id: "dicks",
    name: "DICK'S Sporting Goods",
    shortName: "DICK'S",
    color: "#006554",
    tagline: "Sports & activewear",
    types: ["sports", "clothing", "shoes"],
  },
  {
    id: "kohls",
    name: "Kohl's",
    shortName: "Kohl's",
    color: "#6B2C91",
    tagline: "Style for the family",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "macys",
    name: "Macy's",
    shortName: "Macy's",
    color: "#E21A2C",
    tagline: "Fashion & home",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "oldnavy",
    name: "Old Navy",
    shortName: "Old Navy",
    color: "#002D62",
    tagline: "Affordable family fashion",
    types: ["clothing", "shoes"],
  },
  {
    id: "ross",
    name: "Ross Dress for Less",
    shortName: "Ross",
    color: "#006341",
    tagline: "Off-price deals",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "tjmaxx",
    name: "TJ Maxx",
    shortName: "TJ Maxx",
    color: "#B5121B",
    tagline: "Designer brands for less",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "footlocker",
    name: "Foot Locker",
    shortName: "Foot Locker",
    color: "#E31837",
    tagline: "Sneakers & athletic style",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "zappos",
    name: "Zappos",
    shortName: "Zappos",
    color: "#1F4E79",
    tagline: "Shoes shipped free",
    types: ["shoes", "clothing"],
  },
  {
    id: "hm",
    name: "H&M",
    shortName: "H&M",
    color: "#E50010",
    tagline: "Trendy fashion",
    types: ["clothing", "shoes"],
  },
  {
    id: "nike",
    name: "Nike",
    shortName: "Nike",
    color: "#111111",
    tagline: "Official Nike store",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "adidas",
    name: "Adidas",
    shortName: "Adidas",
    color: "#000000",
    tagline: "Impossible is nothing",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "newbalance",
    name: "New Balance",
    shortName: "New Balance",
    color: "#CF0A2C",
    tagline: "Made in USA heritage",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "underarmour",
    name: "Under Armour",
    shortName: "UA",
    color: "#1D1D1D",
    tagline: "Athletic performance",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "asics",
    name: "ASICS",
    shortName: "ASICS",
    color: "#0054A6",
    tagline: "Sound mind, sound body",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "puma",
    name: "Puma",
    shortName: "Puma",
    color: "#181818",
    tagline: "Forever faster",
    types: ["shoes", "clothing", "sports"],
  },
  {
    id: "zara",
    name: "Zara",
    shortName: "Zara",
    color: "#000000",
    tagline: "Fast fashion",
    types: ["clothing", "shoes"],
  },
  {
    id: "uniqlo",
    name: "Uniqlo",
    shortName: "Uniqlo",
    color: "#E60012",
    tagline: "LifeWear",
    types: ["clothing"],
  },
  {
    id: "gap",
    name: "Gap",
    shortName: "Gap",
    color: "#002F6C",
    tagline: "American style",
    types: ["clothing", "shoes"],
  },
  {
    id: "levis",
    name: "Levi's",
    shortName: "Levi's",
    color: "#C41230",
    tagline: "Original denim",
    types: ["clothing", "shoes"],
  },
  {
    id: "ralphlauren",
    name: "Ralph Lauren",
    shortName: "Ralph Lauren",
    color: "#041E3A",
    tagline: "Timeless style",
    types: ["clothing", "shoes"],
  },
  {
    id: "lululemon",
    name: "Lululemon",
    shortName: "Lululemon",
    color: "#D41935",
    tagline: "Athletic apparel",
    types: ["clothing", "sports", "shoes"],
  },
  {
    id: "northface",
    name: "The North Face",
    shortName: "North Face",
    color: "#000000",
    tagline: "Outdoor gear",
    types: ["clothing", "sports", "shoes"],
  },
  {
    id: "skechers",
    name: "Skechers",
    shortName: "Skechers",
    color: "#0054A6",
    tagline: "Comfort footwear",
    types: ["shoes", "clothing"],
  },
  {
    id: "victoriassecret",
    name: "Victoria's Secret",
    shortName: "VS",
    color: "#F5C6D6",
    tagline: "Lingerie & apparel",
    types: ["clothing"],
  },
  {
    id: "calvinklein",
    name: "Calvin Klein",
    shortName: "Calvin Klein",
    color: "#000000",
    tagline: "Modern essentials",
    types: ["clothing", "shoes"],
  },
  {
    id: "tommyhilfiger",
    name: "Tommy Hilfiger",
    shortName: "Tommy",
    color: "#001A4D",
    tagline: "Classic American",
    types: ["clothing", "shoes"],
  },
  {
    id: "coach",
    name: "Coach",
    shortName: "Coach",
    color: "#8B4513",
    tagline: "Luxury leather",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "michaelkors",
    name: "Michael Kors",
    shortName: "Michael Kors",
    color: "#000000",
    tagline: "Jet-set style",
    types: ["clothing", "shoes"],
  },
  {
    id: "next",
    name: "Next",
    shortName: "Next",
    color: "#2D2D2D",
    tagline: "British fashion",
    types: ["clothing", "shoes"],
  },
  {
    id: "louisvuitton",
    name: "Louis Vuitton",
    shortName: "Louis Vuitton",
    color: "#3D2817",
    tagline: "Luxury fashion",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "chanel",
    name: "Chanel",
    shortName: "Chanel",
    color: "#000000",
    tagline: "Haute couture",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "hermes",
    name: "Hermès",
    shortName: "Hermès",
    color: "#FF7F32",
    tagline: "Artisan luxury",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "dior",
    name: "Dior",
    shortName: "Dior",
    color: "#C9A227",
    tagline: "French luxury",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "gucci",
    name: "Gucci",
    shortName: "Gucci",
    color: "#006341",
    tagline: "Italian luxury",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "prada",
    name: "Prada",
    shortName: "Prada",
    color: "#000000",
    tagline: "Italian fashion",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "burberry",
    name: "Burberry",
    shortName: "Burberry",
    color: "#D4AF37",
    tagline: "British heritage",
    types: ["clothing", "shoes", "general"],
  },
  {
    id: "moncler",
    name: "Moncler",
    shortName: "Moncler",
    color: "#E4002B",
    tagline: "Luxury outerwear",
    types: ["clothing", "sports"],
  },
  ...GROCERY_EXTRA_RETAILERS,
  ...BOOKS_HOME_RETAILERS,
  ...FASHION_EXTRA_RETAILERS,
  ...BAGS_LUXURY_RETAILERS,
  ...KIDS_EXTRA_RETAILERS,
  ...SPORTS_EXTRA_RETAILERS,
];

/** Active retailers with working online product search */
export const RETAILERS: RetailerMeta[] = filterShoppableRetailers(ALL_RETAILERS);

export const RETAILER_IDS = RETAILERS.map((r) => r.id);

/** Live count for UI copy — updates when retailers are added or removed */
export const SHOPPABLE_STORE_COUNT = RETAILERS.length;

export function getRetailerMeta(id: RetailerId): RetailerMeta {
  return RETAILERS.find((r) => r.id === id) ?? RETAILERS[0];
}

export { retailerSellsCategory } from "./retailers-category";
