import type { CommerceRetrievalPayload } from "../commerce-intelligence/ai/retrieval-payload";
import type { IntelligenceInsight, ProductSearchResults } from "../types";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import { extractIntentFromMessage } from "./extract-intent";
import { generateAIText, isClaudeConfigured, isGeminiConfigured } from "./index";
import { generateGeminiTextStream } from "./gemini";
import { summarizeSearchResults } from "./summarize-results";
import { matchLooksIrrelevant } from "../search/relevance";
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
  /** Advice / comparison turn — answer the question directly (web search on). */
  adviceMode?: boolean;
}

const SYSTEM_PROMPT = `You are Homivion, a warm and capable AI shopping assistant.

You help users compare online prices across many retailers (grocery, fashion, home, sports, books). Their ZIP code is only used for shipping estimates — we do not show local store pickup or in-store pricing.

## Formatting rules (STRICTLY follow these — output Markdown)
- Structure every answer with Markdown so it renders cleanly: short section headings, bullet lists, bold, and the occasional blockquote.
- Use "## " for a short section heading when an answer has more than one part (e.g. "## Best Deal", "## What I Can Do"). Keep headings to 1–4 words.
- Use "- " bullets for lists — one idea per bullet. NEVER write one long paragraph.
- Use **bold** for store names, prices, key specs, and the main takeaway.
- Use a "> " blockquote ONLY for a single short highlight or the bottom-line recommendation (at most one per answer).
- Separate blocks with a blank line so headings, paragraphs, and lists don't run together.
- CRITICAL: put every bullet on its OWN line starting with "- ". NEVER write a list inline inside a sentence (do NOT write "Here's why: - A - B - C"). NEVER use en-dashes or hyphens as inline separators. A blockquote must be on its own line starting with "> ", never mid-sentence.
- Keep each bullet to one short sentence. Aim for 3–6 bullets, not a wall of text.
- When showing search results: the cards UNDER your reply already display every store, price, and a highlighted "Best" pick — so DO NOT restate the winner or re-list the offers in prose. Write ONE short, warm line that frames what you did, e.g. "I checked the live prices across the stores I track — here's what I found:" Then stop. (You may add a single optional follow-up sentence like "Want a different size or brand?") Never repeat the prices that are already on the cards.
- For "what do you do / how do you work" questions: a one-line intro, then a "## What I Can Do" heading with 3–4 bullets.
- A greeting? One warm sentence + a short bullet list of example searches.

## Correct price-result reply (the cards do the listing — your text does NOT):
I checked the live prices across the stores I track for [product] — here's what I found:

Then STOP (optionally one short follow-up like "Want a different size or brand?").

CRITICAL: Never list stores or prices in your text — they already appear on the
cards below your reply, and repeating them is redundant. Never invent stores or
prices, and never reuse any example product (e.g. cereal, eBay). If no SEARCH
RESULTS are provided, you have nothing to confirm.

## Product advice & comparison questions (e.g. "should I buy the Apple Watch 11 or SE?", "AirPods vs AirPods Pro", "is the X worth it?")
- These ask for a recommendation, NOT a price lookup. Answer directly and confidently using your knowledge and any web-search results provided.
- LEAD WITH THE RECOMMENDATION — never bury it at the bottom. Optimize for skimming on mobile: short sections, bullets, and a comparison table instead of long prose.
- When ADVICE MODE instructions are present in the user context, follow that exact section structure (Recommended Choice → Consider the Alternative If… → Quick Comparison table → Bottom Line) and keep the whole answer under ~250 words.
- Be honest and specific; if confidence is low or the options are very close, say so. Never invent Homivion prices or claim something is "out of catalog."
- Do NOT add your own prices/CTA line — a "Compare prices" button is shown below your reply.

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
- If zero results: warmly say we couldn't find it in Homivion's catalog yet and that we're always expanding. Invite them to request it below with the brand, size, or model so we can add it. NEVER state how many products we stock or carry — do not mention any product count.
- Amazon rows may show live prices; other stores use verified estimates.`;

