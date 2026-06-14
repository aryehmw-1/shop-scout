import "server-only";

// Server-side PostHog capture. Lazily constructs a single posthog-node client
// from env. A no-op when POSTHOG_KEY is unset, so the app runs fine without
// PostHog configured (DB analytics still work).

import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./events";

let _client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (_client === undefined) {
    const key = process.env.POSTHOG_KEY?.trim() || process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
    const host =
      process.env.POSTHOG_HOST?.trim() ||
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
      "https://us.i.posthog.com";
    _client = key ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 }) : null;
  }
  return _client;
}

export function isPostHogConfigured(): boolean {
  return getClient() !== null;
}

/** Capture an event server-side. distinctId is the user id when known, else the
 *  session id, else "anonymous". Best-effort; never throws. */
export async function capturePostHogServer(
  event: AnalyticsEvent,
  ctx: { userId?: string; sessionId?: string },
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const distinctId = ctx.userId || ctx.sessionId || "anonymous";
    client.capture({
      distinctId,
      event: event.name,
      properties: {
        ...event.properties,
        sessionId: ctx.sessionId,
        $process_person_profile: Boolean(ctx.userId),
      },
    });
    await client.flush();
  } catch (e) {
    console.error("[analytics.posthog-server] capture failed", event.name, e);
  }
}
