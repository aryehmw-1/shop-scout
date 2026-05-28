import { extensionCorsHeaders, jsonWithExtensionCors } from "@/lib/extension/cors";
import { isAmazonPaapiConfigured } from "@/lib/search/providers/amazon-paapi-config";
import { NextResponse } from "next/server";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: extensionCorsHeaders(request),
  });
}

export async function GET(request: Request) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SHOP_SCOUT_PUBLIC_URL?.trim() ||
    "http://localhost:3000";

  return jsonWithExtensionCors(request, {
    appName: "Shop Scout",
    baseUrl: base.replace(/\/$/, ""),
    features: {
      compare: true,
      amazonPaapi: isAmazonPaapiConfigured(),
    },
  });
}
