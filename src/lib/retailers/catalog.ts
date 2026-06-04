import {
  formatSearchProductTitle,
  isGenericBrandToken,
} from "../shopping/product-display";
import { classifyProductImageSource } from "../search/product-image-source";
import { buildOfferClickUrl } from "./retailer-url";
import type {
  ProductOffer,
  ProductSearchResults,
  ReferenceProduct,
  RetailerId,
  ShoppingChannel,
  ShoppingIntent,
} from "../types";
import { imageForProduct } from "../catalog-images";
import { resolveCatalogRow } from "../catalog/resolve-variant";
import { applyOfferQualityGates } from "../offers/offer-quality";
import { scoreOfferConfidence } from "../identity/offer-confidence";
import {
  createVariant,
  createVariantGroup,
  createVariantSize,
  type CatalogVariant,
  type CatalogVariantGroup,
} from "../catalog/variants";
import { rankSimilarCatalogItems } from "../search/product-similarity";
import { getRetailerMeta, retailerSellsCategory } from "./meta";
import { getRetailerListing } from "./listings";
import {
  getLocalRetailersForZip,
  getOnlineRetailersForZip,
} from "./channels";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import {
  parseQueryAttributes,
  queryRequiresCategoryMatch,
  queryRequiresStrictMatch,
  scoreItem,
  tokenizeQuery,
} from "./search";

export interface CatalogItem {
  id: string;
  title: string;
  brand: string;
  size: string;
  upc: string;
  imageUrl: string;
  category: string;
  keywords: string[];
  organic: boolean;
  basePrice: number;
  unitLabel: string;
  slug: string;
  /** Preferred: color/style groups with sizes (images on group). */
  variantGroups?: CatalogVariantGroup[];
  /** Legacy flat SKUs — auto-grouped by color at sync time */
  variants?: CatalogVariant[];
}

export type { CatalogVariant, CatalogVariantGroup };

