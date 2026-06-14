// Admin access gate. Protects every /admin and /api/admin route via HTTP Basic
// Auth using ADMIN_USER / ADMIN_PASSWORD env vars. Edge-runtime safe (no Node
// APIs) so it can run inside middleware.
//
// Fail-closed: if ADMIN_PASSWORD is not configured, access is DENIED in
// production (so a misconfigured deploy can't expose the dashboard) and ALLOWED
// in development (so local work/screenshots aren't blocked).

import type { NextRequest } from "next/server";

const REALM = "Homivion Admin";

export interface AdminAuthResult {
  ok: boolean;
  /** When !ok, a 401 challenge response the caller should return. */
  challenge?: Response;
}

function unauthorized(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

/** Constant-ish time string compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkAdminAuth(request: NextRequest): AdminAuthResult {
  const expectedUser = process.env.ADMIN_USER?.trim() || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD?.trim();

  // No password configured → allow in dev, deny in prod (fail-closed).
  if (!expectedPass) {
    if (process.env.NODE_ENV !== "production") return { ok: true };
    return { ok: false, challenge: unauthorized() };
  }

  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) {
    return { ok: false, challenge: unauthorized() };
  }

  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return { ok: false, challenge: unauthorized() };
  }
  const sep = decoded.indexOf(":");
  const user = sep >= 0 ? decoded.slice(0, sep) : "";
  const pass = sep >= 0 ? decoded.slice(sep + 1) : "";

  if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPass)) {
    return { ok: true };
  }
  return { ok: false, challenge: unauthorized() };
}
