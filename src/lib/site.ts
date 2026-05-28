import { APP_NAME } from "./constants";

/** Public site URL — set in production for Amazon Associates and Open Graph. */
export function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SHOP_SCOUT_PUBLIC_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!url) return "http://localhost:3000";
  if (url.startsWith("http")) return url.replace(/\/$/, "");
  return `https://${url.replace(/\/$/, "")}`;
}

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "support@shopscout.app";

export const SITE_LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || APP_NAME;