const CATALOG: CatalogItem[] = [
  {
    id: "spinach-og-10",
    title: "Organic Baby Spinach",
    brand: "Organic Girl",
    size: "10 oz",
    upc: "089836002018",
    imageUrl:
      "https://images.unsplash.com/photo-1576045057995-568b588f82fb?w=500&h=500&fit=crop",
    category: "salad",
    keywords: ["salad", "greens", "spinach", "lettuce", "organic"],
    organic: true,
    basePrice: 4.49,
    unitLabel: "oz",
    slug: "organic-baby-spinach-10oz",
  },
  {
    id: "spring-mix-5",
    title: "Spring Mix Salad",
    brand: "Taylor Farms",
    size: "5 oz",
    upc: "030223015608",
    imageUrl:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&h=500&fit=crop",
    category: "salad",
    keywords: ["salad", "greens", "mix", "spring", "lettuce"],
    organic: false,
    basePrice: 2.98,
    unitLabel: "oz",
    slug: "spring-mix-5oz",
  },
  {
    id: "romaine-hearts-3",
    title: "Romaine Hearts",
    brand: "Fresh Express",
    size: "3 ct",
    upc: "071430000123",
    imageUrl:
      "https://images.unsplash.com/photo-1622206151226-18ca53c32a06?w=500&h=500&fit=crop",
    category: "salad",
    keywords: ["salad", "romaine", "lettuce", "hearts", "caesar"],
    organic: false,
    basePrice: 3.29,
    unitLabel: "heart",
    slug: "romaine-hearts-3ct",
  },
  {
    id: "caesar-kit",
    title: "Caesar Salad Kit",
    brand: "Dole",
    size: "12.3 oz",
    upc: "071430001234",
    imageUrl:
      "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=500&h=500&fit=crop",
    category: "salad",
    keywords: ["salad", "kit", "caesar", "ready", "meal"],
    organic: false,
    basePrice: 3.99,
    unitLabel: "kit",
    slug: "caesar-salad-kit",
  },
  {
    id: "arugula-og-5",
    title: "Organic Arugula",
    brand: "Earthbound Farm",
    size: "5 oz",
    upc: "032326020456",
    imageUrl:
      "https://images.unsplash.com/photo-1592419044706-39796d4c6f4e?w=500&h=500&fit=crop",
    category: "salad",
    keywords: ["salad", "arugula", "greens", "organic"],
    organic: true,
    basePrice: 3.79,
    unitLabel: "oz",
    slug: "organic-arugula-5oz",
  },
  {
    id: "milk-whole-gal",
    title: "Whole Milk",
    brand: "Great Value",
    size: "1 gal",
    upc: "078742000123",
    imageUrl:
      "https://images.unsplash.com/photo-1563636612118-3ead5817e875?w=500&h=500&fit=crop",
    category: "dairy",
    keywords: ["milk", "dairy", "whole"],
    organic: false,
    basePrice: 3.48,
    unitLabel: "gal",
    slug: "whole-milk-gallon",
  },
  {
    id: "milk-og-half",
    title: "Organic 2% Milk",
    brand: "Horizon",
    size: "64 fl oz",
    upc: "074248002018",
    imageUrl:
      "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&h=500&fit=crop",
    category: "dairy",
    keywords: ["milk", "organic", "dairy", "2%"],
    organic: true,
    basePrice: 5.99,
    unitLabel: "oz",
    slug: "organic-2-milk",
  },
  {
    id: "eggs-dozen",
    title: "Large Grade A Eggs",
    brand: "Eggland's Best",
    size: "12 ct",
    upc: "071430004567",
    imageUrl:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=500&h=500&fit=crop",
    category: "dairy",
    keywords: ["eggs", "breakfast", "protein"],
    organic: false,
    basePrice: 4.19,
    unitLabel: "dozen",
    slug: "large-eggs-12ct",
  },
  {
    id: "bread-wheat",
    title: "100% Whole Wheat Bread",
    brand: "Nature's Own",
    size: "20 oz",
    upc: "071430005678",
    imageUrl:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&h=500&fit=crop",
    category: "bakery",
    keywords: ["bread", "wheat", "sandwich", "toast"],
    organic: false,
    basePrice: 3.29,
    unitLabel: "loaf",
    slug: "whole-wheat-bread",
  },
  {
    id: "bananas-bunch",
    title: "Bananas",
    brand: "Fresh Produce",
    size: "2 lb",
    upc: "040000000123",
    imageUrl:
      "https://images.unsplash.com/photo-1571771894821-ce9b6c11fe08?w=500&h=500&fit=crop",
    category: "produce",
    keywords: ["banana", "fruit", "produce"],
    organic: false,
    basePrice: 1.28,
    unitLabel: "lb",
    slug: "bananas-2lb",
  },
  {
    id: "chicken-breast",
    title: "Boneless Skinless Chicken Breast",
    brand: "Tyson",
    size: "1.5 lb",
    upc: "023808000123",
    imageUrl:
      "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=500&h=500&fit=crop",
    category: "meat",
    keywords: ["chicken", "breast", "protein", "dinner", "meal"],
    organic: false,
    basePrice: 8.97,
    unitLabel: "lb",
    slug: "chicken-breast-1-5lb",
  },
  {
    id: "pasta-spaghetti",
    title: "Spaghetti",
    brand: "Barilla",
    size: "16 oz",
    upc: "076808000123",
    imageUrl:
      "https://images.unsplash.com/photo-1551462147-858ead2d3cd2?w=500&h=500&fit=crop",
    category: "pantry",
    keywords: ["pasta", "spaghetti", "dinner", "italian"],
    organic: false,
    basePrice: 1.48,
    unitLabel: "oz",
    slug: "barilla-spaghetti",
  },
  {
    id: "butter-salted",
    title: "Salted Butter",
    brand: "Land O Lakes",
    size: "1 lb",
    upc: "034500000123",
    imageUrl:
      "https://images.unsplash.com/photo-1589985270824-afa2eaa0a08e?w=500&h=500&fit=crop",
    category: "dairy",
    keywords: ["butter", "dairy", "baking"],
    organic: false,
    basePrice: 4.88,
    unitLabel: "lb",
    slug: "salted-butter-1lb",
  },
  {
    id: "coffee-ground",
    title: "Breakfast Blend Ground Coffee",
    brand: "Folgers",
    size: "25.9 oz",
    upc: "025500000123",
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&h=500&fit=crop",
    category: "pantry",
    keywords: ["coffee", "breakfast", "morning"],
    organic: false,
    basePrice: 9.99,
    unitLabel: "oz",
    slug: "folgers-breakfast-blend",
  },
  {
    id: "yogurt-greek",
    title: "Greek Yogurt Plain",
    brand: "Chobani",
    size: "32 oz",
    upc: "081450000123",
    imageUrl:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500&h=500&fit=crop",
    category: "dairy",
    keywords: ["yogurt", "greek", "dairy", "breakfast", "protein"],
    organic: false,
    basePrice: 5.49,
    unitLabel: "oz",
    slug: "greek-yogurt-plain",
  },
  {
    id: "cereal-honey",
    title: "Honey Nut Cereal",
    brand: "Cheerios",
    size: "18.8 oz",
    upc: "081450000456",
    imageUrl:
      "https://images.unsplash.com/photo-1526318472351-c40e858cee56?w=500&h=500&fit=crop",
    category: "pantry",
    keywords: ["cereal", "breakfast", "honey", "oats"],
    organic: false,
    basePrice: 4.78,
    unitLabel: "oz",
    slug: "honey-nut-cereal",
  },
  {
    id: "paper-towels",
    title: "Paper Towels",
    brand: "Bounty",
    size: "6 rolls",
    upc: "081450000789",
    imageUrl:
      "https://images.unsplash.com/photo-1584556819299-afa27beb7f33?w=500&h=500&fit=crop",
    category: "household",
    keywords: ["paper", "towels", "household", "kitchen", "cleaning"],
    organic: false,
    basePrice: 12.99,
    unitLabel: "roll",
    slug: "paper-towels-6roll",
  },
  {
    id: "ground-beef",
    title: "Ground Beef 85% Lean",
    brand: "Laura's Lean",
    size: "1 lb",
    upc: "081450001012",
    imageUrl:
      "https://images.unsplash.com/photo-1603048588665-791a799a26ca?w=500&h=500&fit=crop",
    category: "meat",
    keywords: ["beef", "ground", "meat", "burger", "dinner"],
    organic: false,
    basePrice: 6.49,
    unitLabel: "lb",
    slug: "ground-beef-1lb",
  },
  {
    id: "oj-juice",
    title: "Orange Juice",
    brand: "Tropicana",
    size: "52 fl oz",
    upc: "081450001345",
    imageUrl:
      "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&h=500&fit=crop",
    category: "produce",
    keywords: ["orange", "juice", "drink", "breakfast"],
    organic: false,
    basePrice: 4.29,
    unitLabel: "oz",
    slug: "orange-juice-52oz",
  },
  {
    id: "nike-running-shoes",
    title: "Revolution Running Shoes",
    brand: "Nike",
    size: "Men's 10",
    upc: "091200000123",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["shoes", "running", "sneakers", "nike", "athletic", "mens", "trainers"],
    organic: false,
    basePrice: 69.99,
    unitLabel: "pair",
    slug: "nike-revolution-running",
  },
  {
    id: "super-pretzel",
    title: "Soft Stuffed Pretzels",
    brand: "SuperPretzel",
    size: "13 oz",
    upc: "028400004567",
    imageUrl:
      "https://images.unsplash.com/photo-1606312619070-d48f4ecc6676?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: [
      "pretzel",
      "pretzels",
      "super",
      "superpretzel",
      "snack",
      "frozen",
      "stuffed",
      "soft",
    ],
    organic: false,
    basePrice: 3.49,
    unitLabel: "box",
    slug: "superpretzel-soft-stuffed",
  },
  {
    id: "potato-chips",
    title: "Classic Potato Chips",
    brand: "Lay's",
    size: "8 oz",
    upc: "028400003456",
    imageUrl:
      "https://images.unsplash.com/photo-1566478989037-eec170df8edb?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["chips", "potato", "snack", "crispy", "lays"],
    organic: false,
    basePrice: 3.99,
    unitLabel: "bag",
    slug: "lays-classic-chips",
  },
  {
    id: "microwave-popcorn",
    title: "Butter Microwave Popcorn",
    brand: "Orville Redenbacher",
    size: "3 ct",
    upc: "028400006789",
    imageUrl:
      "https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["popcorn", "snack", "microwave", "butter", "orville"],
    organic: false,
    basePrice: 2.99,
    unitLabel: "box",
    slug: "orville-popcorn",
  },
  {
    id: "cheese-crackers",
    title: "Original Cheese Crackers",
    brand: "Cheez-It",
    size: "12.4 oz",
    upc: "030100001234",
    imageUrl:
      "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["crackers", "cheese", "snack", "cheez-it", "cheezit"],
    organic: false,
    basePrice: 3.29,
    unitLabel: "box",
    slug: "cheez-it-crackers",
  },
  {
    id: "adidas-ultraboost",
    title: "Ultraboost Running Shoes",
    brand: "Adidas",
    size: "Women's 8",
    upc: "091200000456",
    imageUrl:
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["shoes", "sneakers", "adidas", "womens", "casual", "court"],
    organic: false,
    basePrice: 54.99,
    unitLabel: "pair",
    slug: "adidas-ultraboost",
  },
  {
    id: "new-balance-990",
    title: "990v5 Running Shoes",
    brand: "New Balance",
    size: "Men's 10",
    upc: "091200003010",
    imageUrl:
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=500&h=500&q=80",
    category: "shoes",
    keywords: ["new balance", "990", "running", "sneakers", "mens", "shoes"],
    organic: false,
    basePrice: 184.99,
    unitLabel: "pair",
    slug: "new-balance-990v5",
  },
  {
    id: "under-armour-hovr",
    title: "HOVR Phantom Running Shoes",
    brand: "Under Armour",
    size: "Men's 11",
    upc: "091200003011",
    imageUrl:
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=500&h=500&q=80",
    category: "shoes",
    keywords: ["under armour", "hovr", "running", "sneakers", "mens", "shoes"],
    organic: false,
    basePrice: 129.99,
    unitLabel: "pair",
    slug: "under-armour-hovr",
  },
  {
    id: "asics-gel-venture",
    title: "GEL-Venture 9 Running Shoes",
    brand: "ASICS",
    size: "Women's 8",
    upc: "091200003012",
    imageUrl:
      "https://images.unsplash.com/photo-1605348531580-370a7ba808c4?auto=format&fit=crop&w=500&h=500&q=80",
    category: "shoes",
    keywords: ["asics", "gel", "running", "sneakers", "womens", "shoes"],
    organic: false,
    basePrice: 74.99,
    unitLabel: "pair",
    slug: "asics-gel-venture",
  },
  {
    id: "puma-suede-classic",
    title: "Suede Classic Sneakers",
    brand: "Puma",
    size: "Men's 9",
    upc: "091200003013",
    imageUrl:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b3944a?auto=format&fit=crop&w=500&h=500&q=80",
    category: "shoes",
    keywords: ["puma", "suede", "sneakers", "casual", "mens", "shoes"],
    organic: false,
    basePrice: 79.99,
    unitLabel: "pair",
    slug: "puma-suede-classic",
  },
  {
    id: "jeans-slim",
    title: "Slim Fit Jeans",
    brand: "Levi's",
    size: "32x32",
    upc: "091200000789",
    imageUrl:
      "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["jeans", "pants", "denim", "levis", "clothing", "mens", "men"],
    organic: false,
    basePrice: 49.99,
    unitLabel: "each",
    slug: "levis-slim-jeans",
    variantGroups: [
      createVariantGroup({
        parentId: "jeans-slim",
        color: "Blue",
        isDefault: true,
        keywords: ["blue", "denim"],
        sizes: [
          createVariantSize({
            groupId: "jeans-slim--blue",
            sizeLabel: "32x32",
            gtin: "091200000789",
            basePrice: 49.99,
            isDefault: true,
          }),
          createVariantSize({
            groupId: "jeans-slim--blue",
            sizeLabel: "34x32",
            basePrice: 49.99,
          }),
          createVariantSize({
            groupId: "jeans-slim--blue",
            sizeLabel: "36x32",
            basePrice: 52.99,
          }),
        ],
      }),
      createVariantGroup({
        parentId: "jeans-slim",
        color: "Black",
        keywords: ["black", "denim"],
        sizes: [
          createVariantSize({
            groupId: "jeans-slim--black",
            sizeLabel: "32x32",
            gtin: "091200000790",
            basePrice: 54.99,
            isDefault: true,
          }),
          createVariantSize({
            groupId: "jeans-slim--black",
            sizeLabel: "34x32",
            gtin: "091200000791",
            basePrice: 54.99,
          }),
          createVariantSize({
            groupId: "jeans-slim--black",
            sizeLabel: "36x32",
            basePrice: 56.99,
          }),
        ],
      }),
    ],
  },
  {
    id: "mens-chinos",
    title: "Men's Stretch Chino Pants",
    brand: "Gap",
    size: "Men's 32x32",
    upc: "091200003020",
    imageUrl:
      "https://images.unsplash.com/photo-1473966967909-574e6d719e0a?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["pants", "chinos", "trousers", "mens", "men", "male", "clothing", "slacks"],
    organic: false,
    basePrice: 59.99,
    unitLabel: "each",
    slug: "gap-mens-chinos",
  },
  {
    id: "mens-joggers",
    title: "Men's Fleece Jogger Pants",
    brand: "Nike",
    size: "Men's L",
    upc: "091200003022",
    imageUrl:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: [
      "pants",
      "joggers",
      "jogger",
      "sweatpants",
      "mens",
      "men",
      "male",
      "clothing",
      "athletic",
      "fleece",
    ],
    organic: false,
    basePrice: 54.99,
    unitLabel: "each",
    slug: "nike-mens-joggers",
  },
  {
    id: "mens-dress-pants",
    title: "Men's Classic Dress Pants",
    brand: "Banana Republic",
    size: "Men's 34x32",
    upc: "091200003021",
    imageUrl:
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["pants", "dress", "trousers", "mens", "men", "formal", "slacks"],
    organic: false,
    basePrice: 79.99,
    unitLabel: "each",
    slug: "br-mens-dress-pants",
  },
  {
    id: "hoodie-fleece",
    title: "Fleece Pullover Hoodie",
    brand: "Hanes",
    size: "L",
    upc: "091200001012",
    imageUrl:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=500&h=500&q=80",
    category: "clothing",
    keywords: ["hoodie", "hoody", "sweatshirt", "pullover", "fleece", "gray", "grey", "mens"],
    organic: false,
    basePrice: 24.99,
    unitLabel: "each",
    slug: "fleece-hoodie",
  },
  {
    id: "hoodie-navy-mens",
    title: "Navy Pullover Hoodie",
    brand: "Gap",
    size: "L",
    upc: "091200003021",
    imageUrl:
      "https://images.unsplash.com/photo-1578587011724-10d0e6c9c8f8?auto=format&fit=crop&w=500&h=500&q=80",
    category: "clothing",
    keywords: ["hoodie", "hoody", "navy", "blue", "sweatshirt", "pullover", "mens", "men"],
    organic: false,
    basePrice: 39.99,
    unitLabel: "each",
    slug: "gap-navy-hoodie",
  },
  {
    id: "hoodie-white-mens",
    title: "White Classic Hoodie",
    brand: "Hanes",
    size: "XL",
    upc: "091200003022",
    imageUrl:
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=500&h=500&q=80",
    category: "clothing",
    keywords: ["hoodie", "hoody", "white", "sweatshirt", "pullover", "mens", "men"],
    organic: false,
    basePrice: 29.99,
    unitLabel: "each",
    slug: "hanes-white-hoodie",
  },
  {
    id: "basketball",
    title: "Indoor/Outdoor Basketball",
    brand: "Spalding",
    size: "Size 7",
    upc: "091200001345",
    imageUrl:
      "https://images.unsplash.com/photo-1519861539783-7f158cc1118e?w=500&h=500&fit=crop",
    category: "sports",
    keywords: ["basketball", "sports", "ball", "dicks", "athletic"],
    organic: false,
    basePrice: 29.99,
    unitLabel: "each",
    slug: "spalding-basketball",
  },
  {
    id: "yoga-mat",
    title: "Premium Yoga Mat",
    brand: "Gaiam",
    size: "68 in",
    upc: "091200001678",
    imageUrl:
      "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500&h=500&fit=crop",
    category: "sports",
    keywords: ["yoga", "mat", "fitness", "exercise", "sports"],
    organic: false,
    basePrice: 21.99,
    unitLabel: "each",
    slug: "gaiam-yoga-mat",
  },
  {
    id: "mens-dress-shoes",
    title: "Captoe Oxford Dress Shoes",
    brand: "Florsheim",
    size: "Men's 10",
    upc: "091200002010",
    imageUrl:
      "https://images.unsplash.com/photo-1614252239476-9c548a00ca09?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: [
      "dress",
      "dress shoes",
      "formal",
      "oxford",
      "leather",
      "mens",
      "men",
      "business",
      "wedding",
    ],
    organic: false,
    basePrice: 89.99,
    unitLabel: "pair",
    slug: "florsheim-captoe-oxford",
  },
  {
    id: "mens-loafers",
    title: "Penny Loafers",
    brand: "Cole Haan",
    size: "Men's 11",
    upc: "091200002011",
    imageUrl:
      "https://images.unsplash.com/photo-1533860870047-0b2066e7c5b8?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["loafers", "loafer", "casual", "leather", "mens", "men", "dress", "slip-on"],
    organic: false,
    basePrice: 74.99,
    unitLabel: "pair",
    slug: "cole-haan-penny-loafers",
  },
  {
    id: "womens-heels",
    title: "Classic Pump Heels",
    brand: "Naturalizer",
    size: "Women's 7",
    upc: "091200002012",
    imageUrl:
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["heels", "pumps", "dress", "formal", "womens", "women", "leather"],
    organic: false,
    basePrice: 69.99,
    unitLabel: "pair",
    slug: "naturalizer-pump-heels",
  },
  {
    id: "canvas-sneakers",
    title: "Canvas Casual Sneakers",
    brand: "Vans",
    size: "Men's 9",
    upc: "091200002013",
    imageUrl:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b3944a?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["sneakers", "casual", "canvas", "vans", "mens", "skate", "everyday"],
    organic: false,
    basePrice: 49.99,
    unitLabel: "pair",
    slug: "vans-canvas-sneakers",
  },
  {
    id: "kids-sneakers",
    title: "Kids Running Shoes",
    brand: "New Balance",
    size: "Youth 4",
    upc: "091200002001",
    imageUrl:
      "https://images.unsplash.com/photo-1514986887352-96e658430820?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["kids", "children", "shoes", "sneakers", "running"],
    organic: false,
    basePrice: 44.99,
    unitLabel: "pair",
    slug: "new-balance-kids",
  },
  {
    id: "womens-running-shoes",
    title: "Women's Running Shoes",
    brand: "Brooks",
    size: "Size 8",
    upc: "091200002002",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["women", "womens", "running", "shoes", "sneakers", "brooks"],
    organic: false,
    basePrice: 99.99,
    unitLabel: "pair",
    slug: "brooks-womens-running",
  },
  {
    id: "polo-shirt",
    title: "Classic Fit Polo Shirt",
    brand: "Lacoste",
    size: "M",
    upc: "091200002003",
    imageUrl:
      "https://images.unsplash.com/photo-1622445275463-09c4aada2ab0?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["polo", "shirt", "mens", "top", "clothing", "casual"],
    organic: false,
    basePrice: 89.99,
    unitLabel: "each",
    slug: "lacoste-polo-shirt",
  },
  {
    id: "winter-jacket",
    title: "Insulated Winter Jacket",
    brand: "Columbia",
    size: "L",
    upc: "091200002004",
    imageUrl:
      "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["jacket", "coat", "winter", "insulated", "outerwear", "mens"],
    organic: false,
    basePrice: 129.99,
    unitLabel: "each",
    slug: "columbia-winter-jacket",
  },
  {
    id: "summer-dress",
    title: "Floral Midi Dress",
    brand: "Madewell",
    size: "S",
    upc: "091200002005",
    imageUrl:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["dress", "womens", "midi", "floral", "summer", "fashion"],
    organic: false,
    basePrice: 78.99,
    unitLabel: "each",
    slug: "madewell-floral-dress",
  },
  {
    id: "ankle-boots",
    title: "Leather Ankle Boots",
    brand: "Timberland",
    size: "10",
    upc: "091200002006",
    imageUrl:
      "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=500&h=500&fit=crop",
    category: "shoes",
    keywords: ["boots", "ankle", "leather", "mens", "footwear", "timberland"],
    organic: false,
    basePrice: 119.99,
    unitLabel: "pair",
    slug: "timberland-ankle-boots",
  },
  {
    id: "athletic-shorts",
    title: "Training Shorts",
    brand: "Under Armour",
    size: "M",
    upc: "091200002007",
    imageUrl:
      "https://images.unsplash.com/photo-1591195853828-11a67b1e8b2f?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["shorts", "athletic", "training", "gym", "sports", "mens"],
    organic: false,
    basePrice: 34.99,
    unitLabel: "each",
    slug: "under-armour-shorts",
  },
  {
    id: "socks-6pack",
    title: "Athletic Socks 6-Pack",
    brand: "Nike",
    size: "One size",
    upc: "091200002008",
    imageUrl:
      "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: ["socks", "athletic", "nike", "pack", "accessories"],
    organic: false,
    basePrice: 22.99,
    unitLabel: "pack",
    slug: "nike-socks-6pack",
  },
  {
    id: "fiction-novel",
    title: "The Midnight Library",
    brand: "Penguin",
    size: "Hardcover",
    upc: "091300001001",
    imageUrl:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&h=500&fit=crop",
    category: "books",
    keywords: ["book", "fiction", "novel", "bestseller", "hardcover", "reading"],
    organic: false,
    basePrice: 18.99,
    unitLabel: "each",
    slug: "fiction-novel-midnight-library",
  },
  {
    id: "audiobook-credit",
    title: "Bestselling Audiobook",
    brand: "Penguin Audio",
    size: "1 credit",
    upc: "091300001002",
    imageUrl:
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=500&h=500&fit=crop",
    category: "books",
    keywords: ["audiobook", "audible", "listen", "audio", "book"],
    organic: false,
    basePrice: 14.95,
    unitLabel: "credit",
    slug: "audiobook-credit",
  },
  {
    id: "womens-sweater",
    title: "Women's Crewneck Sweater",
    brand: "Gap",
    size: "Women's M",
    upc: "091200003023",
    imageUrl:
      "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&h=500&fit=crop",
    category: "clothing",
    keywords: [
      "sweater",
      "sweaters",
      "cardigan",
      "knit",
      "womens",
      "women",
      "female",
      "clothing",
      "pullover",
    ],
    organic: false,
    basePrice: 49.99,
    unitLabel: "each",
    slug: "gap-womens-sweater",
  },
  {
    id: "queen-bed-frame",
    title: "Queen Platform Bed Frame",
    brand: "IKEA",
    size: "Queen",
    upc: "091300002004",
    imageUrl:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=500&h=500&fit=crop",
    category: "bedding",
    keywords: ["bed", "beds", "bed frame", "frame", "platform", "queen", "furniture", "ikea"],
    organic: false,
    basePrice: 397.99,
    unitLabel: "each",
    slug: "ikea-queen-bed-frame",
  },
  {
    id: "queen-mattress",
    title: "Queen Memory Foam Mattress",
    brand: "Casper",
    size: "Queen",
    upc: "091300002001",
    imageUrl:
      "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=500&h=500&fit=crop",
    category: "bedding",
    keywords: ["mattress", "queen", "memory", "foam", "sleep"],
    organic: false,
    basePrice: 899.99,
    unitLabel: "each",
    slug: "queen-memory-foam-mattress",
  },
  {
    id: "cotton-sheet-set",
    title: "Organic Cotton Sheet Set",
    brand: "Brooklinen",
    size: "Queen",
    upc: "091300002002",
    imageUrl:
      "https://images.unsplash.com/photo-1631889993959-41b4e9c6e3c5?w=500&h=500&fit=crop",
    category: "bedding",
    keywords: ["sheets", "bedding", "cotton", "linen", "queen", "organic"],
    organic: true,
    basePrice: 149.99,
    unitLabel: "set",
    slug: "cotton-sheet-set-queen",
  },
  {
    id: "down-comforter",
    title: "All-Season Down Comforter",
    brand: "Parachute",
    size: "Queen",
    upc: "091300002003",
    imageUrl:
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=500&h=500&fit=crop",
    category: "bedding",
    keywords: ["comforter", "duvet", "bedding", "down", "blanket", "queen"],
    organic: false,
    basePrice: 279.99,
    unitLabel: "each",
    slug: "down-comforter-queen",
  },
  // --- Grocery expansion (Phase: catalog density) ---
  {
    id: "cola-classic-12",
    title: "Cola Classic Soda",
    brand: "Coca-Cola",
    size: "12 pk",
    upc: "049000004911",
    imageUrl:
      "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["soda", "cola", "coke", "coca-cola", "drink", "beverage"],
    organic: false,
    basePrice: 7.98,
    unitLabel: "pk",
    slug: "coca-cola-12pk",
  },
  {
    id: "pepsi-12pk",
    title: "Cola Soda",
    brand: "Pepsi",
    size: "12 pk",
    upc: "012000161155",
    imageUrl:
      "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["soda", "cola", "pepsi", "drink", "beverage"],
    organic: false,
    basePrice: 7.48,
    unitLabel: "pk",
    slug: "pepsi-12pk",
  },
  {
    id: "sparkling-water-12",
    title: "Lime Sparkling Water",
    brand: "LaCroix",
    size: "12 pk",
    upc: "012000003456",
    imageUrl:
      "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["sparkling", "water", "lacroix", "seltzer", "drink"],
    organic: false,
    basePrice: 5.99,
    unitLabel: "pk",
    slug: "lacroix-lime-12pk",
  },
  {
    id: "toilet-paper-12",
    title: "Ultra Soft Toilet Paper",
    brand: "Charmin",
    size: "12 mega rolls",
    upc: "030000000123",
    imageUrl:
      "https://images.unsplash.com/photo-1584556819299-afa27beb7f33?w=500&h=500&fit=crop",
    category: "household",
    keywords: ["toilet", "paper", "charmin", "bathroom", "household"],
    organic: false,
    basePrice: 14.99,
    unitLabel: "roll",
    slug: "charmin-ultra-soft-12",
  },
  {
    id: "frozen-pizza",
    title: "Pepperoni Frozen Pizza",
    brand: "DiGiorno",
    size: "27.5 oz",
    upc: "041900000123",
    imageUrl:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["frozen", "pizza", "pepperoni", "digiorno", "dinner"],
    organic: false,
    basePrice: 6.99,
    unitLabel: "oz",
    slug: "digiorno-pepperoni-pizza",
  },
  {
    id: "frozen-vegetables",
    title: "Mixed Vegetables",
    brand: "Birds Eye",
    size: "14 oz",
    upc: "041900000456",
    imageUrl:
      "https://images.unsplash.com/photo-1459411621453-7b03977f63b5?auto=format&fit=crop&w=500&h=500&q=80",
    category: "produce",
    keywords: ["frozen", "vegetables", "mixed", "birds eye", "veggies"],
    organic: false,
    basePrice: 2.49,
    unitLabel: "oz",
    slug: "birds-eye-mixed-veg",
  },
  {
    id: "granola-bars",
    title: "Chewy Granola Bars",
    brand: "Nature Valley",
    size: "12 ct",
    upc: "041900000789",
    imageUrl:
      "https://images.unsplash.com/photo-1606312619070-d48f4ecc6676?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["granola", "bars", "snack", "nature valley", "oats"],
    organic: false,
    basePrice: 4.49,
    unitLabel: "box",
    slug: "nature-valley-granola-bars",
  },
  {
    id: "peanut-butter",
    title: "Creamy Peanut Butter",
    brand: "Jif",
    size: "16 oz",
    upc: "051500000123",
    imageUrl:
      "https://images.unsplash.com/photo-1599599810769-79489a5c8c46?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["peanut", "butter", "jif", "spread", "snack"],
    organic: false,
    basePrice: 3.49,
    unitLabel: "oz",
    slug: "jif-creamy-peanut-butter",
  },
  {
    id: "mac-cheese",
    title: "Macaroni & Cheese",
    brand: "Kraft",
    size: "7.25 oz",
    upc: "051500000456",
    imageUrl:
      "https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?auto=format&fit=crop&w=500&h=500&q=80",
    category: "pantry",
    keywords: ["mac", "cheese", "kraft", "pasta", "dinner"],
    organic: false,
    basePrice: 1.29,
    unitLabel: "box",
    slug: "kraft-mac-cheese",
  },
];

