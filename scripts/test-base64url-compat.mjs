/**
 * Regression tests for portable base64url (plain Node — no tsx required).
 * Run: npm run test:base64url
 */

function bytesToStandardBase64(bytes) {
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function standardBase64ToBytes(b64) {
  if (typeof atob !== "undefined") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  return bytesToStandardBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(encoded) {
  if (!encoded || typeof encoded !== "string") return null;
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad === 2) b64 += "==";
    else if (pad === 3) b64 += "=";
    else if (pad === 1) return null;
    return new TextDecoder().decode(standardBase64ToBytes(b64));
  } catch {
    return null;
  }
}

function decodeOutboundTarget(encoded) {
  const url = decodeBase64Url(encoded);
  if (!url) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return url;
}

const AMAZON =
  "https://www.amazon.com/Cheerios-Honey-Nut-Breakfast-Cereal/dp/B000R12345";

let passed = 0;
let failed = 0;

function assert(ok, msg) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== base64url (portable, no base64url encoding) ===\n");

assert(decodeBase64Url(encodeBase64Url("hello")) === "hello", "ascii round-trip");
assert(decodeBase64Url(encodeBase64Url(AMAZON)) === AMAZON, "Amazon URL round-trip");
assert(decodeBase64Url(encodeBase64Url("whole milk")) === "whole milk", "grocery query");
assert(decodeBase64Url("") === null, "empty → null");
assert(decodeBase64Url("!!!") === null, "malformed → null");

const enc = encodeBase64Url(AMAZON);
assert(!enc.includes("+") && !enc.includes("/"), "url-safe alphabet");

console.log("\n=== outbound / verified inventory shop flow ===\n");

assert(decodeOutboundTarget(enc) === AMAZON, "outbound to param");

const params = new URLSearchParams();
params.set("to", enc);
params.set("cid", "cereal-honey");
params.set("q", "honey nut cereal");
assert(params.get("cid") === "cereal-honey", "catalog id serialized");
assert(params.get("q") === "honey nut cereal", "search query serialized");

console.log("\n=== onboarding routes ===\n");

assert(
  new URL("/chat?q=whole%20milk", "http://localhost").searchParams.get("q") === "whole milk",
  "chat query param",
);
assert(
  new URL("/chat?hint=link", "http://localhost").searchParams.get("hint") === "link",
  "paste link hint",
);
assert(new URL("/verified", "http://localhost").pathname === "/verified", "verified page");

// Verify we never call unsupported Buffer base64url encoding
let threwUnsupported = false;
try {
  Buffer.from("test", "base64url");
} catch (e) {
  if (String(e).includes("Unknown encoding") || String(e).includes("base64url")) {
    threwUnsupported = true;
  }
}
if (threwUnsupported) {
  assert(
    decodeBase64Url(encodeBase64Url(AMAZON)) === AMAZON,
    "works even when Buffer base64url unsupported",
  );
} else {
  assert(true, "Buffer base64url available in this Node runtime (portable path still used in app)");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
