import { APP_NAME } from "./constants";

/** Canonical public site shown to users (never a per-deployment Vercel URL). */
export const CANONICAL_SITE_URL = "https://www.homivion.com";

/**
 * Public site URL — set in production for Amazon Associates and Open Graph.
 * Always resolves to the canonical homivion.com domain in production; the
 * per-deployment `VERCEL_URL` is intentionally NOT used for display because
 * it produces ugly, non-canonical hostnames.
 */
export function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SHOP_SCOUT_PUBLIC_URL?.trim();

  if (url) {
    if (url.startsWith("http")) return url.replace(/\/$/, "");
    return `https://${url.replace(/\/$/, "")}`;
  }

  // No explicit override: use the canonical domain in production, localhost in dev.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return CANONICAL_SITE_URL;
  }
  return "http://localhost:3000";
}

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "support@homivion.com";

export const SITE_LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || APP_NAME;