for (const item of CATALOG) {
  if (!item.imageUrl?.startsWith("https://")) {
    item.imageUrl = imageForProduct(item);
  }
}

const RETAILER_PRICE_MULTIPLIERS: Record<RetailerId, number> = {
  walmart: 0.92,
  target: 0.98,
  kroger: 1.0,
  aldi: 0.84,
  amazon: 1.05,
  ebay: 0.9,
  shopsavvy: 1.0,
  bestbuy: 0.98,
  instacart: 1.14,
  costco: 0.87,
  sams: 0.89,
  publix: 1.02,
  burlington: 0.78,
  dicks: 0.96,
  kohls: 0.9,
  macys: 0.95,
  oldnavy: 0.82,
  ross: 0.72,
  tjmaxx: 0.74,
  footlocker: 0.97,
  zappos: 1.02,
  hm: 0.88,
  nike: 1.0,
  adidas: 0.98,
  newbalance: 1.02,
  underarmour: 0.97,
  asics: 0.96,
  puma: 0.94,
  zara: 0.96,
  uniqlo: 0.9,
  gap: 0.88,
  levis: 0.95,
  ralphlauren: 1.08,
  lululemon: 1.12,
  northface: 1.05,
  skechers: 0.86,
  victoriassecret: 0.98,
  calvinklein: 1.0,
  tommyhilfiger: 0.97,
  coach: 1.15,
  michaelkors: 1.05,
  next: 0.99,
  louisvuitton: 1.35,
  chanel: 1.4,
  hermes: 1.45,
  dior: 1.3,
  gucci: 1.28,
  prada: 1.25,
  burberry: 1.22,
  moncler: 1.35,
  barnesnoble: 0.98,
  indigo: 1.0,
  waterstones: 1.05,
  abebooks: 0.88,
  fnac: 1.02,
  whsmith: 1.03,
  kinokuniya: 1.0,
  booksamillion: 0.95,
  powells: 1.0,
  bookshop: 0.99,
  worldofbooks: 0.82,
  alibris: 0.9,
  betterworldbooks: 0.85,
  halfpricebooks: 0.8,
  dymocks: 1.02,
  strand: 1.0,
  bookoutlet: 0.75,
  wayfair: 0.92,
  mattressfirm: 0.95,
  sleepnumber: 1.15,
  ashley: 0.9,
  brooklinen: 1.08,
  bollbranch: 1.2,
  saatva: 1.18,
  purple: 1.12,
  casper: 1.05,
  nectar: 0.98,
  dreamcloud: 1.0,
  parachute: 1.1,
  cozyearth: 1.15,
  potterybarn: 1.05,
  westelm: 1.05,
  ikea: 0.88,
  quince: 0.92,
  avocado: 1.2,
  helix: 1.0,
  brooklynbedding: 0.95,
  frette: 1.35,
  sferra: 1.3,
  peacockalley: 1.28,
  zinus: 0.82,
  tuftandneedle: 0.98,
  leesa: 1.0,
  buffy: 1.05,
  tempurpedic: 1.25,
  nordstrom: 1.12,
  nordstromrack: 0.88,
  jcrew: 1.05,
  anthropologie: 1.1,
  athleta: 1.06,
  patagonia: 1.14,
  rei: 1.08,
  dillards: 0.96,
  bloomingdales: 1.1,
  childrensplace: 0.82,
  carters: 0.8,
  oshkosh: 0.82,
  shein: 0.72,
  urbanoutfitters: 1.02,
  forever21: 0.78,
  llbean: 1.06,
  columbia: 1.0,
  skims: 1.15,
  albertsons: 1.0,
  safeway: 1.0,
  vons: 1.01,
  jewelosco: 1.0,
  sprouts: 1.06,
  wholefoods: 1.12,
  heb: 0.94,
  meijer: 0.96,
  hyvee: 0.98,
  wegmans: 1.05,
  stopandshop: 1.0,
  giantfood: 1.0,
  weismarkets: 0.99,
  freshdirect: 1.08,
  thrivemarket: 1.04,
  boxed: 0.92,
  shipt: 1.1,
  katespade: 1.12,
  samsonite: 1.05,
  tumi: 1.25,
  longchamp: 1.2,
  marcjacobs: 1.18,
  toryburch: 1.15,
  rimowa: 1.35,
  away: 1.08,
  herschel: 0.98,
  jansport: 0.9,
  fjallraven: 1.12,
  dagnedover: 1.1,
  beis: 1.05,
  verabradley: 0.95,
  mcm: 1.28,
  bottegaveneta: 1.38,
  saintlaurent: 1.35,
  potterybarnkids: 1.1,
  gerber: 0.85,
  buybuybaby: 0.95,
  hannaandersson: 1.12,
  primary: 0.88,
  monicaandandy: 1.05,
  kytebaby: 1.08,
  crateandkids: 1.06,
  littlesleepies: 1.02,
  poshpeanut: 1.0,
  maisonette: 1.1,
  janieandjack: 1.14,
  gymboree: 0.9,
  honest: 1.02,
  burtsbeesbaby: 0.92,
  albeebaby: 0.98,
  marshalls: 0.78,
  basspro: 1.02,
  cabelas: 1.04,
  academy: 0.92,
  sportsmanswarehouse: 0.98,
  scheels: 0.96,
  backcountry: 1.06,
  moosejaw: 1.04,
  evo: 1.05,
  sierra: 0.82,
  big5: 0.88,
  hibbett: 0.94,
  dunhams: 0.9,
  fleetfeet: 1.0,
  orvis: 1.15,
  westmarine: 1.08,
  campingworld: 1.02,
  decathlon: 0.86,
  publiclands: 1.0,
};

