import type { DemoProduct } from "../base/types";
import { mapWithConcurrency } from "./queue";
import { isHomepageUrl } from "./quality";
import { scoreProductQuality } from "../../src/lib/demo-commerce/quality";

const OK_STATUSES = new Set([200, 301, 302, 303, 307, 308]);
const CAPTCHA_RE =
  /captcha|perimeterx|px-captcha|challenge-platform|cf-browser-verification|access denied/i;

export interface ValidationResult {
  link_valid: boolean;
  image_valid: boolean;
  rejectReason?: string;
}

export async function validateProductDeep(
  p: DemoProduct,
  opts: { timeoutMs: number; userAgent: string },
): Promise<ValidationResult> {
  if (isHomepageUrl(p.product_url)) {
    return { link_valid: false, image_valid: false, rejectReason: "homepage_url" };
  }

  const link = await fetchWithMeta(p.product_url, opts);
  if (!link.ok) {
    return {
      link_valid: false,
      image_valid: false,
      rejectReason: `link_${link.status ?? "fail"}`,
    };
  }

  if (link.finalUrl && isHomepageUrl(link.finalUrl)) {
    return { link_valid: false, image_valid: false, rejectReason: "redirect_home" };
  }

  if (link.snippet && CAPTCHA_RE.test(link.snippet)) {
    return { link_valid: false, image_valid: false, rejectReason: "captcha" };
  }

  const quality = scoreProductQuality(p);
  if (quality.rejectReasons.includes("generic_image")) {
    return { link_valid: false, image_valid: false, rejectReason: "generic_image" };
  }

  if (link.snippet && p.title) {
    const snippet = link.snippet.toLowerCase();
    const titleWords = p.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6);
    const hits = titleWords.filter((w) => snippet.includes(w)).length;
    const matchRatio = titleWords.length ? hits / titleWords.length : 0;

    if (
      matchRatio < 0.25 &&
      (/search results|browse products|sign in|robot check/i.test(snippet) ||
        quality.linkType === "search")
    ) {
      return { link_valid: false, image_valid: false, rejectReason: "title_mismatch" };
    }
  }

  if (quality.link < 0.4) {
    return { link_valid: false, image_valid: false, rejectReason: "low_link_confidence" };
  }

  let image_valid = false;
  if (p.image_url?.startsWith("http")) {
    const img = await fetchWithMeta(p.image_url, { ...opts, method: "HEAD" });
    image_valid =
      img.ok &&
      Boolean(img.contentType?.startsWith("image/")) &&
      (img.contentLength == null || img.contentLength > 500);
  }

  return { link_valid: true, image_valid, rejectReason: image_valid ? undefined : "bad_image" };
}

export async function validateProducts(
  products: DemoProduct[],
  opts: { concurrency?: number; timeoutMs?: number; userAgent?: string },
): Promise<DemoProduct[]> {
  const concurrency = opts.concurrency ?? 6;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const userAgent = opts.userAgent ?? "ShopScoutCatalogValidator/1.0";

  return mapWithConcurrency(
    products,
    concurrency,
    async (p) => {
      const v = await validateProductDeep(p, { timeoutMs, userAgent });
      return {
        ...p,
        link_valid: v.link_valid,
        image_valid: v.image_valid,
        validation_checked_at: new Date().toISOString(),
      };
    },
    { retries: 1, retryDelayMs: 500 },
  );
}

/** Keep only products that pass deep validation. */
export async function validateAndFilterCatalog(
  products: DemoProduct[],
  opts: { concurrency?: number; timeoutMs?: number; userAgent?: string },
): Promise<{ kept: DemoProduct[]; rejected: number }> {
  const validated = await validateProducts(products, opts);
  const kept = validated.filter((p) => p.link_valid && p.image_valid);
  return { kept, rejected: validated.length - kept.length };
}

async function fetchWithMeta(
  url: string,
  opts: { timeoutMs: number; userAgent: string; method?: string },
): Promise<{
  ok: boolean;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  contentLength?: number;
  snippet?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent,
        Accept: opts.method === "HEAD" ? "*/*" : "text/html,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const len = res.headers.get("content-length");
    const contentLength = len ? parseInt(len, 10) : undefined;
    let snippet: string | undefined;
    if (opts.method !== "HEAD" && contentType?.includes("text/html")) {
      const text = await res.text();
      snippet = text.slice(0, 8000);
    }
    return {
      ok: OK_STATUSES.has(res.status),
      status: res.status,
      finalUrl: res.url,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
      snippet,
    };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
