import type { ProductCategory } from "./types";
import { parseQueryAttributes } from "./retailers/search";

function placeholder(label: string, bg = "e7e5e4", fg = "44403c"): string {
  return `https://placehold.co/500x500/${bg}/${fg}?text=${encodeURIComponent(label)}&font=roboto`;
}

/** Reliable color-accurate placeholders (always load) */
const COLOR_PRODUCT_IMAGES: Record<string, string> = {
  black: placeholder("Black", "141414", "e8e8e8"),
  white: placeholder("White", "f4f4f4", "333333"),
  navy: placeholder("Navy", "1e3a5f", "e8e8e8"),
  gray: placeholder("Gray", "6b7280", "e8e8e8"),
  grey: placeholder("Gray", "6b7280", "e8e8e8"),
  red: placeholder("Red", "b91c1c", "e8e8e8"),
  blue: placeholder("Blue", "2563eb", "e8e8e8"),
};

export const CATEGORY_IMAGES: Record<ProductCategory | "general", string> = {
  salad: placeholder("Salad", "84cc16", "ffffff"),
  dairy: placeholder("Dairy", "fef3c7", "44403c"),
  bakery: placeholder("Bakery", "fde68a", "44403c"),
  produce: placeholder("Produce", "22c55e", "ffffff"),
  meat: placeholder("Meat", "fca5a5", "44403c"),
  pantry: placeholder("Pantry", "d6d3d1", "44403c"),
  household: placeholder("Household", "cbd5e1", "44403c"),
  clothing: placeholder("Clothing", "a8a29e", "ffffff"),
  shoes: placeholder("Shoes", "78716c", "ffffff"),
  sports: placeholder("Sports", "0ea5e9", "ffffff"),
  books: placeholder("Books", "92400e", "ffffff"),
  bedding: placeholder("Bedding", "c4b5fd", "44403c"),
  home: placeholder("Home", "94a3b8", "ffffff"),
  general: placeholder("Product", "d6d3d1", "44403c"),
};

const PRODUCT_IMAGES: Record<string, string> = {
  "super-pretzel": CATEGORY_IMAGES.pantry,
  "potato-chips": CATEGORY_IMAGES.pantry,
  "microwave-popcorn": CATEGORY_IMAGES.pantry,
  "cheese-crackers": CATEGORY_IMAGES.pantry,
  "nike-running-shoes": CATEGORY_IMAGES.shoes,
  "adidas-ultraboost": CATEGORY_IMAGES.shoes,
  "new-balance-990": CATEGORY_IMAGES.shoes,
  "under-armour-hovr": CATEGORY_IMAGES.shoes,
  "asics-gel-venture": CATEGORY_IMAGES.shoes,
  "puma-suede-classic": CATEGORY_IMAGES.shoes,
  "bananas-bunch": CATEGORY_IMAGES.produce,
  "hoodie-black-mens": COLOR_PRODUCT_IMAGES.black,
  "hoodie-navy-mens": COLOR_PRODUCT_IMAGES.navy,
  "hoodie-white-mens": COLOR_PRODUCT_IMAGES.white,
  "hoodie-fleece": COLOR_PRODUCT_IMAGES.gray,
  "fiction-novel": CATEGORY_IMAGES.books,
  "audiobook-credit": CATEGORY_IMAGES.books,
  "queen-mattress": CATEGORY_IMAGES.bedding,
  "cotton-sheet-set": CATEGORY_IMAGES.bedding,
  "down-comforter": CATEGORY_IMAGES.bedding,
  "hoodie-black-womens": COLOR_PRODUCT_IMAGES.black,
  "hoodie-gray-womens": COLOR_PRODUCT_IMAGES.gray,
  "toddler-hoodie": CATEGORY_IMAGES.clothing,
  "toddler-shoes": CATEGORY_IMAGES.shoes,
  "toddler-onesie-pack": CATEGORY_IMAGES.clothing,
  "boys-hoodie-kids": CATEGORY_IMAGES.clothing,
  "girls-dress-kids": CATEGORY_IMAGES.clothing,
  "womens-leggings": CATEGORY_IMAGES.clothing,
  "mens-chinos":
    "https://images.unsplash.com/photo-1473966967909-574e6d719e0a?w=500&h=500&fit=crop",
  "mens-dress-pants": CATEGORY_IMAGES.clothing,
  "womens-pants": CATEGORY_IMAGES.clothing,
};

export const IMAGE_FALLBACK = CATEGORY_IMAGES.general;

function colorFromItemAndQuery(
  item: { title: string; brand: string; keywords: string[] },
  queryHint?: string,
): string | undefined {
  const blob = `${item.title} ${item.brand} ${item.keywords.join(" ")} ${queryHint ?? ""}`.toLowerCase();
  const colors = parseQueryAttributes(queryHint ?? blob).colors;
  if (colors.length > 0) return colors[0];
  for (const c of ["black", "white", "navy", "gray", "grey", "red", "blue"]) {
    if (blob.includes(c)) return c;
  }
  return undefined;
}

export function imageForProduct(
  item: {
    id: string;
    category: ProductCategory | string;
    title: string;
    brand: string;
    keywords: string[];
  },
  queryHint?: string,
): string {
  if (item.id.startsWith("syn-") && queryHint?.trim()) {
    const label = queryHint.trim().split(/\s+/).slice(0, 3).join(" ").slice(0, 28);
    return placeholder(label);
  }

  if (PRODUCT_IMAGES[item.id]) return PRODUCT_IMAGES[item.id];

  const color = colorFromItemAndQuery(item, queryHint);
  if (color && COLOR_PRODUCT_IMAGES[color]) return COLOR_PRODUCT_IMAGES[color];

  const text = `${item.title} ${item.brand} ${item.keywords.join(" ")}`.toLowerCase();
  if (/pretzel|chip|cracker|popcorn|snack/.test(text)) return CATEGORY_IMAGES.pantry;
  if (/shoe|sneaker|boot/.test(text)) return CATEGORY_IMAGES.shoes;
  if (/hoodie|hoody|sweatshirt/.test(text)) {
    return color ? (COLOR_PRODUCT_IMAGES[color] ?? CATEGORY_IMAGES.clothing) : CATEGORY_IMAGES.clothing;
  }
  if (/shirt|jeans|dress|jacket|pants|leggings|onesie/.test(text)) return CATEGORY_IMAGES.clothing;
  if (/book|novel|fiction|audiobook|hardcover|paperback/.test(text)) return CATEGORY_IMAGES.books;
  if (/mattress|sheets?|comforter|duvet|pillow|bedding/.test(text)) return CATEGORY_IMAGES.bedding;
  if (/sofa|couch|furniture|lamp|rug/.test(text)) return CATEGORY_IMAGES.home;
  if (/basketball|yoga|fitness|sports/.test(text)) return CATEGORY_IMAGES.sports;

  const cat = item.category as ProductCategory;
  return CATEGORY_IMAGES[cat] ?? IMAGE_FALLBACK;
}
