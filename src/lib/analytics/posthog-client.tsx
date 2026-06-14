"use client";

// Browser-side PostHog. Initializes posthog-js once (only when a public key is
// set) and exposes a provider for the root layout plus a capture helper used by
// the client tracker. No-op when unconfigured, so the app runs without PostHog.

import { useEffect } from "react";
import posthog from "posthog-js";

let initialized = false;

function ensureInit(): boolean {
  if (typeof window === "undefined") return false;
  if (initialized) return true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false,
  });
  initialized = true;
  return true;
}

/** Capture an event to PostHog from the browser. Safe no-op when unconfigured. */
export function capturePostHogClient(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!ensureInit()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    /* never break the UI for analytics */
  }
}

/** Associate subsequent events with a known user (call after sign-in/sign-up). */
export function identifyPostHog(userId: string, traits?: Record<string, unknown>): void {
  if (!ensureInit()) return;
  try {
    posthog.identify(userId, traits);
  } catch {
    /* ignore */
  }
}

/** Mount once in the root layout to initialize PostHog on the client. */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureInit();
  }, []);
  return <>{children}</>;
}
