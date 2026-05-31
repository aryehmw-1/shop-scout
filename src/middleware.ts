import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { IMPACT_VERIFICATION_META_HTML } from "@/lib/affiliate/impact-verification";

/**
 * Safari auto-requests /favicon.ico before reading HTML and caches it per-origin.
 * Brand assets get short cache + revalidation so SVG hash bumps propagate quickly.
 *
 * Impact site verification: raw meta tag is prepended to `<head>` on HTML document
 * responses via Edge HTMLRewriter (SSR stream, crawler-visible before JS).
 */
function shouldInjectImpactMeta(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/brand/")) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*") || accept === "";
}

function injectImpactVerificationMeta(response: NextResponse): Response {
  // HTMLRewriter is available on Vercel Edge middleware.
  type HtmlRewriterCtor = new () => {
    on(
      selector: string,
      handlers: {
        element: (element: {
          prepend: (html: string, opts: { html: boolean }) => void;
        }) => void;
      },
    ): { transform: (res: NextResponse) => Response };
  };

  const Rewriter = (globalThis as { HTMLRewriter?: HtmlRewriterCtor }).HTMLRewriter;
  if (!Rewriter) return response;

  return new Rewriter()
    .on("head", {
      element(element) {
        element.prepend(IMPACT_VERIFICATION_META_HTML, { html: true });
      },
    })
    .transform(response);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/brand/mark-32.png";
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
    return injectImpactVerificationMeta(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