async function callShopScoutAI(
  messages: { role: string; content: string }[],
  opts: { useWebSearch?: boolean } = {},
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
      // Advice/comparison turns keep the model's "thinking" pass on (for
      // grounded reasoning), which shares this budget — so give them extra room
      // to avoid truncating the visible answer mid-sentence.
      maxOutputTokens: opts.useWebSearch ? 1100 : 900,
      // Disable gemini-2.5-flash's hidden "thinking" pass. These replies follow
      // a strict, well-specified Markdown format and don't need chain-of-thought
      // — and when thinking is left on it silently consumes the output budget,
      // truncating the visible reply mid-sentence ("…It seems I only found the").
      // EXCEPTION: advice/comparison turns use web-search grounding, but we still
      // CAP the reasoning pass (vs. leaving it unbounded/dynamic) so it can't
      // balloon latency — the format is strict and ~250 words, so a small budget
      // is plenty. This is the main lever that takes advice from ~12s toward ~6s.
      ...(opts.useWebSearch
        ? { useWebSearch: true, thinkingBudget: 512 }
        : { thinkingBudget: 0 }),
      retries: 1,
      timeoutMs: opts.useWebSearch ? 14_000 : 12_000,
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

  if (ctx.adviceMode && !ctx.productResults) {
    parts.push(
      [
        "ADVICE MODE: The user wants a buying recommendation/comparison, NOT a price lookup.",
        "LEAD WITH THE ANSWER. Optimize for fast skimming on a phone. Use real, current facts",
        "(web search is available). Output Markdown in EXACTLY this structure and order:",
        "",
        "# Recommended Choice",
        "🥇 **<product name>**",
        "Best for most people because it offers:",
        "- <key reason>",
        "- <key reason>",
        "- <key reason>",
        "",
        "# Consider the Alternative If…",
        "**<other product>** may be better if you:",
        "- <reason>",
        "- <reason>",
        "",
        "# Quick Comparison",
        "A Markdown table comparing 4–6 key features across the options. Use a header row,",
        "a separator row, then one row per feature. Mark the better option in each row with",
        "“⭐ Winner”. Example:",
        "| Feature | <A> | <B> |",
        "| --- | --- | --- |",
        "| Noise Cancellation | ⭐ Winner | Good |",
        "",
        "# Bottom Line",
        "1–2 sentences restating the pick and the single most important reason.",
        "",
        "RULES (strict):",
        "- Keep the WHOLE answer under ~250 words. No walls of text. Short sections only.",
        "- NEVER bury the recommendation — it MUST be the first thing.",
        "- If the user named only ONE product, compare it against the best alternative you know.",
        "- If your confidence is low, say so plainly in the Bottom Line.",
        "- If the products are very close, state that explicitly rather than forcing a winner.",
        "- Do NOT mention a catalog or a request form, and do NOT invent Homivion prices.",
        "- Do NOT add a prices/CTA line yourself — a “Compare prices” button is shown below your reply.",
      ].join("\n"),
    );
    return parts.join("\n");
  }

  if (ctx.productResults) {
    const total = ctx.productResults.online.length;
    // Mirror the results card's relevance guard: when the catalog scorer returns
    // products that share no meaningful token with the query (e.g. eggs for
    // "Beats Studio Pro"), the card hides them and shows a request form — so the
    // summary line must NOT claim we found a confident match. The exact-compare
    // and link flows are trusted and skip this check.
    const trustedExactFlow = Boolean(ctx.referenceProductTitle);
    const irrelevant =
      total > 0 &&
      !trustedExactFlow &&
      matchLooksIrrelevant(query, ctx.productResults.online);
    if (total === 0 || irrelevant) {
      parts.push(
        "SEARCH RESULTS: no confident match — we could NOT find this product in our catalog. " +
          "Do NOT list any prices or stores. Warmly tell the user we couldn't find a confident " +
          "match for their search, and invite them to request it (a request form is shown below).",
      );
    } else {
      parts.push("SEARCH RESULTS (use only this data):\n" + summarizeSearchResults(ctx.productResults));
    }
  } else if (query) {
    // A product query but no results were attached to this turn. The model must
    // NOT fabricate offers (it otherwise parrots the format template). Tell it to
    // fall back to the warm "we couldn't find it" + request-it message.
    parts.push(
      "SEARCH RESULTS: none for this turn. Do NOT list any stores or prices and do " +
        "NOT invent offers. Warmly tell the user we couldn't find this in Homivion's " +
        "catalog yet and invite them to request it (a request form is shown below).",
    );
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
      const trustedExactFlow = Boolean(ctx.referenceProductTitle);
      const noConfidentMatch =
        total === 0 ||
        (!trustedExactFlow && matchLooksIrrelevant(query, productResults.online));
      if (noConfidentMatch) {
        return `**I couldn't find ${q} in Homivion's catalog yet.** We're continuously expanding our product database, so it may not be available today. Tell us the exact product below — include the brand, size, or model number — and we'll do our best to add it quickly and notify you when it's available.`;
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
      void bestPrice;
      const refined =
        ctx.action === "refine"
          ? `Updated your search${ctx.intent?.colors?.length ? ` (**${ctx.intent.colors.join(", ")}**)` : ""}${ctx.intent?.size ? ` in **${ctx.intent.size}**` : ""}${ctx.intent?.brand ? ` from **${ctx.intent.brand}**` : ""} — `
          : "";
      // The cards below already show each store, price, and the "Best" pick, so
      // the reply stays a short trust line instead of restating the winner.
      const lead = refined
        ? `${refined}I re-checked every store I track for ${q}${zipCode ? ` (shipping to **${zipCode}**)` : ""}. Here's what came back:`
        : `I checked the live prices across the stores I track for ${q}${zipCode ? ` (shipping to **${zipCode}**)` : ""}. Here's what I found:`;
      return `${lead}${zipNote}`;
    }

    case "conversational":
    default: {
      const lower = ctx.userMessage.toLowerCase();
      if (ctx.adviceMode) {
        return "Happy to help you decide.\n\n- Tell me what matters most to you — **budget**, key **features**, or how you'll use it.\n- I can then point you to the better pick and **compare live prices** across stores.\n\nWhich way are you leaning, and what's your budget?";
      }
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

/**
 * Greetings, thanks, and "how do you work / who are you" have great fixed
 * answers — there's nothing for the model to reason about. Skipping the ~1–1.5s
 * Gemini round-trip for these makes the most common quick replies feel instant.
 * Returns the canned reply, or null when the turn genuinely needs the model
 * (open questions, advice, anything tied to product results).
 */
function instantConversationalReply(ctx: ReplyContext): string | null {
  if (ctx.action !== "conversational" || ctx.adviceMode || ctx.productResults) {
    return null;
  }
  const t = ctx.userMessage.trim().toLowerCase();
  const isGreeting = /^(hi|hello|hey|yo)\b/.test(t);
  const isThanks = /^(thanks|thank you|thx|ty|much appreciated)\b/.test(t) || /\bthank you\b/.test(t);
  const isMeta =
    /^(help)\b/.test(t) ||
    /\bhow (do|does) (you|this|homivion|it) work\b/.test(t) ||
    /\bwho are you\b/.test(t) ||
    /\bwhat (do|can) you (do|help)\b/.test(t);
  if (isGreeting || isThanks || isMeta) return fallbackReply(ctx);
  return null;
}

export async function generateAssistantReply(ctx: ReplyContext): Promise<string> {
  const instant = instantConversationalReply(ctx);
  if (instant) return instant;

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

  const ai = await callShopScoutAI(messages, { useWebSearch: ctx.adviceMode });
  if (ai) return ai;

  return fallbackReply(ctx);
}

/**
 * Streaming version of {@link generateAssistantReply}, used for buying-advice
 * turns so the UI can render the answer as it's generated instead of waiting
 * for the full response. Yields text deltas. Falls back to a single yield of
 * the non-AI reply when Gemini isn't configured or streaming fails.
 */
export async function* streamAssistantReply(
  ctx: ReplyContext,
): AsyncGenerator<string, void, unknown> {
  // Streaming is Gemini-only here; if it's unavailable, emit a one-shot reply.
  if (!isGeminiConfigured()) {
    yield await generateAssistantReply(ctx);
    return;
  }

  const historyMessages = (ctx.history ?? [])
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));

  const prompt = [...historyMessages, { role: "user", content: buildUserContext(ctx) }]
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}:\n${m.content}`)
    .join("\n\n");

  try {
    let emitted = false;
    for await (const delta of generateGeminiTextStream(prompt, {
      system: SYSTEM_PROMPT,
      temperature: 0.55,
      maxOutputTokens: 1100,
      thinkingBudget: 512,
      useWebSearch: ctx.adviceMode,
    })) {
      emitted = true;
      yield delta;
    }
    if (!emitted) yield fallbackReply(ctx);
  } catch (error) {
    console.error(
      "[generate-reply] streaming failed",
      error instanceof Error ? error.message : "unknown error",
    );
    yield fallbackReply(ctx);
  }
}

export function isAiEnabled(): boolean {
  return isGeminiConfigured() || isClaudeConfigured();
}
