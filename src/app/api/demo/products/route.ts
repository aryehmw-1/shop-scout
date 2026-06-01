import { NextResponse } from "next/server";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";
import { filterPublicDemoCatalog } from "@/lib/retailers/public-retailers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = filterPublicDemoCatalog(
    queryDemoCatalog({
      q: searchParams.get("q") ?? undefined,
      retailer: searchParams.get("retailer") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      validOnly: searchParams.get("validOnly") === "1",
    }),
  );

  return NextResponse.json(result);
}