const CLOTHING_DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&h=500&fit=crop";
const SHOES_DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop";

function parseSizeForUnit(size: string): number {
  const match = size.match(/([\d.]+)\s*(oz|lb|ct|gal)?/i);
  return match ? parseFloat(match[1]) : 1;
}

function hashJitter(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  const t = (Math.abs(h) % 1000) / 1000;
  return min + t * (max - min);
}

const DEFAULT_GROCERY_IMAGE =
  "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&h=500&fit=crop";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
}

function inferCategoryFromQuery(query: string): CatalogItem["category"] {
  const lower = query.toLowerCase();
  if (/dress\s+shoe|dress\s+shoes|oxford|loafer|sneaker|shoe|boot|sandal|heel/.test(lower))
    return "shoes";
  if (/pretzel|popcorn|cracker|chips|snack/.test(lower)) return "pantry";
  if (/shirt|pants|jeans|joggers?|hoodie|jacket|clothing|polo|leggings|chinos?/.test(lower))
    return "clothing";
  if (/\bdress\b/.test(lower)) return "clothing";
  if (/sport|yoga|basketball|gym/.test(lower)) return "sports";
  if (/audiobook|audible|hardcover|paperback|novel|fiction|nonfiction|textbook|book\b|books\b|reading/.test(lower))
    return "books";
  if (/mattress|pillow|sheets?|comforter|duvet|bedding|memory\s+foam|box\s+spring|\bbeds?\b/.test(lower))
    return "bedding";
  if (/sofa|couch|furniture|lamp|rug|decor|home\s+decor/.test(lower)) return "home";
  if (/salad|greens|lettuce|spinach|arugula|romaine/.test(lower)) return "salad";
  if (/milk|egg|butter|dairy|cheese|yogurt/.test(lower)) return "dairy";
  if (/bread|bagel|bakery|toast/.test(lower)) return "bakery";
  if (/banana|produce|fruit|vegetable|apple|berry/.test(lower)) return "produce";
  if (/chicken|beef|pork|meat|fish|salmon/.test(lower)) return "meat";
  if (/chip|snack|cereal|coffee|pasta|rice|soda|juice/.test(lower)) return "pantry";
  return "general";
}

