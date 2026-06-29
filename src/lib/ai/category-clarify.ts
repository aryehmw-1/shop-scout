import type { ClarificationState, ShoppingIntent } from "../types";

export type CategoryClarifyKind =
  | "salad"
  | "dairy"
  | "bakery"
  | "produce"
  | "meat"
  | "pantry"
  | "shoes"
  | "pants"
  | "outerwear"
  | "hoodie"
  | "kids_clothing"
  | "household";

export interface CategoryClarifyRule {
  kind: CategoryClarifyKind;
  category: ShoppingIntent["category"];
  triggers: RegExp;
  /** When matched, the query is specific enough to search without asking */
  specifics: RegExp;
  question: string;
  options: string[];
}

export const CATEGORY_CLARIFY_RULES: CategoryClarifyRule[] = [
  {
    kind: "salad",
    category: "salad",
    triggers: /\b(salad|salads|salad\s+bunch(?:es)?|greens?\s+bunch(?:es)?)\b/i,
    specifics:
      /\b(caesar|romaine|spring\s+mix|arugula|spinach|kale|lettuce|kit|bowl|coleslaw|greek\s+salad|bagged|hearts)\b/i,
    question: "What kind of salad are you looking for?",
    options: [
      "Bagged salad greens",
      "Romaine hearts",
      "Spring mix",
      "Caesar salad kit",
      "Arugula",
      "Pre-made salad bowl",
    ],
  },
  {
    kind: "dairy",
    category: "dairy",
    triggers: /\b(milk|dairy|yogurt|cheese|butter)\b/i,
    specifics:
      /\b(whole|skim|2%|1%|oat|almond|soy|organic|greek|cheddar|mozzarella|shredded|stick|unsalted|salted)\b/i,
    question: "What kind of dairy product do you need?",
    options: [
      "Whole milk",
      "2% milk",
      "Oat milk",
      "Greek yogurt",
      "Shredded cheese",
      "Butter",
    ],
  },
  {
    kind: "dairy",
    category: "dairy",
    triggers: /\b(eggs?)\b/i,
    specifics: /\b(organic|cage.?free|free.?range|large|extra.?large|brown|white|dozen)\b/i,
    question: "What kind of eggs are you looking for?",
    options: [
      "Large eggs",
      "Organic eggs",
      "Cage-free eggs",
      "Free-range eggs",
      "Brown eggs",
    ],
  },
  {
    kind: "bakery",
    category: "bakery",
    triggers: /\b(bread|bagel|bakery|toast|bun|rolls?)\b/i,
    specifics:
      /\b(sourdough|whole\s+wheat|white|rye|multigrain|bagel|brioche|ciabatta|gluten.?free|organic)\b/i,
    question: "What kind of bread or bakery item do you want?",
    options: [
      "Whole wheat bread",
      "White bread",
      "Sourdough",
      "Bagels",
      "Hamburger buns",
      "Gluten-free bread",
    ],
  },
  {
    kind: "produce",
    category: "produce",
    triggers: /\b(produce|fruit|fruits|vegetable|vegetables)\b/i,
    specifics:
      /\b(apple|banana|berry|strawberr|blueberr|grape|orange|lemon|lime|avocado|tomato|potato|onion|carrot|broccoli|lettuce)\b/i,
    question: "What produce are you shopping for?",
    options: [
      "Bananas",
      "Apples",
      "Berries",
      "Avocados",
      "Tomatoes",
      "Potatoes",
    ],
  },
  {
    kind: "meat",
    category: "meat",
    triggers: /\b(chicken|beef|pork|steak|meat|fish|salmon|turkey|bacon|sausage)\b/i,
    specifics:
      /\b(breast|thigh|ground|organic|boneless|skinless|fillet|wild|smoked|thick.?cut|lean)\b/i,
    question: "What kind of meat or protein are you looking for?",
    options: [
      "Chicken breast",
      "Ground beef",
      "Salmon fillet",
      "Pork chops",
      "Bacon",
      "Deli turkey",
    ],
  },
  {
    kind: "pantry",
    category: "pantry",
    triggers: /\b(snacks?|chips?|cereal|coffee|pasta|rice|soda|juice|pantry)\b/i,
    specifics:
      /\b(pretzel|popcorn|cracker|tortilla|potato|pita|oatmeal|ground|k.?cup|pods|spaghetti|penne|cola|sparkling)\b/i,
    question: "What pantry item are you looking for?",
    options: [
      "Potato chips",
      "Pretzels",
      "Coffee",
      "Breakfast cereal",
      "Pasta",
      "Sparkling water",
    ],
  },
];

/**
 * Broad HOUSEHOLD-staple categories. Unlike grocery/apparel clarify (which picks
 * a subtype), these ask up front how the shopper wants to narrow a commodity
 * category — cheapest, a brand, a size/count, or a bulk pack — and are marked
 * `askFirst` so the assistant asks BEFORE guessing (the catalog always has some
 * paper towels, so we'd otherwise never ask). The `specifics` regex lets an
 * already-detailed query ("cheapest paper towels", "Bounty", "13 gallon",
 * "12 rolls", "tide pods") skip the question and search immediately.
 */
