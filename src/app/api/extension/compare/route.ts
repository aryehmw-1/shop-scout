import {
  buildQueryFromPageContext,
  normalizeExtensionContext,
  type ExtensionPageContext,
} from "@/lib/extension/page-context";
import {
  extensionCorsHeaders,
  jsonWithExtensionCors,
} from "@/lib/extension/cors";
import { getSessionUserId } from "@/lib/auth/session";
import { searchService } from "@/lib/search/search-service";
import { isAmazonPaapiConfigured } from "@/lib/search/providers/amazon-paapi-config";
import type { ShoppingIntent } from "@/lib/types";
import { NextResponse } from "next/server";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: extensionCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ExtensionPageContext> & {
      zipCode?: string;
    };

    if (!body.url?.trim()) {
      return jsonWithExtensionCors(
        request,
        { error: "url is required" },
        { status: 400 },
      );
    }

    const page = normalizeExtensionContext({
      url: body.url,
      title: body.title,
      price: body.price,
      asin: body.asin,
      retailer: body.retailer,
    });

    const query = buildQueryFromPageContext(page);
    if (!query) {
      return jsonWithExtensionCors(
        request,
        { error: "Could not build a search query from this page" },
        { status: 400 },
      );
    }

    const intent: ShoppingIntent = {
      query,
      zipCode: body.zipCode ?? "78701",
      amazonAsin: page.asin,
      pageUrl: page.url,
    };

    const userId = (await getSessionUserId()) ?? undefined;
    const productResults = await searchService.search(intent, { userId });

    const offers = [...productResults.local, ...productResults.online]
      .slice(0, 12)
      .map((o) => ({
        retailer: o.retailer,
        retailerName: o.retailerName,
        price: o.price,
        landedCost: o.landedCost,
        priceSource: o.priceSource,
        priceNote: o.priceNote,
        productUrl: o.productUrl,
        imageUrl: o.imageUrl,
        title: o.title,
        isBestDeal: o.isBestDeal,
      }));

    return jsonWithExtensionCors(request, {
      page,
      query,
      amazonPaapi: isAmazonPaapiConfigured(),
      matchedProduct: productResults.matchedProduct,
      offers,
      chatUrl: `/chat?q=${encodeURIComponent(query)}`,
    });
  } catch (e) {
    console.error("[extension/compare]", e);
    return jsonWithExtensionCors(
      request,
      { error: "Compare failed" },
      { status: 500 },
    );
  }
}
