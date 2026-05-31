/** Impact affiliate site ownership verification token. */
export const IMPACT_SITE_VERIFICATION_ID =
  "9624ca76-4d4b-48b7-aa75-b993343f25db";

/**
 * Raw meta tag for Impact crawlers (non-standard `value` attribute).
 * Injected server-side via middleware HTMLRewriter — not client hydration.
 */
export const IMPACT_VERIFICATION_META_HTML = `<meta name="impact-site-verification" value="${IMPACT_SITE_VERIFICATION_ID}" content="${IMPACT_SITE_VERIFICATION_ID}">`;

/** Next.js Metadata API `other` entry (renders with standard `content` attribute). */
export const IMPACT_VERIFICATION_METADATA_OTHER = {
  "impact-site-verification": IMPACT_SITE_VERIFICATION_ID,
} as const;