/**
 * Creates a synthetic placeholder item for demo/compare flows only.
 * NEVER pass synthetic items to the primary search path — they generate fake
 * estimated prices and have no real retailer inventory behind them.
 * Use this only in: compareByUpc, searchSimilarFromLink, and explicit compare flows.
 */
export function createSyntheticCatalogItem(
  query: string,
  categoryOverride?: CatalogItem["category"],
  priceOverride?: number,
): CatalogItem {
  const clean = query.trim() || "Product";
  const slug = slugify(clean);
  const category = categoryOverride ?? inferCategoryFromQuery(clean);
  const attrs = parseQueryAttributes(clean);
  const extraKw: string[] = [];
  if (attrs.gender) extraKw.push(attrs.gender, attrs.gender === "mens" ? "men" : "women");
  if (attrs.ageGroup) extraKw.push(attrs.ageGroup, attrs.ageGroup === "toddler" ? "baby" : "kids");
  if (attrs.productTypes.includes("joggers") || attrs.productTypes.includes("jogger")) {
    extraKw.push("joggers", "jogger", "sweatpants");
  }
  if (attrs.productTypes.some((t) => /sweater|cardigan|knit/.test(t))) {
    extraKw.push("sweater", "sweaters", "cardigan", "knit");
  }
  const base =
    priceOverride ??
    (category === "shoes"
      ? 69.99
      : category === "clothing"
        ? 39.99
        : category === "books"
          ? 16.99
          : category === "bedding"
            ? /\bmattress\b/i.test(clean)
              ? 799.99
              : /\bbeds?\b|bed frame/i.test(clean)
                ? 349.99
                : 149.99
            : category === "home"
              ? 199.99
              : 4.99 + (slug.length % 5) * 1.1);
  const draft = {
    id: `syn-${slug}`,
    title: formatSearchProductTitle(clean),
    brand: "Various brands",
    size: "",
    upc: `syn-${slug}`,
    imageUrl: "",
    category,
    keywords: [...tokenizeQuery(clean), ...extraKw, ...attrs.productTypes],
    organic: /organic/i.test(clean),
    basePrice: Math.round(base * 100) / 100,
    unitLabel: "each" as const,
    slug: `syn-${slug}`,
  };
  draft.imageUrl = imageForProduct(draft, clean);
  return draft;
}

