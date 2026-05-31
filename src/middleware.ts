import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const IMPACT_VERIFICATION_ID = "9624ca76-4d4b-48b7-aa75-b993343f25db";
const IMPACT_META_HTML = `<meta name="impact-site-verification" value="${IMPACT_VERIFICATION_ID}" content="${IMPACT_VERIFICATION_ID}">`;
/** Prevents middleware fetch loop when rewriting HTML. */
const HTML_META_SKIP_HEADER = "x-shop-scout-html-meta-skip";

type HtmlRewriterCtor = new () => {
  on(
    selector: string,
    handlers: {
      element: (element: {
        prepend: (html: string, opts: { html: boolean }) => void;
      }) => void;
    },
  ): { transform: (response: Response) => Response };
};

function shouldInjectImpactMeta(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/brand/")) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

async function injectImpactVerificationMeta(
  request: NextRequest,
): Promise<Response> {
  const Rewriter = (globalThis as { HTMLRewriter?: HtmlRewriterCtor }).HTMLRewriter;
  if (!Rewriter) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.set(HTML_META_SKIP_HEADER, "1");

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

  return new Rewriter()
    .on("head", {
      element(element) {
        element.prepend(IMPACT_META_HTML, { html: true });
      },
    })
    .transform(response);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
