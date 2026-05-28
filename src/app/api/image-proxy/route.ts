import { NextResponse } from "next/server";

const BLOCKED_HOSTS =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Proxies product images so retailer/CDN hotlink rules don't break <img> tags in the browser.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw?.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" || BLOCKED_HOSTS.test(target.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "ShopScout/1.0 (+https://shop-scout.app)",
        Referer: `${target.origin}/`,
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    console.error("[image-proxy]", e);
    return NextResponse.json({ error: "Proxy failed" }, { status: 502 });
  }
}