function extractBrandFromTitle(title: string): string {
  const known = [
    "SuperPretzel",
    "Super Pretzel",
    "Nike",
    "Adidas",
    "New Balance",
    "Under Armour",
    "ASICS",
    "Puma",
    "Lay's",
  ];
  for (const b of known) {
    if (title.toLowerCase().includes(b.toLowerCase())) return b.replace("Super Pretzel", "SuperPretzel");
  }
  const first = title.split(/\s+/)[0];
  if (first && first.length > 2 && !isGenericBrandToken(first)) return first;
  return "Various brands";
}

const GENERIC_MATCH_WORDS = new Set([
  "fresh",
  "produce",
  "organic",
  "natural",
  "classic",
  "original",
  "super",
  "great",
  "value",
  "brand",
  "pack",
  "size",
  "count",
  "each",
  "new",
  "the",
  "soft",
  "stuffed",
]);

function significantTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERIC_MATCH_WORDS.has(t));
}

export function findCatalogMatchByTitle(title: string): CatalogItem | undefined {
  const tokens = significantTokens(title);
  if (tokens.length === 0) return undefined;

  let best: CatalogItem | undefined;
  let bestScore = 0;

  for (const item of CATALOG) {
    const blob = `${item.title} ${item.brand} ${item.keywords.join(" ")}`.toLowerCase();
    let score = 0;
    let distinctive = 0;
    for (const t of tokens) {
      if (blob.includes(t)) {
        score += 1;
        distinctive += 1;
      }
    }
    if (distinctive === 0) continue;
    if (score > bestScore && distinctive >= 1) {
      bestScore = score;
      best = item;
    }
  }

  if (!best) return undefined;
  const required = Math.min(3, Math.max(2, Math.ceil(tokens.length * 0.45)));
  return bestScore >= required ? best : undefined;
}

