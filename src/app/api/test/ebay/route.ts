import { ebayProvider, isEbayConfigured } from "@/lib/product-data/ebay";
import { safeProductProviderReason } from "@/lib/product-data/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "cheerios";

  if (!isEbayConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        provider: "ebay",
        configured: false,
        reason: "missing_credentials",
      },
      { status: 503 },
    );
  }

  try {
    const products = await ebayProvider.searchProducts(q);
    return NextResponse.json({
      ok: true,
      provider: "ebay",
      configured: true,
      query: q,
      productCount: products.length,
      offerCount: products.reduce((sum, product) => sum + product.offers.length, 0),
      products: products.slice(0, 8).map((product) => ({
        canonicalProductId: product.canonicalProductId,
        providerProductId: product.providerProductId,
        title: product.title,
        brand: product.brand,
        imageUrl: product.imageUrl,
        category: product.category,
        identifiers: product.identifiers,
        offers: product.offers.map((offer) => ({
          retailer: offer.retailer,
          price: offer.price,
          currency: offer.currency,
          availability: offer.availability,
          productUrl: offer.productUrl,
          seller: offer.seller,
          lastCheckedAt: offer.lastCheckedAt,
          source: offer.source,
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "ebay",
        configured: true,
        query: q,
        reason: safeProductProviderReason(error),
      },
      { status: 502 },
    );
  }
}
