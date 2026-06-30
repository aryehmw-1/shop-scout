import "server-only";

import { findCatalogEstimateMatches } from "../inventory/inventory-service";
import type { ShoppingPlan, ShoppingPlanGroup } from "../types";

/**
 * AI Shopping Planner (P5). Decomposes a natural request — "cleaning supplies for
 * a family of 5", "I'm moving into a dorm", "bathroom restock" — into a grouped
 * shopping list, and fills each category with products we ALREADY have in the
 * catalog (no imports, no live fetch — honest about coverage). It's a conversation
 * feature, not a catalog-expansion feature: thin categories are reported plainly.
 */

interface PlannerTemplate {
  /** Title shown to the user. */
  title: string;
  /** Triggers (whole-phrase, case-insensitive) that select this template. */
  triggers: RegExp;
  /** Ordered categories → the search query used to pull catalog products. */
  categories: { label: string; query: string }[];
}

// Curated scenarios. Each category query is a plain term the catalog understands.
const TEMPLATES: PlannerTemplate[] = [
  {
    title: "Cleaning supplies",
    triggers: /\bcleaning (supplies|stuff|products|kit)\b|\bclean the (house|apartment|kitchen|bathroom)\b/i,
    categories: [
      { label: "Paper towels", query: "paper towels" },
      { label: "Dish soap", query: "dish soap" },
      { label: "Laundry detergent", query: "laundry detergent" },
      { label: "Trash bags", query: "trash bags" },
      { label: "Sponges", query: "sponges" },
      { label: "Surface cleaner", query: "all purpose cleaner" },
      { label: "Glass cleaner", query: "glass cleaner" },
      { label: "Disinfecting wipes", query: "disinfecting wipes" },
    ],
  },
  {
    title: "Dorm move-in essentials",
    triggers: /\b(dorm|college (move|dorm)|moving (in)?to (a |my )?dorm|freshman)\b/i,
    categories: [
      { label: "Bed sheets", query: "twin xl sheets" },
      { label: "Towels", query: "bath towels" },
      { label: "Laundry detergent", query: "laundry detergent" },
      { label: "Storage bins", query: "storage bins" },
      { label: "Power strip", query: "power strip" },
      { label: "Shower caddy", query: "shower caddy" },
      { label: "Snacks", query: "snacks" },
    ],
  },
  {
    title: "Kitchen basics",
    triggers: /\bkitchen (basics|essentials|starter|stuff|supplies)\b/i,
    categories: [
      { label: "Dish soap", query: "dish soap" },
      { label: "Sponges", query: "sponges" },
      { label: "Paper towels", query: "paper towels" },
      { label: "Aluminum foil", query: "aluminum foil" },
      { label: "Food storage bags", query: "food storage bags" },
      { label: "Trash bags", query: "trash bags" },
      { label: "Dish towels", query: "dish towels" },
    ],
  },
  {
    title: "Baby supplies",
    triggers: /\bbaby (supplies|stuff|essentials|basics)\b|\bnew(born)? baby\b/i,
    categories: [
      { label: "Diapers", query: "diapers" },
      { label: "Baby wipes", query: "baby wipes" },
      { label: "Baby formula", query: "baby formula" },
      { label: "Baby wash", query: "baby shampoo" },
      { label: "Diaper cream", query: "diaper rash cream" },
    ],
  },
  {
    title: "Bathroom restock",
    triggers: /\bbathroom (restock|restocking|supplies|essentials|basics)\b|\brestock (the |my )?bathroom\b/i,
    categories: [
      { label: "Toilet paper", query: "toilet paper" },
      { label: "Hand soap", query: "hand soap" },
      { label: "Shampoo", query: "shampoo" },
      { label: "Toothpaste", query: "toothpaste" },
      { label: "Bathroom cleaner", query: "bathroom cleaner" },
      { label: "Body wash", query: "body wash" },
    ],
  },
  {
    title: "Shabbos groceries",
    triggers: /\bshabbos|shabbat|sabbath\b/i,
    categories: [
      { label: "Challah", query: "challah" },
      { label: "Grape juice", query: "grape juice" },
      { label: "Shabbat candles", query: "shabbat candles" },
      { label: "Wine", query: "kosher wine" },
      { label: "Chicken", query: "chicken" },
      { label: "Gefilte fish", query: "gefilte fish" },
    ],
  },
];

/** Generic "stock up" trigger when no template matches but intent is clearly a list. */
const GENERIC_TRIGGER =
  /\b(i need|we need|help me (get|buy|find)|shopping list|stock up on|stuff for|supplies for|essentials for|restock|set up (my|the))\b/i;

/** Multiple comma/"and"-joined categories ("I need paper towels, dish soap and trash bags"). */
function splitExplicitCategories(message: string): string[] {
  const m = message.replace(/^.*?\b(need|buy|get|want|find)\b/i, "");
  const parts = m
    .split(/,|\band\b|\bplus\b|&/i)
    .map((p) => p.replace(/[^a-z0-9\s]/gi, " ").trim())
    .filter((p) => p.length >= 3 && p.split(/\s+/).length <= 4);
  return parts.length >= 2 ? parts.slice(0, 10) : [];
}

