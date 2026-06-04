import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RetailerId } from "../types";
import type { ResponseClassification } from "../net/response-classification";
import type { FetchMethod } from "./fetch-strategy";

/**
 * Persist diagnostic artifacts for failed / blocked retailer fetches so we can
 * debug anti-bot behavior offline: raw HTML, status + headers, the structured
 * classification (challenge type / vendor / indicators), and optionally a
 * challenge-page screenshot when a rendered (Playwright) fetch was used.
 *
 * Default: capture blocked/failed responses only. Override with:
 *   INDEX_EXTRACTION_ARTIFACTS=0     -> disable entirely
 *   INDEX_EXTRACTION_ARTIFACTS=all   -> capture successes too (verbose)
 */
const ARTIFACT_ROOT = join(/* turbopackIgnore: true */ process.cwd(), "artifacts", "extraction");
const MAX_HTML_BYTES = 600_000;

export interface ExtractionArtifactInput {
  retailerId: RetailerId;
  url: string;
  status: number;
  html: string;
  classification: ResponseClassification;
  headers?: Record<string, string> | Headers;
  method?: FetchMethod;
  proxyUsed?: boolean;
  proxyEndpoint?: string;
  attempt?: number;
  screenshot?: Buffer;
  /** Rendered-session evidence (challenge vault). */
  behavior?: string;
  transport?: string;
  identity?: unknown;
  coherence?: unknown;
  geoCountry?: string;
  renderedDom?: string;
  har?: string;
  redirectChain?: string[];
  realism?: unknown;
  realismScores?: unknown;
  lifecycle?: unknown;
  warmupMode?: string;
}

function captureMode(): "off" | "blocked" | "all" {
  const v = process.env.INDEX_EXTRACTION_ARTIFACTS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return "off";
  if (v === "all" || v === "verbose") return "all";
  return "blocked";
}

function headersToObject(headers?: Record<string, string> | Headers): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = key.toLowerCase() === "set-cookie" ? summarizeCookies(value) : value;
    });
    return out;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k.toLowerCase() === "set-cookie" ? summarizeCookies(v) : v;
  }
  return out;
}

/** Keep cookie names (akamai/datadome fingerprints matter) but drop values. */
function summarizeCookies(raw: string): string {
  return raw
    .split(/,(?=[^;]+=)/)
    .map((c) => c.split("=")[0]?.trim())
    .filter(Boolean)
    .join(", ");
}

function safeSegment(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
}

/**
 * @returns the artifact directory path written, or null if capture was skipped.
 */
export async function saveExtractionArtifact(
  input: ExtractionArtifactInput,
): Promise<string | null> {
  const mode = captureMode();
  if (mode === "off") return null;
  if (mode === "blocked" && input.classification.ok) return null;

  const ts = new Date().toISOString();
  const runId = `${ts.replace(/[:.]/g, "-")}-${safeSegment(input.classification.reason)}`;
  const dir = join(ARTIFACT_ROOT, input.retailerId, runId);

  try {
    await mkdir(dir, { recursive: true });

    const meta = {
      timestamp: ts,
      retailerId: input.retailerId,
      url: input.url,
      status: input.status,
      method: input.method,
      behavior: input.behavior,
      transport: input.transport,
      identity: input.identity,
      coherence: input.coherence,
      geoCountry: input.geoCountry,
      proxyUsed: input.proxyUsed ?? false,
      proxyEndpoint: input.proxyEndpoint,
      attempt: input.attempt,
      classification: input.classification,
      headers: headersToObject(input.headers),
      htmlBytes: Buffer.byteLength(input.html, "utf8"),
      redirectChain: input.redirectChain,
      realism: input.realism,
      realismScores: input.realismScores,
      lifecycle: input.lifecycle,
      warmupMode: input.warmupMode,
      screenshotSaved: Boolean(input.screenshot),
      harSaved: Boolean(input.har),
      renderedDomSaved: Boolean(input.renderedDom),
    };

    await writeFile(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await writeFile(join(dir, "page.html"), input.html.slice(0, MAX_HTML_BYTES), "utf8");
    if (input.screenshot) {
      await writeFile(join(dir, "challenge.png"), input.screenshot);
    }
    if (input.renderedDom) {
      await writeFile(join(dir, "rendered-dom.html"), input.renderedDom.slice(0, MAX_HTML_BYTES), "utf8");
    }
    if (input.har) {
      await writeFile(join(dir, "network.har"), input.har, "utf8");
    }

    // Append a flat index line for quick scanning / dashboards.
    await appendFile(
      join(ARTIFACT_ROOT, "index.jsonl"),
      `${JSON.stringify({
        timestamp: ts,
        retailerId: input.retailerId,
        category: input.classification.category,
        reason: input.classification.reason,
        vendor: input.classification.vendor ?? null,
        status: input.status,
        proxyUsed: input.proxyUsed ?? false,
        method: input.method ?? null,
        behavior: input.behavior ?? null,
        dir,
      })}\n`,
      "utf8",
    );

    if (process.env.PIPELINE_DEBUG === "1" || process.env.INDEX_FETCH_LOG === "1") {
      console.warn(
        `[extraction-artifact] ${input.retailerId} ${input.classification.reason} -> ${dir}`,
      );
    }
    return dir;
  } catch (e) {
    if (process.env.PIPELINE_DEBUG === "1") {
      console.warn("[extraction-artifact] failed to write", String(e).slice(0, 120));
    }
    return null;
  }
}

export function extractionArtifactRoot(): string {
  return ARTIFACT_ROOT;
}

export interface ExtractionArtifactIndexEntry {
  timestamp: string;
  retailerId: RetailerId;
  category: string;
  reason: string;
  vendor: string | null;
  status: number;
  proxyUsed: boolean;
  method: string | null;
  dir: string;
}

/** Most recent captured block/failure artifacts (newest first). */
export async function recentExtractionArtifacts(
  limit = 50,
): Promise<ExtractionArtifactIndexEntry[]> {
  try {
    const raw = await readFile(join(ARTIFACT_ROOT, "index.jsonl"), "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const parsed = lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l) as ExtractionArtifactIndexEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is ExtractionArtifactIndexEntry => e !== null);
    return parsed.reverse();
  } catch {
    return [];
  }
}

/** Aggregate recent blocks by reason + by retailer for dashboards. */
export async function extractionBlockSummary(limit = 200): Promise<{
  total: number;
  byReason: Record<string, number>;
  byRetailer: Record<string, number>;
  byVendor: Record<string, number>;
}> {
  const entries = await recentExtractionArtifacts(limit);
  const byReason: Record<string, number> = {};
  const byRetailer: Record<string, number> = {};
  const byVendor: Record<string, number> = {};
  for (const e of entries) {
    byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
    byRetailer[e.retailerId] = (byRetailer[e.retailerId] ?? 0) + 1;
    if (e.vendor) byVendor[e.vendor] = (byVendor[e.vendor] ?? 0) + 1;
  }
  return { total: entries.length, byReason, byRetailer, byVendor };
}