const HOUSEHOLD_BRANDS =
  /\b(bounty|brawny|sparkle|viva|scott|charmin|cottonelle|angel\s*soft|kirkland|tide|gain|persil|arm\s*&?\s*hammer|purex|all\b|seventh\s*generation|method|dawn|palmolive|ajax|mrs\.?\s*meyer'?s?|dapple|dreft|glad|hefty|great\s*value)\b/i;
const HOUSEHOLD_DETAIL =
  /\b(cheapest|cheap|best|lowest|value|strongest|most\s+absorbent|premium|bulk|pods?|liquid|powder|drawstring|scented|unscented|fragrance.?free|free\s*&?\s*clear|mega\s*rolls?|double\s*rolls?|select.?a.?size|2.?ply|ultra|\d+\s*(ct|count|rolls?|gal(?:lon)?s?|pack|pk|loads?|fl\.?\s*oz|oz|sheets?))\b/i;

export const HOUSEHOLD_CLARIFY_RULES: CategoryClarifyRule[] = [
  {
    kind: "household",
    category: "household",
    triggers: /\bpaper\s+towels?\b/i,
    specifics: new RegExp(`${HOUSEHOLD_BRANDS.source}|${HOUSEHOLD_DETAIL.source}`, "i"),
    question:
      "What kind of paper towels are you looking for — cheapest, strongest, a specific brand, roll count, or a bulk pack?",
    options: ["Cheapest", "Strongest", "Bounty", "Sparkle", "Select-a-size", "Bulk pack"],
  },
  {
    // Dish soap BEFORE laundry so "dish detergent" / "dishwasher detergent" match
    // here rather than the bare `\bdetergent\b` laundry trigger below.
    kind: "household",
    category: "household",
    triggers: /\b(dish\s+soap|dishwashing|dish\s+detergent|dishwasher\s+detergent|dish\s+liquid)\b/i,
    specifics: new RegExp(`${HOUSEHOLD_BRANDS.source}|${HOUSEHOLD_DETAIL.source}`, "i"),
    question:
      "What kind of dish soap — cheapest, a specific brand, or fragrance-free?",
    options: ["Cheapest", "Dawn", "Palmolive", "Dishwasher pods", "Fragrance free"],
  },
  {
    kind: "household",
    category: "household",
    triggers: /\b(laundry\s+detergent|laundry\s+soap|detergent)\b/i,
    specifics: new RegExp(`${HOUSEHOLD_BRANDS.source}|${HOUSEHOLD_DETAIL.source}`, "i"),
    question:
      "What kind of laundry detergent — cheapest, pods or liquid, a specific brand, or scent-free?",
    options: ["Cheapest", "Tide", "Gain", "Liquid", "Pods", "Free & clear"],
  },
  {
    kind: "household",
    category: "household",
    triggers: /\b(trash\s+bags?|garbage\s+bags?)\b/i,
    specifics: new RegExp(`${HOUSEHOLD_BRANDS.source}|${HOUSEHOLD_DETAIL.source}`, "i"),
    question:
      "What kind of trash bags — what size (gallons), a specific brand, or a bulk pack?",
    options: ["Cheapest", "13 gallon", "30 gallon", "Glad", "Hefty", "Drawstring"],
  },
  {
    kind: "household",
    category: "household",
    triggers: /\b(toilet\s+paper|bath\s+tissue)\b/i,
    specifics: new RegExp(`${HOUSEHOLD_BRANDS.source}|${HOUSEHOLD_DETAIL.source}`, "i"),
    question:
      "What kind of toilet paper — cheapest, a specific brand, or a bulk pack?",
    options: ["Cheapest", "Charmin", "Cottonelle", "Scott", "Mega rolls", "Bulk pack"],
  },
];

/** Broad household-category clarification, or undefined when the query already
 *  carries enough detail (brand / size / count / "cheapest" / pods etc.). */
export function detectHouseholdClarification(
  query: string,
  intent: Partial<ShoppingIntent>,
): ClarificationState | undefined {
  const lower = query.toLowerCase();
  for (const rule of HOUSEHOLD_CLARIFY_RULES) {
    if (rule.triggers.test(lower) && !rule.specifics.test(lower)) {
      return { ...categoryClarificationFromRule(rule, query, intent), askFirst: true };
    }
  }
  return undefined;
}

export function findCategoryClarifyRule(
  query: string,
): CategoryClarifyRule | undefined {
  const lower = query.toLowerCase();
  for (const rule of CATEGORY_CLARIFY_RULES) {
    if (rule.triggers.test(lower) && !rule.specifics.test(lower)) {
      return rule;
    }
  }
  return undefined;
}

export function categoryClarificationFromRule(
  rule: CategoryClarifyRule,
  query: string,
  intent: Partial<ShoppingIntent>,
): ClarificationState {
  return {
    kind: rule.kind,
    question: rule.question,
    options: [...rule.options],
    baseQuery: query,
    baseIntent: {
      ...intent,
      category: rule.category ?? intent.category,
    },
  };
}

export function clarifyHelpReply(clarifying: ClarificationState): string {
  const list = clarifying.options.map((o) => `**${o}**`).join(", ");
  return `${clarifying.question}\n\nYou can pick one below, or type something like ${list}. I'll compare prices once I know what you're after.`;
}