/** Link paste: anchor on the parsed product title — never fuzzy-match catalog SKUs. */
function findSimilarItemsForLink(
  query: string,
  category: CatalogItem["category"] | undefined,
  referencePrice: number,
  catalogId?: string,
): CatalogItem[] {
  const resolvedCategory =
    category ?? inferCategoryFromQuery(query) ?? ("general" as const);

  const anchor =
    catalogId ?
      (CATALOG.find((c) => c.id === catalogId) ??
        createSyntheticCatalogItem(query, resolvedCategory, referencePrice))
    : createSyntheticCatalogItem(query, resolvedCategory, referencePrice);

  const attrs = parseQueryAttributes(query);
  const sameCategory = CATALOG.filter(
    (item) => item.id !== anchor.id && item.category === resolvedCategory,
  );
  const similar = rankSimilarCatalogItems(
    anchor.id,
    query,
    sameCategory,
    { query, category: resolvedCategory, ...attrs },
    MAX_PRODUCTS_PER_SEARCH - 1,
    attrs.productTypes.length > 0 ? 22 : 14,
  );

  if (similar.length === 0 && resolvedCategory === "pantry") {
    const snacks = CATALOG.filter(
      (c) =>
        c.id !== anchor.id &&
        c.category === "pantry" &&
        c.keywords.some((k) => /pretzel|chip|popcorn|cracker|snack/.test(k)),
    ).slice(0, MAX_PRODUCTS_PER_SEARCH - 1);
    return [anchor, ...snacks];
  }

  return [anchor, ...similar];
}

function effectiveCategoryForSearch(
  item: CatalogItem,
  intent: ShoppingIntent,
): CatalogItem["category"] {
  if (
    (intent.ageGroup === "toddler" || intent.ageGroup === "kids") &&
    (item.category === "general" ||
      item.category === "books" ||
      !/\b(book|novel)\b/i.test(intent.query))
  ) {
    if (intent.category === "shoes" || /\b(shoe|sneaker|boot)\b/i.test(intent.query)) {
      return "shoes";
    }
    return "clothing";
  }
  return item.category;
}

function filterRetailersForItem(
  item: CatalogItem,
  retailers: RetailerId[],
  intent: ShoppingIntent,
): RetailerId[] {
  const category = effectiveCategoryForSearch(item, intent);
  return retailers.filter((r) => retailerSellsCategory(r, category));
}

function annotateCheaperOffers(
  offers: ProductOffer[],
  referencePrice: number,
): ProductOffer[] {
  return offers.map((o) => {
    if (o.price < referencePrice - 0.01) {
      const save = Math.round(((referencePrice - o.price) / referencePrice) * 100);
      o.priceNote = `Save ${save}% vs link`;
    }
    return o;
  });
}

const MAX_PRODUCTS_PER_SEARCH = 5;
const MAX_OFFERS_PER_ROW = 15;

