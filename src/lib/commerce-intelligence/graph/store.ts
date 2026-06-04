import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CommerceIntelligenceGraph } from "./types";
import { recomputeExistingGraph } from "../confidence/recompute-graph";
import { invalidatePublishedGraphCache } from "../retrieval/graph-query-cache";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import { mapGraphToDemoCanonical } from "./map-to-demo";
import { intelligenceGraphDir } from "../storage-root";

const GRAPH_DIR = intelligenceGraphDir();
const INDEX_FILE = join(GRAPH_DIR, "index.json");
const PRODUCTS_DIR = join(GRAPH_DIR, "products");
const REPORT_FILE = join(GRAPH_DIR, "last-ingest-report.json");

export interface GraphIndex {
  version: 1;
  updated_at: string;
  canonical_ids: string[];
  by_identifier: Record<string, string>;
}

let indexCache: { mtime: number; index: GraphIndex } | null = null;

function ensureDirs(): void {
  mkdirSync(PRODUCTS_DIR, { recursive: true });
}

function loadIndex(): GraphIndex {
  let mtime = 0;
  if (existsSync(INDEX_FILE)) mtime = statSync(INDEX_FILE).mtimeMs;
  if (!indexCache || indexCache.mtime !== mtime) {
    if (!existsSync(INDEX_FILE)) {
      indexCache = {
        mtime,
        index: { version: 1, updated_at: new Date(0).toISOString(), canonical_ids: [], by_identifier: {} },
      };
    } else {
      try {
        indexCache = {
          mtime,
          index: JSON.parse(readFileSync(INDEX_FILE, "utf8")) as GraphIndex,
        };
      } catch {
        indexCache = {
          mtime,
          index: { version: 1, updated_at: new Date(0).toISOString(), canonical_ids: [], by_identifier: {} },
        };
      }
    }
  }
  return indexCache.index;
}

function saveIndex(index: GraphIndex): void {
  ensureDirs();
  index.updated_at = new Date().toISOString();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  indexCache = { mtime: statSync(INDEX_FILE).mtimeMs, index };
}

function graphPath(canonicalId: string): string {
  return join(PRODUCTS_DIR, `${canonicalId}.json`);
}

export function loadGraph(canonicalId: string): CommerceIntelligenceGraph | null {
  const path = graphPath(canonicalId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CommerceIntelligenceGraph;
  } catch {
    return null;
  }
}

export function saveGraph(graph: CommerceIntelligenceGraph): void {
  ensureDirs();
  const id = graph.canonical.canonical_id;
  writeFileSync(graphPath(id), JSON.stringify(graph, null, 2));
  invalidatePublishedGraphCache();

  const index = loadIndex();
  if (!index.canonical_ids.includes(id)) {
    index.canonical_ids.push(id);
  }
  const ids = graph.canonical.identifiers;
  if (ids.gtin) index.by_identifier[`gtin:${ids.gtin}`] = id;
  if (ids.upc) index.by_identifier[`upc:${ids.upc}`] = id;
  if (ids.asin) index.by_identifier[`asin:${ids.asin}`] = id;
  saveIndex(index);
}

export function resolveCanonicalIdFromIndex(identifiers: {
  gtin?: string;
  upc?: string;
  asin?: string;
}): string | null {
  const index = loadIndex();
  if (identifiers.gtin && index.by_identifier[`gtin:${identifiers.gtin}`]) {
    return index.by_identifier[`gtin:${identifiers.gtin}`]!;
  }
  if (identifiers.upc && index.by_identifier[`upc:${identifiers.upc}`]) {
    return index.by_identifier[`upc:${identifiers.upc}`]!;
  }
  if (identifiers.asin && index.by_identifier[`asin:${identifiers.asin}`]) {
    return index.by_identifier[`asin:${identifiers.asin}`]!;
  }
  return null;
}

export function listGraphIds(): string[] {
  return loadIndex().canonical_ids;
}

export function loadAllGraphs(): CommerceIntelligenceGraph[] {
  const graphs: CommerceIntelligenceGraph[] = [];
  for (const id of listGraphIds()) {
    const g = loadGraph(id);
    if (g) graphs.push(g);
  }
  return graphs;
}

/** Published graphs: ≥2 validated offers, real image, identity confidence floor. */
export function loadPublishedGraphs(minIdentity = 0.45): CommerceIntelligenceGraph[] {
  return loadAllGraphs().filter((g) => {
    const validated = g.offers.filter((o) => o.validation_status === "validated");
    return (
      validated.length >= 2 &&
      Boolean(g.canonical.canonical_image?.startsWith("http")) &&
      g.identity_confidence.overall >= minIdentity
    );
  });
}

export function recomputeAndSaveGraph(canonicalId: string): CommerceIntelligenceGraph | null {
  const graph = loadGraph(canonicalId);
  if (!graph) return null;
  const rebuilt = recomputeExistingGraph(graph);
  saveGraph(rebuilt);
  return rebuilt;
}

export function saveIngestReport(report: unknown): void {
  ensureDirs();
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

export function syncPublishedGraphsToDemoCatalog(): CanonicalProduct[] {
  const published = loadPublishedGraphs();
  const products = published.map(mapGraphToDemoCanonical);
  const outPath = join(/* turbopackIgnore: true */ process.cwd(), "data", "canonical-products.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      { version: 1, updatedAt: new Date().toISOString(), products },
      null,
      2,
    ),
  );
  return products;
}

export function getGraphStorePaths() {
  return { GRAPH_DIR, INDEX_FILE, PRODUCTS_DIR, REPORT_FILE };
}
