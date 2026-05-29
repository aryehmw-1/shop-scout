/** Real-time progress logs for nightly / full index jobs. */

export function indexProgressEnabled(): boolean {
  const raw = process.env.INDEX_PROGRESS?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return true;
}

export function indexLog(stage: string, detail?: Record<string, unknown>): void {
  if (!indexProgressEnabled()) return;
  const ts = new Date().toISOString().slice(11, 19);
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[index ${ts}] ${stage}`, detail);
  } else {
    console.log(`[index ${ts}] ${stage}`);
  }
}

/** Always log critical phases (even when INDEX_PROGRESS=off). */
export function indexLogAlways(stage: string, detail?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 19);
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[nightly-index ${ts}] ${stage}`, detail);
  } else {
    console.log(`[nightly-index ${ts}] ${stage}`);
  }
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
