import { createHash } from "node:crypto";
import { identifiersFromRecord } from "@/lib/identity/product-identifiers";
import type { NormalizedImpactRow } from "./types";
import { retailerFromUrl, slugifyId } from "./retailer-map";

const GENERIC_IMAGE_RE =
  /unsplash\.com|placehold\.co|placeholder|picsum/i;

function parsePrice(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const m = raw.replace(/,/g, "").match(/([\d]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function classifyLink(url: string): NormalizedImpactRow["link_type"] {
  try {
    const u = new URL(url);
    if (/\/dp\/|\/ip\/|\/p\/|\/product\//i.test(u.pathname)) return "pdp";
    if (/search|browse|searchTerm/i.test(u.pathname + u.search)) return "search";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function detectDelimiter(headerLine: string): string {
  if (headerLine.includes("\t")) return "\t";
  if (headerLine.includes("|")) return "|";
  return ",";
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function rowToRecord(headers: string[], values: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]!.trim().toLowerCase();
    if (key) rec[key] = (values[i] ?? "").trim();
  }
  return rec;
}

function pick(rec: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (rec[k]) return rec[k]!;
  }
  return "";
}

/** Parse Google Merchant / Impact tab-delimited or CSV catalog text. */
export function parseImpactFeedText(
  text: string,
  opts: { catalogId: string; advertiserName: string; maxRows?: number },
): NormalizedImpactRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delim = detectDelimiter(lines[0]!);
  const headers = parseCsvLine(lines[0]!, delim).map((h) => h.trim().toLowerCase());
  const rows: NormalizedImpactRow[] = [];
  const max = opts.maxRows ?? 10_000;

  for (let i = 1; i < lines.length && rows.length < max; i++) {
    const values = parseCsvLine(lines[i]!, delim);
    const rec = rowToRecord(headers, values);
    const link = pick(rec, "link", "url", "product url", "product_url");
    if (!link.startsWith("http")) continue;

    const mapped = retailerFromUrl(link);
    if (!mapped) continue;

    const title = pick(rec, "title", "name", "product name");
    if (title.length < 5) continue;

    const regularPrice = parsePrice(pick(rec, "price"));
    const salePrice = parsePrice(pick(rec, "sale_price", "current price"));
    const price = salePrice ?? regularPrice;
    if (price == null) continue;
    const was_price =
      salePrice != null && regularPrice != null && regularPrice > salePrice ?
        regularPrice
      : null;

    const image = pick(rec, "image_link", "image link", "image url", "image");
    if (!image.startsWith("http") || GENERIC_IMAGE_RE.test(image)) continue;

    const availabilityRaw = pick(rec, "availability", "stock").toLowerCase();
    const availability: NormalizedImpactRow["availability"] =
      availabilityRaw.includes("out") ? "out_of_stock" : "in_stock";

    const identifiers = identifiersFromRecord({
      gtin: pick(rec, "gtin", "ean", "upc"),
      upc: pick(rec, "upc"),
      mpn: pick(rec, "mpn"),
      asin: pick(rec, "asin"),
      sku: pick(rec, "id", "sku", "offer id"),
    });

    const rowId = pick(rec, "id", "sku") || createHash("sha256").update(link).digest("hex").slice(0, 16);

    rows.push({
      row_id: rowId,
      catalog_id: opts.catalogId,
      advertiser_name: opts.advertiserName,
      retailer: mapped.retailer,
      retailer_domain: mapped.domain,
      title,
      brand: pick(rec, "brand") || null,
      description: pick(rec, "description") || null,
      product_url: link.split("?")[0]!,
      affiliate_url: link,
      image_url: image,
      price,
      currency: pick(rec, "currency", "currency code") || "USD",
      was_price,
      availability,
      category_raw: pick(rec, "google_product_category", "product_type", "category") || null,
      identifiers,
      link_type: classifyLink(link),
      raw: rec,
    });
  }

  return rows;
}

export function stableOfferId(canonicalId: string, retailer: string, productUrl: string): string {
  const h = createHash("sha256")
    .update(`${canonicalId}|${retailer}|${productUrl}`)
    .digest("hex")
    .slice(0, 24);
  return `offer-${h}`;
}

export function provisionalCanonicalId(row: NormalizedImpactRow): string {
  const gtin = row.identifiers.gtin ?? row.identifiers.upc ?? row.identifiers.ean;
  if (gtin) return `gtin-${gtin}`;
  if (row.identifiers.asin) return `asin-${row.identifiers.asin}`;
  return `title-${slugifyId(row.brand ?? "na")}-${slugifyId(row.title)}`;
}
