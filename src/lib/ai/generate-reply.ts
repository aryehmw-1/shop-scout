import type { CommerceRetrievalPayload } from "../commerce-intelligence/ai/retrieval-payload";
import type { IntelligenceInsight, ProductSearchResults } from "../types";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import { extractIntentFromMessage } from "./extract-intent";
import { generateAIText, isClaudeConfigured, isGeminiConfigured } from "./index";
import { summarizeSearchResults } from "./summarize-results";
import type { ShoppingIntent } from "../types";

export type ChatAction =
  | "set_zip"
  | "need_zip"
  | "search"
  | "recheck"
  | "refine"
  | "clarify"
  | "link_search"
  | "invalid_link"
  | "conversational";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ReplyContext {
  userMessage: string;
  action: ChatAction;
  zipCode?: string;
  query?: string;
  gender?: string;
  ageGroup?: string;
  nearStores?: string[];
  productResults?: ProductSearchResults;
  retrievalPayload?: CommerceRetrievalPayload;
  commerceInsight?: IntelligenceInsight;
  referenceProductTitle?: string;
  history?: ChatHistoryMessage[];
  intent?: Partial<ShoppingIntent>;
  clarifyQuestion?: string;
}

const SYSTEM_PROMPT = `You are Homivion, a warm and capable AI shopping assistant.

You help users compare online prices across many retailers (grocery, fashion, home, sports, books). Their ZIP code is only used for shipping estimates — we do not show local store pickup or in-store pricing.

## Formatting rules (STRICTLY follow these)
- NEVER write one long paragraph. Every response must use bullet points or short separated lines.
- When showing search results: ALWAYS use a bullet list — one bullet per offer. Format each as:
  • **[Store]** — $X.XX — [short product name or size]
- Lead with one short sentence naming the best deal, then the bullet list, then a brief closing line.
- Use **bold** for store names, prices, and key product specs.
- For "what do you do / how do you work" questions: answer in 3–4 bullet points, not prose.
- A greeting? One warm sentence + a bullet list of example searches.
- Two blank lines between the intro sentence and the bullet list.

## Example of correct price-result format:
Here's what I found for Honey Nut Cheerios — shipping to your ZIP:

• **eBay** — **$3.32** — Honey Nut Cheerios Mega Size 27.2 oz *(best price per oz)*
• **eBay** — $3.40 — Honey Nut Cheerios Mega Size 27.2 oz
• **eBay** — $3.94 — Cheerios Protein Cookies & Crème 15 oz
• **eBay** — $5.37 — Cheerios Heart Healthy Mega Size 24 oz

Let me know if you want a different size or brand!

## Shopping advice / consultation
- When someone asks "what TV should I buy?" or any open-ended "what should I get?" question — do NOT search yet.
- Ask 2–3 focused follow-up questions in a friendly, conversational way (not a form).
- Once they answer, give a specific recommendation with reasoning, then offer to search for prices.

## Sizing / fit / opinion questions
- When someone asks about SIZING or FIT (e.g. "I bought a large, it was a bit too big and I shrank it in the dryer — should I size down to medium?"), give a direct, confident recommendation.
- Acknowledge the detail they shared, then answer in 2–3 short bullets with clear reasoning (e.g. cotton garments shrink ~5% in a hot dryer, so a medium may run too small once it shrinks; a large worn line-dried often keeps the fit).
- End by offering to compare prices on that item. Do NOT say it's out of inventory — they're asking for your judgment, not a search.

## Content rules
- When SEARCH RESULTS are provided, use ONLY those prices and stores — never invent numbers.
- For "clarify": ask ONE friendly follow-up question. Mention they can tap a chip below.
- For recheck/refresh: briefly say you're rechecking, then show the fresh results in bullet format.
- For greetings or thanks: be warm and brief, suggest a next step.
- If zero results: warmly say we don't carry that yet, mention how many products we stock, invite them to request it below.
- Amazon rows may show live prices; other stores use verified estimates.`;

