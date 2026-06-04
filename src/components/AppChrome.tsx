"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";

/** Routes that render without sidebar/mobile nav. */
const BARE_PREFIXES = ["/login", "/signup"];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const bare = BARE_PREFIXES.some((p) => pathname.startsWith(p));
  if (bare) return <>{children}</>;

  const scroll = pathname === "/" || pathname.startsWith("/chat") ? "none" : "page";
  return <AppShell scroll={scroll}>{children}</AppShell>;
}
