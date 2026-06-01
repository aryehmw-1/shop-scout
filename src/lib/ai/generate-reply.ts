import type { ProductSearchResults } from "../types";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import { extractIntentFromMessage } from "./extract-intent";
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
  referenceProductTitle?: string;
  history?: ChatHistoryMessage[];
  intent?: Partial<ShoppingIntent>;
  clarifyQuestion?: string;
}

const SYSTEM_PROMPT = `You are Shop Scout, a warm and capable AI shopping assistant.

You help users compare online prices across many retailers (grocery, fashion, home, sports, books). Their ZIP code is only used for shipping estimates — we do not show local store pickup or in-store pricing.

Guidelines:
- Sound natural and human — like a helpful friend, not a robot.
- Keep replies concise (usually 2–5 sentences) unless the user asks for detail.
- Use **bold** for store names, prices, and product names (markdown).
- When SEARCH RESULTS are provided, explain what you found using ONLY those prices and stores — never invent products or dollar amounts.
- For action "clarify": ask ONE friendly follow-up question to narrow the product (e.g. jeans vs joggers for pants, running vs dress shoes). Mention they can tap a chip below.
- For vague requests like "mens pants" or "shoes" without a type, always clarify before pretending you searched.
- For recheck/refresh: say you're updating or rechecking and summarize the fresh results.
- For greetings or thanks: respond warmly and suggest a next step.
- If they ask which deal is best, compare using the provided results.
- Amazon rows may show live prices and photos when Amazon PA-API is configured; other stores use estimates and store links.
- If there are zero results, encourage a clearer product name or a product page link.`;

async function callOpenAI(messages: { role: string; content: string }[]): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 400,
        messages,
      }),
    });

    if (!res.ok) {
      console.error("OpenAI error", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    console.error("OpenAI request failed", e);
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
      return "That link didn't parse as a product page. Paste the full URL from the item page (Walmart, Target, Amazon, Nike, etc.) — not a search results page.";

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
        const closest = productResults.closestMatchFallback;
        if (closest) {
          return `I found **closest matches** for ${q} — prices are estimated while we expand verified inventory. Browse the cards below or paste a product link for an exact match.${zipNote}`;
        }
        return `I looked across our online stores for ${q} but didn't find a strong match. Try different wording or paste a product link.${zipNote}`;
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
      if (/^(hi|hello|hey|yo)\b/.test(lower)) {
        return zipCode
          ? `Hey! I'm Shop Scout — your ZIP **${zipCode}** is set for shipping estimates. Ask for anything (groceries, **men's** or **women's** clothes, toddler gear, home) or paste a product link and I'll compare online prices.`
          : `Hi there! I'm Shop Scout — search any product right away. I'll compare prices across stores; add your **ZIP** later for shipping and tax estimates.`;
      }
      if (/thank/.test(lower)) {
        return "You're welcome! Want me to **recheck** a search, try something else, or dig into a specific store from the results?";
      }
      if (/help|how (does|do) this work/.test(lower)) {
        return "Easy: tell me what you want (e.g. **organic milk** or **women's black hoodie**), or paste a product link. I'll show **online prices** from major stores — click any card to shop that retailer.";
      }
      if (productResults) {
        const online = productResults.online[0];
        if (/cheaper|better|which|recommend|best/.test(lower) && online) {
          return `From your last search, **${online.retailerName}** at **$${online.price.toFixed(2)}** is the lowest I've got. Want me to **recheck** or search something different?`;
        }
      }
      return zipCode
        ? `I'm here to compare **online prices** for delivery to **${zipCode}**. Name a product, say **recheck** to refresh your last search, or paste a link.`
        : `I'm Shop Scout — I compare online prices across major stores. Set your ZIP for shipping estimates, then tell me what you're shopping for.`;
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

  const ai = await callOpenAI(messages);
  if (ai) return ai;

  return fallbackReply(ctx);
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