/** Pick the single best-matching product for this search (avoids mixing hoodies + pants, etc.) */
function pickPrimaryCatalogItem(intent: ShoppingIntent): CatalogItem {
  const q = intent.query.trim();
  if (!q) return CATALOG[0];

  const strict = queryRequiresStrictMatch(q);
  const categoryStrict = queryRequiresCategoryMatch(q, intent.category);
  const minScore = strict || categoryStrict ? 18 : 10;
  const attrs = parseQueryAttributes(q);

  const scored = CATALOG.map((raw) => {
    const { item } = resolveCatalogRow(raw, intent);
    return {
      item,
      score: scoreItem(item, intent),
    };
  })
    .filter(({ item, score }) => {
      if (categoryStrict && intent.category && item.category !== intent.category) {
        return false;
      }
      return score >= minScore;
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    let top = scored[0];
    if (
      strict &&
      attrs.productTypes.length > 0 &&
      top.score < minScore + 5 &&
      scored.length > 1
    ) {
      const typed = scored.filter((s) =>
        attrs.productTypes.some(
          (t) =>
            s.item.title.toLowerCase().includes(t) ||
            s.item.keywords.some((k) => k.includes(t)),
        ),
      );
      if (typed[0]) top = typed[0];
    }
    return top.item;
  }

  return createSyntheticCatalogItemForIntent(intent);
}

export function createSyntheticCatalogItemForIntent(intent: ShoppingIntent): CatalogItem {
  const q = buildFullSearchQuery(intent) || intent.query.trim() || "Product";
  const item = createSyntheticCatalogItem(
    q,
    intent.category as CatalogItem["category"] | undefined,
  );
  if (intent.brand) item.brand = intent.brand;
  if (intent.colors?.length) {
    item.keywords = [...new Set([...item.keywords, ...intent.colors])];
    item.title = `${intent.colors[0]!} ${item.title}`.replace(/\s+/g, " ").trim();
    item.imageUrl = imageForProduct(item, q);
  }
  if (intent.size) {
    const label = intent.size.match(/^\d{2}x\d{2}$/i)
      ? intent.size
      : intent.gender === "womens"
        ? `Women's ${intent.size}`
        : intent.gender === "mens"
          ? `Men's ${intent.size}`
          : `Size ${intent.size}`;
    item.size = label;
    item.keywords = [...new Set([...item.keywords, intent.size.toLowerCase()])];
  }
  return item;
}

function buildOffer(
  item: CatalogItem,
  retailer: RetailerId,
  intent: ShoppingIntent,
  channel: ShoppingChannel,
): ProductOffer {
  const mult = RETAILER_PRICE_MULTIPLIERS[retailer];
  const jitter = hashJitter(`${item.id}-${retailer}`, -0.06, 0.06);
  const price = Math.round(item.basePrice * mult * (1 + jitter) * 100) / 100;
  const wasPrice =
    price < item.basePrice
      ? item.basePrice
      : Math.round(price * (1 + hashJitter(item.id + retailer + "was", 0.05, 0.18)) * 100) / 100;
  const savingsPercent =
    wasPrice > price ? Math.round(((wasPrice - price) / wasPrice) * 100) : undefined;
  const sizeNum = parseSizeForUnit(item.size);
  const unitPrice = Math.round((price / sizeNum) * 100) / 100;
  const searchQ = buildFullSearchQuery(intent);
  const listing = getRetailerListing(item, retailer, channel, searchQ, intent);
  const landedCost = price;
  const meta = getRetailerMeta(retailer);
  const { productUrl, affiliateUrl } = buildOfferClickUrl(
    retailer,
    item,
    intent,
  );

  const confidence = scoreOfferConfidence(item, intent, retailer, {
    storeTitle: listing.storeTitle,
    brand: item.brand,
    color: intent.colors?.[0],
    size: item.size,
    upc: item.upc,
    imageUrl: listing.imageUrl,
    productUrl,
    priceSource: "catalog_model",
  });

  return applyOfferQualityGates(
    {
    id: `${item.id}-${retailer}-${channel}`,
    catalogId: item.id,
    title: item.title,
    storeTitle: listing.storeTitle,
    brand: item.brand,
    size: item.size,
    upc: item.upc,
    imageUrl: listing.imageUrl,
    imageSource: classifyProductImageSource(listing.imageUrl, retailer),
    retailer,
    retailerName: meta.name,
    price,
    wasPrice: savingsPercent ? wasPrice : undefined,
    savingsPercent,
    unitPrice,
    unitLabel: item.unitLabel,
    inStock: hashJitter(item.id + retailer + "stock", 0, 1) > 0.04,
    pickupAvailable: channel === "local",
    deliveryFee: undefined,
    landedCost,
    productUrl,
    affiliateUrl,
    matchConfidence: confidence.matchConfidence,
    identityConfidence: confidence.identityConfidence,
    attributeConfidence: confidence.attributeConfidence,
    imageConfidence: confidence.imageConfidence,
    confidenceReasons: JSON.parse(confidence.confidenceReasonsJson) as ProductOffer["confidenceReasons"],
    channel,
    priceSource: "catalog_model",
    priceNote:
      channel === "online"
        ? "Estimated · ships to your door"
        : retailer === "costco" || retailer === "sams"
          ? "Estimated · pickup near you · Members"
          : "Estimated · pickup or delivery near you",
    },
    item,
    intent,
  );
}

function markBestDeal(offers: ProductOffer[]) {
  offers.sort((a, b) => a.landedCost - b.landedCost);
  offers.forEach((o, i) => {
    o.isBestDeal = i === 0;
  });
  return offers;
}

function applyRetailerAllowList(
  retailers: RetailerId[],
  allow?: RetailerId[],
): RetailerId[] {
  if (!allow?.length) return retailers;
  const set = new Set(allow);
  return retailers.filter((r) => set.has(r));
}

export interface CatalogCompareOptions {
  /** Nightly job: only price these stores tonight (weekly rotation). */
  retailers?: RetailerId[];
}

/** Same product — online shippable offers only */
export function compareProduct(
  item: CatalogItem,
  intent: ShoppingIntent,
  options: CatalogCompareOptions = {},
): ProductSearchResults {
  const { item: resolvedItem } = resolveCatalogRow(item, intent);
  const zip = intent.zipCode ?? "78701";
  const allow = options.retailers;

  const onlineRetailers = applyRetailerAllowList(
    getOnlineRetailersForZip(zip),
    allow,
  );

  const online = markBestDeal(
    filterRetailersForItem(resolvedItem, onlineRetailers, intent).map((r) =>
      buildOffer(resolvedItem, r, intent, "online"),
    ),
  );

  return { local: [], online, zipCode: zip, compareMode: true };
}

export function compareByUpc(
  upc: string,
  intent: ShoppingIntent,
): ProductSearchResults {
  const catalogItem = CATALOG.find((c) => c.upc === upc);
  if (catalogItem) return compareProduct(catalogItem, intent);
  return compareProduct(
    createSyntheticCatalogItem(intent.query || "Product"),
    intent,
  );
}

/** Search — one exact product priced at every eligible store (cheapest first).
 *  Returns empty results if no real catalog item matches (no synthetic fallback). */
export function searchCatalog(intent: ShoppingIntent): ProductSearchResults {
  const zip = intent.zipCode ?? "78701";
  const item = pickPrimaryCatalogItem(intent);

  // Synthetic items have no real inventory — return empty so the DB connector
  // or live APIs can serve real results instead of fake "Estimated" prices.
  if (item.id.startsWith("syn-")) {
    return { local: [], online: [], zipCode: zip, compareMode: false };
  }

  const onlineRetailers = getOnlineRetailersForZip(zip);

  const online = markBestDeal(
    filterRetailersForItem(item, onlineRetailers, intent)
      .map((r) => buildOffer(item, r, intent, "online"))
      .filter((o) => !intent.maxPrice || o.price <= intent.maxPrice),
  );

  return {
    local: [],
    online: online.slice(0, MAX_OFFERS_PER_ROW),
    zipCode: zip,
    compareMode: false,
  };
}

/** From a pasted product link — find similar items, sorted by savings */
export function searchSimilarFromLink(
  parsed: {
    guessedTitle: string;
    category?: string;
    referencePrice: number;
    sourceUrl: string;
    sourceRetailer?: RetailerId;
    catalogId?: string;
  },
  intent: ShoppingIntent,
): ProductSearchResults {
  const zip = intent.zipCode ?? "78701";
  const searchIntent: ShoppingIntent = {
    ...intent,
    query: parsed.guessedTitle,
    category: parsed.category ?? intent.category,
    gender: parseQueryAttributes(parsed.guessedTitle).gender ?? intent.gender,
    ageGroup: parseQueryAttributes(parsed.guessedTitle).ageGroup ?? intent.ageGroup,
    zipCode: zip,
  };

  const items = findSimilarItemsForLink(
    parsed.guessedTitle,
    (parsed.category as CatalogItem["category"]) ?? undefined,
    parsed.referencePrice,
    parsed.catalogId,
  );
  const onlineRetailers = getOnlineRetailersForZip(zip);

  const online: ProductOffer[] = [];

  for (const item of items) {
    for (const r of filterRetailersForItem(item, onlineRetailers, intent)) {
      online.push(buildOffer(item, r, searchIntent, "online"));
    }
  }

  const pricedOnline = annotateCheaperOffers(online, parsed.referencePrice);

  markBestDeal(pricedOnline);

  const referenceProduct: ReferenceProduct = {
    title: parsed.guessedTitle,
    sourceUrl: parsed.sourceUrl,
    sourceRetailer: parsed.sourceRetailer,
    referencePrice: parsed.referencePrice,
  };

  return {
    local: [],
    online: pricedOnline.slice(0, MAX_OFFERS_PER_ROW),
    zipCode: zip,
    compareMode: false,
    similarMode: true,
    referenceProduct,
  };
}

export function getStoresNearZip(zip: string): string[] {
  return getLocalRetailersForZip(zip).map(
    (id) => getRetailerMeta(id).shortName,
  );
}

export function getCatalogItemByUpc(upc: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.upc === upc);
}

export function getPopularCategories() {
  return [
    { id: "pantry", label: "Pantry & snacks", emoji: "🥣", query: "honey nut cereal" },
    { id: "dairy", label: "Dairy & eggs", emoji: "🥛", query: "whole milk" },
    { id: "household", label: "Household", emoji: "🧻", query: "paper towels" },
    { id: "salad", label: "Salad & greens", emoji: "🥗", query: "organic spinach" },
    { id: "meat", label: "Meat & protein", emoji: "🍗", query: "chicken breast" },
    { id: "clothing", label: "Clothing (beta)", emoji: "👕", query: "mens hoodie" },
  ];
}

export { CATALOG };
