/**
 * Portable base64url encode/decode — no Node "base64url" encoding (unsupported in
 * Safari, Edge runtime, and many Buffer polyfills bundled for the browser).
 */

function bytesToStandardBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function standardBase64ToBytes(b64: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** URL-safe base64 without padding (RFC 4648 §5). */
export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToStandardBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode URL-safe base64; returns null on malformed input (never throws). */
export function decodeBase64Url(encoded: string): string | null {
  if (!encoded || typeof encoded !== "string") return null;

  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad === 2) b64 += "==";
    else if (pad === 3) b64 += "=";
    else if (pad === 1) return null;

    const bytes = standardBase64ToBytes(b64);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Round-trip helper for tests. */
export function isValidBase64UrlRoundTrip(value: string): boolean {
  return decodeBase64Url(encodeBase64Url(value)) === value;
}
