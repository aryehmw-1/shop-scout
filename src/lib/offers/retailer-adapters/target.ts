import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import {
  extractNextData,
  extractScriptJsonById,
  collectObjects,
  firstString,
} from "./html-json";
import { parsePriceFromText, parsePriceUsd } from "./price-parse";
import { logTargetParseDiagnostics } from "./target-debug";
import { isPdpProductUrl } from "../url-classifier";

function targetPriceFromRow(row: Record<string, unknown>): number | undefined {
  const price = row.price;
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    return (
      parsePriceUsd(p.current_retail ?? p.currentRetail) ??
      parsePriceUsd(p.reg_retail ?? p.regRetail) ??
      parsePriceUsd(p.formatted_current_price ?? p.formattedCurrentPrice) ??
      parsePriceUsd(p.formatted_price ?? p.formattedPrice)
    );
  }
  return (
    parsePriceUsd(row.current_retail ?? row.currentRetail) ??
    parsePriceUsd(row.reg_retail) ??
    parsePriceUsd(row.formatted_current_price)
  );
}

function targetPdpUrl(row: Record<string, unknown>): string | undefined {
  const direct = firstString(row, [
    "pdp_url",
    "pdpUrl",
    "url",
    "buy_url",
    "canonical_url",
    "item_url",
  ]);
  if (direct?.includes("target.com") && !direct.includes("/s?")) {
    try {
      const u = new URL(direct, "https://www.target.com").href;
      if (isPdpProductUrl(u) || /\/A-\d+/i.test(u)) return u;
    } catch {
      /* fall through */
    }
  }

  const tcin =
    row.tcin ??
    (row.item && typeof row.item === "object"
      ? (row.item as Record<string, unknown>).tcin
      : undefined) ??
    row.product_id;

  if (typeof tcin === "string" || typeof tcin === "number") {
    const t = String(tcin).replace(/\D/g, "");
    if (t.length >= 6) return `https://www.target.com/p/-/A-${t}`;
  }
  return undefined;
}

function targetTitle(row: Record<string, unknown>): string | undefined {
  const item = row.item;
  if (item && typeof item === "object") {
    const desc = (item as Record<string, unknown>).product_description;
    if (desc && typeof desc === "object") {
      const t = firstString(desc as Record<string, unknown>, [
        "title",
        "downstream_description",
      ]);
      if (t) return t;
    }
  }
  return firstString(row, ["title", "name", "description", "product_description"]);
}

function targetImage(row: Record<string, unknown>): string | undefined {
  const item = row.item;
  if (item && typeof item === "object") {
    const enrichment = (item as Record<string, unknown>).enrichment;
    if (enrichment && typeof enrichment === "object") {
      const images = (enrichment as Record<string, unknown>).images;
      if (images && typeof images === "object") {
        const primary = (images as Record<string, unknown>).primary_image_url;
        if (typeof primary === "string" && primary.startsWith("http")) return primary;
      }
    }
  }
  return firstString(row, ["image_url", "imageUrl", "primary_image_url"]);
}

function scoreTargetRow(row: Record<string, unknown>): number {
  let s = 0;
  if (targetPriceFromRow(row)) s += 40;
  if (targetPdpUrl(row)) s += 30;
  if (targetTitle(row)) s += 10;
  if (row.item) s += 5;
  return s;
}

function productsFromEmbeddedJson(html: string): Record<string, unknown>[] {
  const roots: unknown[] = [];
  const next = extractNextData(html);
  if (next) roots.push(next);
  const tgt = extractScriptJsonById(html, "__TGT_DATA__");
  if (tgt) roots.push(tgt);

  const out: Record<string, unknown>[] = [];
  for (const root of roots) {
    const rows = collectObjects(
      root,
      (o) =>
        typeof o.tcin === "string" ||
        typeof o.tcin === "number" ||
        (typeof o.product_id === "string" && /^\d{6,}$/.test(o.product_id)),
      40,
    );
    out.push(...rows);
  }
  return out;
}

function productFromTargetRegex(html: string): Record<string, unknown> | undefined {
  const tcin =
    html.match(/"tcin"\s*:\s*"?(\d{6,})"?/)?.[1] ??
    html.match(/\/A-(\d{6,})/)?.[1];
  if (!tcin) return undefined;
  const title =
    html.match(/"title"\s*:\s*"([^"\\]+)"/)?.[1] ??
    html.match(/"product_description"\s*:\s*\{[^}]*"title"\s*:\s*"([^"\\]+)"/)?.[1];
  const price =
    html.match(/"current_retail"\s*:\s*([\d.]+)/)?.[1] ??
    html.match(/"reg_retail"\s*:\s*([\d.]+)/)?.[1] ??
    html.match(/"formatted_current_price"\s*:\s*"\$?([\d,]+(?:\.\d{2})?)"/)?.[1];
  return {
    tcin,
    item: title ? { product_description: { title } } : undefined,
    price: price ? { current_retail: parseFloat(price.replace(/,/g, "")) } : undefined,
  };
}

function productFromJsonLd(html: string): Record<string, unknown> | undefined {
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const json = JSON.parse(block[1]!) as unknown;
      const products = collectObjects(
        json,
        (o) => String(o["@type"] ?? "").toLowerCase().includes("product"),
        5,
      );
      for (const p of products) {
        const offers = p.offers;
        const price =
          typeof offers === "object" && offers && !Array.isArray(offers)
            ? parsePriceUsd((offers as Record<string, unknown>).price)
            : undefined;
        const url = typeof p.url === "string" ? p.url : undefined;
        if (price || url) {
          return {
            tcin: url?.match(/\/A-(\d+)/)?.[1],
            price: price ? { current_retail: price } : undefined,
            url,
            title: typeof p.name === "string" ? p.name : undefined,
          };
        }
      }
    } catch {
      /* skip */
    }
  }
  return undefined;
}

function pickBestProduct(html: string): Record<string, unknown> | undefined {
  const candidates = productsFromEmbeddedJson(html);
  if (candidates.length) {
    return [...candidates].sort((a, b) => scoreTargetRow(b) - scoreTargetRow(a))[0];
  }
  return (
    productFromTargetRegex(html) ??
    productFromJsonLd(html) ??
    undefined
  );
}

function hitFromRow(row: Record<string, unknown>): RetailerSearchHit | null {
  const pdpUrl = targetPdpUrl(row);
  const priceUsd =
    targetPriceFromRow(row) ?? parsePriceFromText(JSON.stringify(row).slice(0, 2000));
  const storeTitle = targetTitle(row);
  const imageUrl = targetImage(row);
  const tcin = row.tcin ?? row.product_id;

  if (!pdpUrl && !priceUsd && !storeTitle) return null;

  return {
    pdpUrl,
    priceUsd,
    storeTitle,
    imageUrl,
    externalId: tcin != null ? String(tcin) : undefined,
    fromSearchParser: true,
  };
}

export const targetAdapter: RetailerPageAdapter = {
  retailerId: "target",

  extractSearchResults(html: string, pageUrl: string): RetailerSearchHit | null {
    const row = pickBestProduct(html);
    const hit = row ? hitFromRow(row) : null;
    logTargetParseDiagnostics(pageUrl, html, hit);
    return hit;
  },
};
