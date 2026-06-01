import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { IndexRetailerRunSummary } from "./index-retailer-summary";
import type { IndexTelemetrySnapshot } from "./index-telemetry";

export interface IndexRunArtifact {
  generatedAt: string;
  report: {
    productsIndexed: number;
    offersWritten: number;
    amazonPaapi: boolean;
    retailersTonight: number;
    totalRetailers: number;
  };
  telemetry: IndexTelemetrySnapshot | null | undefined;
  retailerSummary: IndexRetailerRunSummary;
}

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "ops");
const ARTIFACT_JSON = join(ARTIFACT_DIR, "index-run-latest.json");
const ARTIFACT_MD = join(ARTIFACT_DIR, "index-run-latest.md");

export function indexRunArtifactPath(): string {
  return ARTIFACT_JSON;
}

export async function loadLastIndexRunArtifact(): Promise<IndexRunArtifact | null> {
  if (!existsSync(ARTIFACT_JSON)) return null;
  try {
    const raw = await readFile(ARTIFACT_JSON, "utf8");
    return JSON.parse(raw) as IndexRunArtifact;
  } catch {
    return null;
  }
}

export async function saveIndexRunArtifact(input: {
  report: IndexRunArtifact["report"] & {
    telemetry?: IndexTelemetrySnapshot | null;
    retailerSummary?: IndexRetailerRunSummary;
  };
  retailerSummaryMarkdown: string;
}): Promise<IndexRunArtifact> {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const artifact: IndexRunArtifact = {
    generatedAt: new Date().toISOString(),
    report: {
      productsIndexed: input.report.productsIndexed,
      offersWritten: input.report.offersWritten,
      amazonPaapi: input.report.amazonPaapi,
      retailersTonight: input.report.retailersTonight,
      totalRetailers: input.report.totalRetailers,
    },
    telemetry: input.report.telemetry,
    retailerSummary: input.report.retailerSummary ?? {
      fetchByRetailer: [],
      persistByRetailer: {},
      failureClasses: {
        success: 0,
        blocked: 0,
        empty_parse: 0,
        selector_mismatch: 0,
        anti_bot: 0,
        timeout: 0,
        partial_success: 0,
        no_price_extracted: 0,
      },
      rates: {
        fetchSuccessRate: 0,
        parseSuccessRate: 0,
        verifiedPersistenceRate: 0,
        trustRejectionRate: 0,
      },
      normalizationFailures: 0,
      proxyConfigured: false,
      proxyPoolSize: 0,
    },
  };

  await writeFile(ARTIFACT_JSON, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(ARTIFACT_MD, input.retailerSummaryMarkdown, "utf8");
  return artifact;
}
