"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function HomeRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Only auto-redirect once, and only on the very first load
    // (not when the user navigates back to "/" intentionally)
    if (!loading && user && !hasRedirected.current) {
      // Check if this page was reached by direct navigation or a link from within the app.
      // If there's history (user came from somewhere else), don't forcibly redirect —
      // let them stay on the home page.
      const fromExternalOrDirect = document.referrer === "" || !document.referrer.includes(window.location.hostname);
      if (fromExternalOrDirect) {
        hasRedirected.current = true;
        router.replace("/chat");
      }
    }
  }, [user, loading, router]);

  return null;
}
