/**
 * Broad shopping phrases that need a follow-up before we search.
 * Matched before AI when possible; AI can refine the question and options.
 */

export interface BroadKeywordRule {
  id: string;
  category?: string;
  /** Fires when any pattern matches and specifics do not */
  patterns: RegExp[];
  specifics: RegExp;
  defaultQuestion: string;
  defaultOptions: string[];
}

export const BROAD_SHOPPING_KEYWORD_RULES: BroadKeywordRule[] = [
  {
    id: "salad",
    category: "salad",
    patterns: [
      /\b(salad|salads)\b/i,
      /\b(salad|greens?)\s+bunch(?:es)?\b/i,
      /\bgreens?\s+bunch(?:es)?\b/i,
      /\blettuce\s+bunch(?:es)?\b/i,
    ],
    specifics:
      /\b(caesar|romaine|spring\s+mix|arugula|spinach|kale|kit|bowl|coleslaw|greek\s+salad|bagged|hearts|organic\s+girl|dole)\b/i,
    defaultQuestion: "What kind of salad are you looking for?",
    defaultOptions: [
      "Bagged salad greens",
      "Romaine hearts",
      "Spring mix",
      "Caesar salad kit",
      "Arugula",
      "Pre-made salad bowl",
    ],
  },
  {
    id: "milk",
    category: "dairy",
    patterns: [/\b(milk|dairy)\b/i],
    specifics: /\b(whole|skim|2%|1%|oat|almond|soy|organic|lactose)\b/i,
    defaultQuestion: "What kind of milk do you need?",
    defaultOptions: ["Whole milk", "2% milk", "Skim milk", "Oat milk", "Organic milk"],
  },
  {
    id: "eggs",
    category: "dairy",
    patterns: [/\b(eggs?|egg\s+carton)\b/i],
    specifics: /\b(organic|cage.?free|free.?range|large|extra.?large|brown|dozen)\b/i,
    defaultQuestion: "What kind of eggs are you looking for?",
    defaultOptions: ["Large eggs", "Organic eggs", "Cage-free eggs", "Brown eggs"],
  },
  {
    id: "bread",
    category: "bakery",
    patterns: [/\b(bread|bagels?|bakery|toast|buns?|rolls?)\b/i],
    specifics: /\b(sourdough|whole\s+wheat|white|rye|multigrain|gluten.?free)\b/i,
    defaultQuestion: "What kind of bread or bakery item do you want?",
    defaultOptions: ["Whole wheat bread", "White bread", "Sourdough", "Bagels", "Buns"],
  },
  {
    id: "produce",
    category: "produce",
    patterns: [/\b(produce|fruits?|vegetables?|veggies)\b/i],
    specifics:
      /\b(apple|banana|berry|avocado|tomato|potato|onion|carrot|broccoli|strawberr|blueberr)\b/i,
    defaultQuestion: "What produce are you shopping for?",
    defaultOptions: ["Bananas", "Apples", "Berries", "Avocados", "Tomatoes", "Potatoes"],
  },
  {
    id: "meat",
    category: "meat",
    patterns: [/\b(chicken|beef|pork|steak|meat|fish|salmon|turkey|bacon)\b/i],
    specifics: /\b(breast|thigh|ground|organic|boneless|fillet|wild|smoked)\b/i,
    defaultQuestion: "What kind of meat or protein are you looking for?",
    defaultOptions: [
      "Chicken breast",
      "Ground beef",
      "Salmon fillet",
      "Pork chops",
      "Bacon",
    ],
  },
  {
    id: "snacks",
    category: "pantry",
    patterns: [/\b(snacks?|chips?|cereal|coffee|pasta|rice|soda|juice)\b/i],
    specifics: /\b(pretzel|popcorn|cracker|spaghetti|k.?cup|cola|sparkling)\b/i,
    defaultQuestion: "What pantry item are you looking for?",
    defaultOptions: ["Potato chips", "Pretzels", "Coffee", "Cereal", "Pasta"],
  },
  {
    id: "pants",
    category: "clothing",
    patterns: [/\b(pants|trousers|slacks)\b/i],
    specifics:
      /\b(jeans|denim|chinos?|joggers?|khakis|cargo|sweatpants?|dress\s+pants|track\s+pants)\b/i,
    defaultQuestion: "What kind of pants are you looking for?",
    defaultOptions: ["Jeans", "Chinos", "Joggers", "Dress pants", "Cargo pants", "Sweatpants"],
  },
  {
    id: "shoes",
    category: "shoes",
    patterns: [/\b(shoes?|footwear|sneakers?)\b/i],
    specifics:
      /\b(running|dress\s+shoe|oxford|loafer|boots?|sandals?|basketball|trainer|cleats?)\b/i,
    defaultQuestion: "What type of shoes are you shopping for?",
    defaultOptions: [
      "Running shoes",
      "Casual sneakers",
      "Dress shoes",
      "Boots",
      "Sandals",
    ],
  },
  {
    id: "hoodie",
    category: "clothing",
    patterns: [/\b(hoodies?|hoody|sweatshirts?|pullover)\b/i],
    specifics: /\b(zip|fleece|graphic|oversized|kids|toddler|mens|womens|black|navy)\b/i,
    defaultQuestion: "What kind of hoodie are you looking for?",
    defaultOptions: [
      "Mens pullover hoodie",
      "Womens pullover hoodie",
      "Zip-up hoodie",
      "Kids hoodie",
    ],
  },
  {
    id: "toddler",
    category: "clothing",
    patterns: [
      /\b(toddlers?|toddler\s+stuff|baby\s+clothes?)\b/i,
      /\b(2t|3t|4t|5t|12m|18m|24m)\b/i,
    ],
    specifics:
      /\b(onesie|romper|hoodie|shoes?|sneaker|pants|dress|jacket|carters|oshkosh|bodysuit)\b/i,
    defaultQuestion: "What are you shopping for your toddler?",
    defaultOptions: [
      "Toddler hoodie",
      "Toddler shoes",
      "Onesies",
      "Toddler pants",
      "Winter jacket",
    ],
  },
  {
    id: "kids_clothing",
    category: "clothing",
    patterns: [
      /\b(kids?|children'?s?|toddler|baby|boys?|girls?)\b.*\b(pants|shirt|dress|onesie|romper)\b/i,
      /\b(pants|shirt|dress|onesie|romper)\b.*\b(kids?|children|toddler|baby|boys?|girls?)\b/i,
    ],
    specifics: /\b(jeans|chinos?|hoodie|onesie|romper|dress\s+shoe|size\s+\d|2t|3t|4t)\b/i,
    defaultQuestion: "What kids' item are you shopping for?",
    defaultOptions: ["Kids jeans", "Kids hoodie", "Toddler onesies", "Girls dress", "Boys pants"],
  },
];

export function findBroadKeywordRule(text: string): BroadKeywordRule | undefined {
  const lower = text.toLowerCase();
  for (const rule of BROAD_SHOPPING_KEYWORD_RULES) {
    if (rule.specifics.test(lower)) continue;
    if (rule.patterns.some((p) => p.test(lower))) return rule;
  }
  return undefined;
}
