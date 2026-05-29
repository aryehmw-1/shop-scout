import { NextResponse } from "next/server";
import { CATALOG } from "@/lib/retailers/catalog";
import { compareProduct } from "@/lib/retailers/catalog";
import { computeOfferRankScore } from "@/lib/offers/offer-ranking";
import { buildOfferQualityMeta } from "@/lib/offers/offer-quality";
import { isVerifiedOffer, offerTrustTier } from "@/lib/offers/offer-trust";
import { classifyProductUrl } from "@/lib/offers/url-classifier";
import type { ShoppingIntent } from "@/lib/types";

export const dynamic = "force-dynamic";

function adminAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.ADMIN_DEBUG_SECRET?.trim();
  return Boolean(secret);
}

export async function GET(req: Request) {
  if (!adminAllowed()) {
    return NextResponse.json({ error: "Admin debug disabled in production" }, { status: 403 });
  }

  const auth = req.headers.get("authorization");
  const secret = process.env.ADMIN_DEBUG_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const catalogId = searchParams.get("catalogId")?.trim();
  const query = searchParams.get("q")?.trim();
  const zip = searchParams.get("zip")?.trim() || "78701";

  let item = catalogId ? CATALOG.find((c) => c.id === catalogId) : undefined;
  if (!item && query) {
    item = CATALOG.find(
      (c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.id.includes(query.toLowerCase()),
    );
  }
  if (!item) {
    item = CATALOG[0];
  }

  const intent: ShoppingIntent = {
    query: query || item.title,
    category: item.category,
    zipCode: zip,
  };

  const raw = compareProduct(item, intent);
  const offers = [...raw.online, ...raw.local];

  const rows = offers.map((o) => {
    const rank = computeOfferRankScore(o, item!.title);
    const quality = buildOfferQualityMeta(o);
    return {
      retailer: o.retailer,
      channel: o.channel,
      urlKind: classifyProductUrl(o.productUrl),
      productUrl: o.productUrl,
      imageUrl: o.imageUrl,
      imageSource: o.imageSource,
      price: o.price,
      priceSource: o.priceSource,
      priceConfidence: o.priceConfidence ?? quality.priceConfidence,
      matchConfidence: o.matchConfidence,
      identityConfidence: o.identityConfidence,
      attributeConfidence: o.attributeConfidence,
      imageConfidence: o.imageConfidence,
      trustTier: offerTrustTier(o),
      verified: isVerifiedOffer(o),
      rankScore: rank.score,
      rankPenalties: rank.penalties,
      confidenceReasons: o.confidenceReasons ?? [],
      priceNote: o.priceNote,
      storeTitle: o.storeTitle,
    };
  });

  rows.sort((a, b) => b.rankScore - a.rankScore);

  return NextResponse.json({
    catalogId: item.id,
    title: item.title,
    offerCount: rows.length,
    verifiedCount: rows.filter((r) => r.verified).length,
    offers: rows,
  });
}
