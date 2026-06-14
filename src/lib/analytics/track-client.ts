"use client";

import type { AnalyticsEvent } from "./events";
import { capturePostHogClient } from "./posthog-client";

const SESSION_KEY = "shop-scout:analytics-session";

function analyticsSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Fire-and-forget client analytics — never blocks UI. */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;

  const sessionId = event.sessionId ?? analyticsSessionId();
  const payload = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
    sessionId,
    path: window.location.pathname,
  };

  // Mirror to PostHog from the browser (server also captures via /api/analytics).
  capturePostHogClient(event.name, { ...event.properties, sessionId });

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/analytics",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
  } catch {
    /* fall through */
  }

  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

export function trackPageView(page: string): void {
  trackEvent({ name: "page_view", properties: { page } });
}

export { analyticsSessionId };