async function callShopScoutAI(
  messages: { role: string; content: string }[],
): Promise<string | null> {
  if (!isAiEnabled()) return null;

  const system = messages.find((m) => m.role === "system")?.content;
  const prompt = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const label = m.role === "assistant" ? "Assistant" : "User";
      return `${label}:\n${m.content}`;
    })
    .join("\n\n");

  try {
    const result = await generateAIText(prompt, {
      system,
      temperature: 0.55,
      maxOutputTokens: 700,
      retries: 1,
      timeoutMs: 12_000,
    });
    return result.text.trim() || null;
  } catch (error) {
    console.error(
      "[generate-reply] AI provider failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

function buildUserContext(ctx: ReplyContext): string {
  const parts: string[] = [`User said: "${ctx.userMessage}"`, `Action: ${ctx.action}`];

  if (ctx.zipCode) parts.push(`ZIP (shipping only): ${ctx.zipCode}`);
  const parsed = extractIntentFromMessage(ctx.userMessage, ctx.zipCode);
  const mergedIntent = { ...parsed, ...ctx.intent };
  const query = ctx.query ?? buildFullSearchQuery(mergedIntent as ShoppingIntent) ?? parsed.query;
  if (query) parts.push(`Search query: ${query}`);
  const gender = ctx.gender ?? parsed.gender;
  const ageGroup = ctx.ageGroup ?? parsed.ageGroup;
  if (gender) parts.push(`Department: ${gender} (only show matching items)`);
  if (ageGroup) parts.push(`Age group: ${ageGroup}`);
  if (parsed.category) parts.push(`Category: ${parsed.category}`);
  if (ctx.referenceProductTitle) parts.push(`Link product: ${ctx.referenceProductTitle}`);
  if (ctx.action === "clarify" && ctx.clarifyQuestion) {
    parts.push(`CLARIFY (ask user before searching): ${ctx.clarifyQuestion}`);
    parts.push("User must pick a product type from the chips — do not list prices yet.");
  }

  if (ctx.productResults) {
    const total = ctx.productResults.online.length;
    if (total === 0) {
      parts.push("SEARCH RESULTS: none matched — suggest trying another name or a product link.");
    } else {
      parts.push("SEARCH RESULTS (use only this data):\n" + summarizeSearchResults(ctx.productResults));
    }
  }

  return parts.join("\n");
}

function fallbackReply(ctx: ReplyContext): string {
  const { action, productResults, query, zipCode } = ctx;
  const q = query ? `**${query}**` : "that";

  switch (action) {
    case "set_zip":
      return `Got it — **${zipCode}** is saved for **shipping estimates**. What should I hunt for?`;

    case "need_zip":
      return "I'd love to help — what's your **5-digit ZIP**? We use it only for **shipping estimates** when comparing online prices.";

    case "invalid_link":
      return "That link didn't parse as a product page. Paste the full URL from the item page (Amazon, Kroger, Nike, etc.) — not a search results page.";

    case "clarify": {
      const clarifyQ =
        ctx.clarifyQuestion ??
        "I want to nail the right item — which style did you have in mind?";
      if (clarifyQ.includes("Tap one") || clarifyQ.includes("You can pick")) return clarifyQ;
      return `${clarifyQ}\n\nTap one of the options below (or type it), and I'll compare online prices across every store.`;
    }

    case "recheck": {
      if (!productResults) return "Sure — tell me what product to search and I'll run a fresh comparison.";
      const total = productResults.online.length;
      if (total === 0) {
        return `I rechecked online stores for ${q} but didn't get matches. Try a more specific name or paste a product link.`;
      }
      const online = productResults.online[0];
      return `Here are **updated online prices** for ${q}${zipCode ? ` (shipping to **${zipCode}**)` : ""}.\n\n${
        online ? `**Best so far:** ${online.retailerName} at **$${online.price.toFixed(2)}**` : ""
      }\n\nScroll the cards below for every store.`;
    }

    case "search":
    case "link_search":
    case "refine": {
      if (!productResults) return `Searching for ${q}…`;
      const total = productResults.online.length;
      const zipNote = productResults.needsZipForShipping
        ? "\n\nAdd your **ZIP** anytime for regional shipping and tax estimates."
        : "";
      if (total === 0) {
        const catalogCount = 66;
        return `Sorry, we don't have ${q} in our inventory right now. We currently carry **${catalogCount} products** across grocery, pantry, household, and more. Type below to let us know what you'd like us to add — we're always expanding!`;
      }
      const online = productResults.online[0];
      const bestPrice = online?.deliveredTotal ?? online?.landedCost ?? online?.price;
      const ref = productResults.referenceProduct;
      if (ref) {
        const cheaper = online && online.price < ref.referencePrice;
        if (cheaper) {
          return `Compared to your link (~**$${ref.referencePrice.toFixed(2)}**), I found **${total} options** — best deal so far is **${online!.retailerName}** at **$${online!.price.toFixed(2)}**. Browse below for more.`;
        }
      }
      const refined =
        ctx.action === "refine"
          ? `Got it — I updated your search${ctx.intent?.colors?.length ? ` (**${ctx.intent.colors.join(", ")}**)` : ""}${ctx.intent?.size ? ` in **${ctx.intent.size}**` : ""}${ctx.intent?.brand ? ` from **${ctx.intent.brand}**` : ""} and rechecked all stores.\n\n`
          : "";
      const summary = `Here's what I found for ${q} — **${productResults.online.length}** options${zipCode ? ` (shipping to **${zipCode}**)` : ""}.`;
      return `${refined}${summary}\n\n${
        online && bestPrice != null
          ? `Best delivered value: **${online.retailerName}** · **$${bestPrice.toFixed(2)}**`
          : ""
      }\n\nTap **View deal** on any card to open that store with your search ready.${zipNote}`;
    }

    case "conversational":
    default: {
      const lower = ctx.userMessage.toLowerCase();
      if (/\b(size|sizing|fit|too (big|small|large|tight|loose)|shrink|medium|large|small|size (up|down))\b/.test(lower)) {
        return "Here's my take on the fit:\n\n• **Cotton shrinks ~3–5%** in a hot dryer, so if a large was only *slightly* too big, a medium may end up too snug once it shrinks.\n• If you liked the length and just want a touch less room, **keep the large** and line-dry it to preserve the fit.\n• Want it noticeably more fitted? **Size down to medium** — just expect it to tighten further with heat.\n\nWant me to compare prices on it across stores?";
      }
      if (/^(hi|hello|hey|yo)\b/.test(lower)) {
        return zipCode
          ? `Hey! I'm Homivion — your ZIP **${zipCode}** is set for shipping estimates. Ask for anything (groceries, **men's** or **women's** clothes, toddler gear, home) or paste a product link and I'll compare online prices.`
          : `Hi there! I'm Homivion — search any product right away. I'll compare prices across stores; add your **ZIP** later for shipping and tax estimates.`;
      }
      if (/thank/.test(lower)) {
        return "You're welcome! Want me to **recheck** a search, try something else, or dig into a specific store from the results?";
      }
      if (/help|how.{0,20}work|what.{0,20}(do|can) you|what.{0,10}this|who are you|tell.{0,20}(how|about).{0,20}(you|this)|explain.{0,20}(you|this)|can you tell/.test(lower)) {
        return "I'm **Homivion** — your personal shopping price-comparison assistant.\n\n• **Search any product** — groceries, electronics, clothes, home goods, and more\n• **Compare prices** across major online stores side by side\n• **Paste a product link** and I'll find cheaper alternatives\n• **Set your ZIP** for accurate shipping estimates\n\nJust type what you're looking for and I'll line up the best prices instantly. What are you shopping for?";
      }
      if (productResults) {
        const online = productResults.online[0];
        if (/cheaper|better|which|recommend|best/.test(lower) && online) {
          return `From your last search, **${online.retailerName}** at **$${online.price.toFixed(2)}** is the lowest I've got. Want me to **recheck** or search something different?`;
        }
      }
      // A question that isn't about shopping — acknowledge it honestly instead of
      // repeating the same canned redirect.
      if (/[?]\s*$/.test(ctx.userMessage.trim()) || /\b(can|could|would|will|do|does|how|what|why|when|should|is|are)\b/.test(lower)) {
        return "That's a bit outside what I can dig into — I'm **Homivion**, a shopping price-comparison assistant, so I'm best at finding and comparing prices rather than general questions.\n\n• **Name a product** and I'll compare prices across stores\n• **Paste a link** and I'll find cheaper alternatives\n• Ask me **how I work** or for **buying advice** on something\n\nWhat can I help you shop for?";
      }
      return zipCode
        ? `I'm here to compare **online prices** for delivery to **${zipCode}**. Name a product, say **recheck** to refresh your last search, or paste a link.`
        : `I'm Homivion — I compare online prices across major stores. Set your ZIP for shipping estimates, then tell me what you're shopping for.`;
    }
  }
}

export async function generateAssistantReply(ctx: ReplyContext): Promise<string> {
  const historyMessages = (ctx.history ?? [])
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1200),
    }));

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages,
    { role: "user", content: buildUserContext(ctx) },
  ];

  const ai = await callShopScoutAI(messages);
  if (ai) return ai;

  return fallbackReply(ctx);
}

export function isAiEnabled(): boolean {
  return isGeminiConfigured() || isClaudeConfigured();
}
