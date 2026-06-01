import type { ResponseClassification } from "../net/response-classification";
import type { NavigationLifecycle } from "./navigation-strategy";
import type { WarmupMode } from "./warm-session";

/** Lab outcome bucket for audit comparison and retry policy. */
export type LabFailureKind =
  | "ok"
  | "transport_failure"
  | "proxy_failure"
  | "walmart_challenge"
  | "navigation_timeout"
  | "empty_response"
  | "unknown";

const TUNNEL_RE =
  /ERR_TUNNEL|tunnel connection failed|ERR_PROXY|407|502|503|ECONNREFUSED|ENOTFOUND|proxy/i;
const TIMEOUT_RE = /timeout|goto_timeout|timed out/i;

export function labLog(phase: string, detail?: Record<string, unknown>): void {
  const enabled =
    process.env.RENDERED_LAB_LOG === "1" ||
    process.env.PROXY_DEBUG === "1" ||
    process.env.INDEX_PROXY_DEBUG === "1";
  if (!enabled) return;
  console.log(`[rendered-lab] ${phase}`, detail ?? {});
}

/** Classify a rendered fetch outcome for audit / retry decisions. */
export function classifyLabFailure(input: {
  error?: string;
  classification: ResponseClassification;
  lifecycle?: NavigationLifecycle;
}): LabFailureKind {
  const haystack = [
    input.error ?? "",
    input.classification.reason ?? "",
    input.classification.category ?? "",
    ...(input.lifecycle?.stages ?? []).map((s) => `${s.stage}:${s.note ?? ""}`),
  ].join(" ");

  if (input.classification.ok) return "ok";
  if (input.classification.category === "captcha" || input.classification.category === "js_challenge") {
    return "walmart_challenge";
  }
  if (input.classification.reason === "empty_or_too_short") return "empty_response";
  if (TUNNEL_RE.test(haystack)) return "proxy_failure";
  if (TIMEOUT_RE.test(haystack) || input.lifecycle?.timedOut) return "navigation_timeout";
  if (/transport|browser_launch|not_installed|render_error/i.test(haystack)) return "transport_failure";
  return "unknown";
}

export interface CompareVariantSpec {
  label: string;
  warmup: boolean | "homepage";
}

/** Default pause between compare variants — lets sticky proxy tunnels drain. */
export const COMPARE_VARIANT_COOLDOWN_MS = parseInt(
  process.env.RENDERED_COMPARE_COOLDOWN_MS ?? "5000",
  10,
);

export function isCompareWarmupAllowed(): boolean {
  return process.env.INDEX_ENABLE_COMPARE_WARMUP === "1" || process.env.RENDERED_ALLOW_COMPARE === "1";
}

export function warmupModeLabel(warmup: boolean | "homepage" | undefined): WarmupMode {
  if (warmup === "homepage") return "homepage";
  if (warmup === false) return "none";
  if (warmup === true) return "simple";
  return "none";
}
