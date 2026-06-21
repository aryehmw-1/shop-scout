"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Heart,
  LogIn,
  LogOut,
  Menu,
  Package,
  RotateCcw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { APP_NAME } from "@/lib/constants";
import { NAV_PRESS, NAV_PRESS_IDLE } from "@/components/Sidebar";

const nav = [
  { href: "/chat", label: "Compare", icon: Search },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/saved", label: "Saved Products", icon: Heart },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile navigation as a slide-in drawer instead of a bottom tab bar. The
 * drawer is closed by default — the user only sees a small menu button in the
 * top-left. Tapping it slides the sidebar in with all the destinations.
 */
export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/chat"
      ? pathname.startsWith("/compare") || pathname.startsWith("/chat") || pathname === "/"
      : pathname.startsWith(href);

  return (
    <div className="lg:hidden">
      {/* Top-left menu button — sits in the reserved top band on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className={`fixed left-3 top-2 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 ring-1 ring-orange-300/80 shadow-[0_2px_8px_rgba(120,80,30,0.18)] hover:bg-orange-200/80 ${NAV_PRESS} active:bg-orange-200`}
      >
        <Menu size={20} strokeWidth={2.2} aria-hidden />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-stone-900/30 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />

      {/* Drawer panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82vw] flex-col border-r border-stone-200 bg-orange-50 shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-ink-900">
            {APP_NAME}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 hover:bg-white/70 hover:text-stone-700 ${NAV_PRESS_IDLE}`}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {/* New chat — starts a fresh comparison, then routes to the compare page */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/chat");
              window.dispatchEvent(new CustomEvent("homivion:new-chat"));
            }}
            className={`mb-1 flex items-center gap-3 rounded-xl border border-orange-200/80 bg-white px-3 py-3 text-[15px] font-semibold text-ink-700 shadow-sm hover:border-orange-300 hover:bg-orange-50 ${NAV_PRESS} active:bg-orange-100`}
          >
            <RotateCcw size={18} strokeWidth={2} aria-hidden />
            New chat
          </button>

          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold ${NAV_PRESS} ${
                  active
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30 active:bg-orange-600"
                    : "text-stone-700 hover:bg-white/70 hover:text-stone-950 active:bg-stone-200/80"
                }`}
              >
                <Icon size={19} strokeWidth={2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: user / auth */}
        <div className="mt-auto border-t border-stone-200/70 px-4 py-4">
          {user ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="truncate text-sm font-bold text-stone-950">{user.name}</p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.refresh();
                }}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-950"
              >
                <LogOut size={15} aria-hidden /> Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-stone-700 hover:bg-white/70 hover:text-stone-950 ${NAV_PRESS_IDLE}`}
            >
              <LogIn size={18} aria-hidden /> Sign in
            </Link>
          )}
          <div className="mt-3 flex items-center gap-2 px-1">
            <BrandHomeMark size="xs" />
            <span className="text-xs text-stone-400">Search once. Compare fast.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
