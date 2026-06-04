import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { intelligenceApiHeaders } from "./api-headers";

export interface IntelligenceApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

const RATE_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function createRequestId(): string {
  return `iq_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "anonymous";
}

export function checkRateLimit(
  req: Request,
  opts: { limit: number; namespace: string },
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const key = `${opts.namespace}:${clientKey(req)}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > opts.limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function intelligenceErrorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number,
): NextResponse<IntelligenceApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, requestId } },
    {
      status,
      headers: {
        ...Object.fromEntries(new Headers(intelligenceApiHeaders())),
        "X-Request-Id": requestId,
      },
    },
  );
}

export function intelligenceJsonResponse<T>(
  data: T,
  requestId: string,
  init?: { status?: number },
): NextResponse<T> {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      ...Object.fromEntries(new Headers(intelligenceApiHeaders())),
      "X-Request-Id": requestId,
    },
  });
}

export type IntelligenceRouteHandler = (ctx: {
  req: Request;
  requestId: string;
}) => Promise<NextResponse> | NextResponse;

export function withIntelligenceApi(
  handler: IntelligenceRouteHandler,
  opts?: { rateLimit?: number; namespace?: string },
): (req: Request, routeCtx?: unknown) => Promise<NextResponse> {
  const limit = opts?.rateLimit ?? 90;
  const namespace = opts?.namespace ?? "intelligence";

  return async (req: Request) => {
    const incoming = req.headers.get("x-request-id")?.trim();
    const requestId = incoming && incoming.length <= 64 ? incoming : createRequestId();

    const rate = checkRateLimit(req, { limit, namespace });
    if (!rate.allowed) {
      return intelligenceErrorResponse(
        "rate_limited",
        "Too many requests. Please try again shortly.",
        requestId,
        429,
      );
    }

    try {
      return await handler({ req, requestId });
    } catch (e) {
      console.error("[intelligence-api]", requestId, e);
      return intelligenceErrorResponse(
        "internal_error",
        "Intelligence request failed. Deterministic catalog data may still be available.",
        requestId,
        500,
      );
    }
  };
}
