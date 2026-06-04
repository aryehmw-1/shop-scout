import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { IMPACT_VERIFICATION_META_HTML } from "@/lib/affiliate/impact-verification";

/** Prevents middleware fetch loop when rewriting HTML. */
const HTML_META_SKIP_HEADER = "x-homivion-html-meta-skip";

function shouldInjectImpactMeta(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  // Client navigations fetch RSC payloads — never re-fetch full HTML (causes flash/reload).
  if (request.headers.get("RSC") === "1") return false;
  if (request.headers.get("Next-Router-Prefetch")) return false;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return false;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/brand/")) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

function injectMetaIntoHtml(html: string): string {
  if (html.includes("impact-site-verification")) {
    return html;
  }
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${IMPACT_VERIFICATION_META_HTML}`);
  }
  return `${IMPACT_VERIFICATION_META_HTML}${html}`;
}

async function injectImpactVerificationMeta(
  request: NextRequest,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set(HTML_META_SKIP_HEADER, "1");
  headers.delete("accept-encoding");

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers,
      redirect: "manual",
    });
  } catch {
    return NextResponse.next();
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  if (!response.ok) {
    return response;
  }

  if (request.method === "HEAD") {
    return response;
  }

  const html = await response.text();
  const injected = injectMetaIntoHtml(html);

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  if (request.headers.get(HTML_META_SKIP_HEADER)) {
    return NextResponse.next();
  }

  if (pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/brand/icon.svg";
    return NextResponse.redirect(url, 307);
  }

  if (pathname.startsWith("/brand/")) {
    const res = NextResponse.next();
    res.headers.set(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=86400",
    );
    return res;
  }

  if (shouldInjectImpactMeta(request)) {
    return injectImpactVerificationMeta(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
