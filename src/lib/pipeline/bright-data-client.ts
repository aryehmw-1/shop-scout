import "server-only";

// Universal Bright Data client.
//
// Bright Data exposes the SAME trigger/poll/download flow for every retailer
// dataset (Amazon, Walmart, Target, eBay, …). Only the `dataset_id`, the input
// parameters, and the response shape differ — and those live in the
// `retailer_sources` table, NOT in code. Adding a retailer is a new row, never a
// new client. So there is exactly one client here.

const BASE_URL = "https://api.brightdata.com/datasets/v3";

export interface BrightDataScrapeOptions {
  datasetId: string;
  /** Input rows for the dataset (e.g. [{ url }], [{ keyword }], [{ upc }]). */
  input: Record<string, unknown>[];
  /** Max ms to wait for the snapshot to finish before giving up. */
  timeoutMs?: number;
  /** Poll interval while the snapshot is "running". */
  pollIntervalMs?: number;
}

export interface BrightDataSnapshot {
  snapshotId: string;
  /** Rows exactly as Bright Data returned them — never reshaped here. */
  rows: Record<string, unknown>[];
}

export class BrightDataError extends Error {
  constructor(
    message: string,
    readonly stage: "config" | "trigger" | "poll" | "download",
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrightDataError";
  }
}

function getApiKey(): string {
  const key = process.env.BRIGHT_DATA_API_KEY?.trim();
  if (!key) {
    throw new BrightDataError("BRIGHT_DATA_API_KEY is not configured.", "config");
  }
  return key;
}

export function isBrightDataConfigured(): boolean {
  return Boolean(process.env.BRIGHT_DATA_API_KEY?.trim());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BrightDataClient {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? getApiKey();
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Trigger a dataset run, wait for it to finish, and return the raw rows.
   * Used by the ingestion layer, which then persists rows to
   * `raw_product_records` exactly as received.
   */
  async scrape({
    datasetId,
    input,
    timeoutMs = 180_000,
    pollIntervalMs = 4_000,
  }: BrightDataScrapeOptions): Promise<BrightDataSnapshot> {
    const snapshotId = await this.trigger(datasetId, input);
    await this.waitUntilReady(snapshotId, timeoutMs, pollIntervalMs);
    const rows = await this.download(snapshotId);
    return { snapshotId, rows };
  }

  private async trigger(datasetId: string, input: Record<string, unknown>[]): Promise<string> {
    const res = await fetch(
      `${BASE_URL}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(input) },
    );
    if (!res.ok) {
      throw new BrightDataError(`Trigger failed: ${await safeText(res)}`, "trigger", res.status);
    }
    const data = (await res.json()) as { snapshot_id?: string };
    if (!data.snapshot_id) {
      throw new BrightDataError("Trigger returned no snapshot_id.", "trigger");
    }
    return data.snapshot_id;
  }

  private async waitUntilReady(snapshotId: string, timeoutMs: number, pollIntervalMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await fetch(`${BASE_URL}/progress/${snapshotId}`, { headers: this.headers() });
      if (!res.ok) {
        throw new BrightDataError(`Progress failed: ${await safeText(res)}`, "poll", res.status);
      }
      const { status } = (await res.json()) as { status?: string };
      if (status === "ready") return;
      if (status === "failed") {
        throw new BrightDataError("Snapshot failed.", "poll");
      }
      if (Date.now() > deadline) {
        throw new BrightDataError("Timed out waiting for snapshot.", "poll");
      }
      await sleep(pollIntervalMs);
    }
  }

  private async download(snapshotId: string): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${BASE_URL}/snapshot/${snapshotId}?format=json`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new BrightDataError(`Download failed: ${await safeText(res)}`, "download", res.status);
    }
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Lazily-constructed shared client (null when not configured). */
let _client: BrightDataClient | null | undefined;
export function getBrightDataClient(): BrightDataClient | null {
  if (_client === undefined) {
    _client = isBrightDataConfigured() ? new BrightDataClient() : null;
  }
  return _client;
}
