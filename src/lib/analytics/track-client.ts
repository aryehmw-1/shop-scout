"use client";

import type { AnalyticsEvent } from "./events";

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

  const payload = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
    sessionId: event.sessionId ?? analyticsSessionId(),
    path: window.location.pathname,
  };

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
