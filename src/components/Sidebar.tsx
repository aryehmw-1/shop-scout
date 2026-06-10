"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Heart, LogIn, LogOut, Package, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { APP_NAME } from "@/lib/constants";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const mainNav = [
  { href: "/", label: "Compare", icon: Search },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/saved", label: "Saved", icon: Heart },
];

const STORAGE_KEY = "homivion-sidebar-expanded";

/**
 * Wraps a collapsed-sidebar nav item and shows a label tooltip on hover.
 * Renders the tooltip into document.body via a portal so it can never be
 * clipped by the sidebar's overflow:hidden, and uses the native `title`
 * attribute as a guaranteed fallback.
 */
function NavItem({
  label,
  show,
  className,
  children,
}: {
  label: string;
  show: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <div
      ref={ref}
      title={show ? label : undefined}
      className={`relative ${className ?? ""}`}
      onMouseEnter={() => {
        if (!show) return;
        const rect = ref.current?.getBoundingClientRect();
        if (rect) setPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {show && pos &&
        createPortal(
          <span
            style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
            className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setExpanded(stored === "true");
    setMounted(true);
  }, []);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  if (!mounted) return null;

  return (
    <aside
      className={`sticky top-0 hidden h-screen max-h-[100dvh] shrink-0 flex-col self-start border-r border-stone-300/50 bg-transparent transition-[width] duration-200 ease-in-out lg:flex ${
        expanded ? "w-60" : "w-16"
      }`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden py-5">

        {/* Logo / toggle */}
        <div className={`flex items-center ${expanded ? "px-5" : "justify-center px-0"}`}>
          {expanded ? (
            <>
              {/* Open state: the logo becomes the Homivion wordmark → compare page */}
              <Link
                href="/"
                className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight text-ink-900 transition hover:text-orange-700"
              >
                {APP_NAME}
              </Link>
              {/* Small collapse control so the sidebar can still be closed */}
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                <PanelLeftClose size={18} strokeWidth={2} aria-hidden />
              </button>
            </>
          ) : (
            /* Collapsed: brand mark opens the sidebar. On hover it swaps to an
               "open sidebar" glyph with an "Open Sidebar" tooltip beside it. */
            <NavItem label="Open Sidebar" show>
              <button
                type="button"
                onClick={toggle}
                aria-label="Open sidebar"
                className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-1 transition hover:bg-stone-100"
              >
                <BrandHomeMark size="md" className="group-hover:hidden" />
                <PanelLeftOpen
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                  className="hidden text-orange-600 group-hover:block"
                />
              </button>
            </NavItem>
          )}
        </div>

        {/* Main nav */}
        <nav
          className={`mt-8 flex flex-col gap-1 ${expanded ? "px-3" : "items-center px-2"}`}
          aria-label="Main navigation"
        >
          {/* New chat — resets the live comparison and routes to the compare page */}
          <NavItem label="New chat" show={!expanded} className="w-full">
            <button
              type="button"
              onClick={() => {
                router.push("/chat");
                window.dispatchEvent(new CustomEvent("homivion:new-chat"));
              }}
              className={`flex w-full items-center rounded-xl border border-orange-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 ${
                expanded ? "gap-3" : "justify-center"
              }`}
            >
              <RotateCcw size={18} strokeWidth={2} aria-hidden />
              {expanded && "New chat"}
            </button>
          </NavItem>

          {mainNav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname.startsWith("/chat") || pathname.startsWith("/compare")
                : pathname.startsWith(href);

            return (
              <NavItem key={href} label={label} show={!expanded}>
                <Link
                  href={href}
                  scroll={false}
                  className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    expanded ? "gap-3" : "justify-center"
                  } ${
                    active
                      ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30"
                      : "text-stone-600 hover:bg-white/70 hover:text-stone-950"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} aria-hidden />
                  {expanded && label}
                </Link>
              </NavItem>
            );
          })}
        </nav>

        {/* Promo card — fades in when expanded, doesn't reflow-animate */}
        <div
          className={`mx-3 mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 transition-opacity duration-200 ${
            expanded ? "opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0 p-0 mt-0 border-0"
          }`}
        >
          <p className="text-sm font-bold text-stone-950">Search once. Compare fast.</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            We line up prices from cheapest to highest so the best option is easy to spot.
          </p>
        </div>

        {/* Bottom section */}
        <div className={`mt-auto space-y-3 pt-6 ${expanded ? "px-3" : "flex flex-col items-center px-2"}`}>

          {/* Settings */}
          <NavItem label="Settings" show={!expanded} className="w-full">
            <Link
              href="/settings"
              scroll={false}
              className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                expanded ? "gap-3" : "justify-center"
              } ${
                pathname.startsWith("/settings")
                  ? "bg-orange-50 text-orange-700"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`}
            >
              <Settings size={18} aria-hidden />
              {expanded && "Settings"}
            </Link>
          </NavItem>

          {/* User card / sign in */}
          {expanded ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              {user ? (
                <>
                  <p className="truncate text-sm font-bold text-stone-950">{user.name}</p>
                  <p className="truncate text-xs text-stone-500">{user.email}</p>
                  <button
                    type="button"
                    onClick={async () => { await logout(); router.refresh(); }}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-950"
                  >
                    <LogOut size={15} aria-hidden /> Sign out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-bold text-stone-700 hover:text-stone-950"
                >
                  <LogIn size={16} aria-hidden /> Sign in
                </Link>
              )}
            </div>
          ) : (
            <NavItem label={user ? "Sign out" : "Sign in"} show={!expanded}>
              <button
                type="button"
                onClick={async () => {
                  if (user) { await logout(); router.refresh(); }
                  else router.push("/login");
                }}
                className="flex items-center justify-center rounded-xl px-3 py-2.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
              >
                {user ? <LogOut size={18} aria-hidden /> : <LogIn size={18} aria-hidden />}
              </button>
            </NavItem>
          )}
        </div>
      </div>
    </aside>
  );
}
