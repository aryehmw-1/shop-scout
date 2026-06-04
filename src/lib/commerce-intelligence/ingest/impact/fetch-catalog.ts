/**
 * Optional Impact catalog download (requires IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN).
 * Quality-first: single catalog fetch, not bulk marketplace crawl.
 */
export async function fetchImpactCatalogText(opts: {
  catalogId: string;
}): Promise<string> {
  const sid = process.env.IMPACT_ACCOUNT_SID?.trim();
  const token = process.env.IMPACT_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error(
      "IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN required for --use-api (or pass --file=)",
    );
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.impact.com/Mediapartners/${sid}/Catalogs/${encodeURIComponent(opts.catalogId)}/Items?PageSize=5000`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "text/csv, text/plain, application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Impact catalog fetch failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (contentType.includes("json")) {
    try {
      const data = JSON.parse(body) as { Items?: Record<string, unknown>[] };
      return itemsJsonToMerchantTsv(data.Items ?? []);
    } catch {
      throw new Error("Impact API returned JSON but could not parse Items array");
    }
  }

  return body;
}

function itemsJsonToMerchantTsv(items: Record<string, unknown>[]): string {
  const headers = [
    "id",
    "title",
    "description",
    "link",
    "image_link",
    "availability",
    "price",
    "sale_price",
    "brand",
    "gtin",
    "mpn",
    "google_product_category",
  ];
  const lines = [headers.join("\t")];
  for (const item of items) {
    const row = headers.map((h) => String(item[h] ?? item[h.replace("_", "")] ?? "").replace(/\t/g, " "));
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}