export function detectPlannerIntent(message: string): boolean {
  const t = message.trim();
  if (t.length < 8) return false;
  if (TEMPLATES.some((tpl) => tpl.triggers.test(t))) return true;
  // Generic list intent + a quantity/household signal ("for a family of 5",
  // "for my apartment") OR an explicit multi-category list.
  if (GENERIC_TRIGGER.test(t) && (/\bfor (a|an|my|the|our)\b/i.test(t) || splitExplicitCategories(t).length >= 2)) {
    return true;
  }
  return false;
}

/** Parse simple refinement modifiers from the request. */
function parseModifiers(message: string): { cheaper: boolean; bulk: boolean; retailer?: string; brand?: string } {
  const t = message.toLowerCase();
  const retailer = /\bamazon\b/.test(t) ? "amazon" : /\btarget\b/.test(t) ? "target" : /\bwalmart\b/.test(t) ? "walmart" : undefined;
  return {
    cheaper: /\bcheap(er|est)?\b|\bbudget\b|\blowest price\b|\bsave money\b/.test(t),
    bulk: /\bbulk\b|\bbig (pack|size)\b|\bfamily (size|pack)\b|\bstock up\b|\bfamily of \d/.test(t),
    retailer,
  };
}

function inferTitle(message: string): string {
  const tpl = TEMPLATES.find((x) => x.triggers.test(message));
  if (tpl) return tpl.title;
  const m = message.match(/\bfor (a|an|my|the|our) ([a-z0-9\s]{3,30})/i);
  if (m) return `Shopping plan for ${m[2].trim()}`;
  return "Your shopping plan";
}

export async function buildShoppingPlan(message: string): Promise<ShoppingPlan | null> {
  const tpl = TEMPLATES.find((x) => x.triggers.test(message));
  const categories =
    tpl?.categories ??
    splitExplicitCategories(message).map((q) => ({ label: q.replace(/\b\w/g, (c) => c.toUpperCase()), query: q }));
  if (!categories.length) return null;

  const mods = parseModifiers(message);

  const groups: ShoppingPlanGroup[] = await Promise.all(
    categories.map(async ({ label, query }) => {
      const matches = await findCatalogEstimateMatches(query, mods.bulk ? 4 : 3);
      // Cheaper → already price-sorted ascending; bulk → keep but note preference.
      const products = matches.slice(0, 3).map((m) => ({
        title: m.title,
        brand: m.brand,
        price: m.price,
        internalUrl: m.internalUrl ?? `/chat?q=${encodeURIComponent(query)}`,
      }));
      const coverage: ShoppingPlanGroup["coverage"] = products.length ? "estimated" : "none";
      return { label, query, coverage, products };
    }),
  );

  const covered = groups.filter((g) => g.coverage !== "none").length;
  return {
    title: inferTitle(message),
    intro:
      covered === groups.length
        ? `Here's a plan broken into ${groups.length} categories — prices are catalog estimates; tap any item for live offers.`
        : `Here's a plan broken into ${groups.length} categories. I have catalog matches for ${covered}; the rest have limited coverage right now.`,
    groups,
    note: "Prices shown are typical catalog estimates, not live-confirmed quotes — tap a product to pull current offers.",
    refineChips: buildRefineChips(mods),
  };
}

function buildRefineChips(mods: ReturnType<typeof parseModifiers>): string[] {
  const chips: string[] = [];
  if (!mods.cheaper) chips.push("Cheaper options");
  if (!mods.bulk) chips.push("Bulk sizes");
  if (!mods.retailer) chips.push("Amazon only");
  chips.push("Add a category");
  return chips.slice(0, 4);
}

/** Deterministic Markdown rendering of the plan (chat renders Markdown). */
export function renderShoppingPlanReply(plan: ShoppingPlan): string {
  const lines: string[] = [`## ${plan.title}`, "", plan.intro, ""];
  for (const g of plan.groups) {
    lines.push(`### ${g.label}`);
    if (g.coverage === "none") {
      lines.push(`- _Limited coverage in our catalog — [search live](/chat?q=${encodeURIComponent(g.query)})._`);
    } else {
      for (const p of g.products) {
        // Avoid "Brand Brand Title" when the title already leads with the brand.
        const titleHasBrand =
          p.brand && p.title.toLowerCase().startsWith(p.brand.toLowerCase());
        const name = (titleHasBrand || !p.brand ? p.title : `${p.brand} ${p.title}`)
          .replace(/\s+/g, " ")
          .trim();
        lines.push(`- [${name}](${p.internalUrl}) — ~**$${p.price.toFixed(2)}** _(est.)_`);
      }
    }
    lines.push("");
  }
  lines.push(`> ${plan.note}`);
  return lines.join("\n");
}
