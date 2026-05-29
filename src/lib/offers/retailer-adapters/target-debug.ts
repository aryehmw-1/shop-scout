import { extractNextData, extractScriptJsonById, collectObjects } from "./html-json";

export interface TargetParseDiagnostics {
  htmlLength: number;
  hasNextData: boolean;
  hasTgtData: boolean;
  tcinMatches: number;
  priceHints: string[];
  jsonLdProducts: number;
  sampleTcin?: string;
  samplePrice?: number;
}

export function diagnoseTargetHtml(html: string): TargetParseDiagnostics {
  const next = extractNextData(html);
  const tgt = extractScriptJsonById(html, "__TGT_DATA__");
  const tcins = [...html.matchAll(/"tcin"\s*:\s*"?(\d{6,})"?/gi)].map((m) => m[1]);
  const priceHints: string[] = [];
  const retail = html.match(/"current_retail"\s*:\s*([\d.]+)/);
  if (retail?.[1]) priceHints.push(`current_retail=${retail[1]}`);
  const formatted = html.match(/"formatted_current_price"\s*:\s*"([^"\\]+)"/);
  if (formatted?.[1]) priceHints.push(`formatted=${formatted[1]}`);
  const reg = html.match(/"reg_retail"\s*:\s*([\d.]+)/);
  if (reg?.[1]) priceHints.push(`reg_retail=${reg[1]}`);

  let jsonLdProducts = 0;
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const j = JSON.parse(block[1]!) as unknown;
      const products = collectObjects(
        j,
        (o) => String(o["@type"] ?? "").toLowerCase().includes("product"),
        5,
      );
      jsonLdProducts += products.length;
    } catch {
      /* skip */
    }
  }

  const withPrice = collectObjects(
    next ?? tgt,
    (o) => typeof o.tcin === "string" || typeof o.tcin === "number",
    5,
  );

  return {
    htmlLength: html.length,
    hasNextData: Boolean(next),
    hasTgtData: Boolean(tgt),
    tcinMatches: tcins.length,
    priceHints,
    jsonLdProducts,
    sampleTcin: tcins[0],
    samplePrice: retail?.[1] ? parseFloat(retail[1]) : undefined,
  };
}

export function logTargetParseDiagnostics(
  pageUrl: string,
  html: string,
  hit: { priceUsd?: number; pdpUrl?: string } | null,
): void {
  if (process.env.TARGET_ADAPTER_DEBUG !== "1" && process.env.PIPELINE_DEBUG !== "1") {
    return;
  }
  const d = diagnoseTargetHtml(html);
  console.log("[target-adapter-debug]", {
    url: pageUrl.slice(0, 90),
    hit: hit ? { price: hit.priceUsd, pdp: hit.pdpUrl?.slice(0, 60) } : null,
    ...d,
  });
}
