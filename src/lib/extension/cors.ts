import { NextResponse } from "next/server";

const EXTENSION_ORIGIN_RE =
  /^chrome-extension:\/\/[a-z]{32}$|^moz-extension:\/\/[0-9a-f-]{36}$/i;

export function isExtensionOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return EXTENSION_ORIGIN_RE.test(origin);
}

export function extensionCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (origin && isExtensionOrigin(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
}

export function jsonWithExtensionCors(
  request: Request,
  body: unknown,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: extensionCorsHeaders(request),
  });
}
