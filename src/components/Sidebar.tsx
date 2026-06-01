"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Heart, Settings, LogIn, LogOut, ShieldCheck, ShoppingBag } from "lucide-react";
import { ShopScoutCompareIcon } from "@/components/brand/ShopScoutCompareIcon";
import { Logo } from "./Logo";
import { COMPARE_NAV_LABEL } from "@/lib/constants";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { PUBLIC_SHOPPABLE_STORE_COUNT } from "@/lib/retailers/public-retailers";
import { SIDEBAR_FEATURED_RETAILERS } from "@/lib/retailers/featured-retailers";
import { useAuth } from "@/contexts/AuthContext";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: COMPARE_NAV_LABEL, icon: ShopScoutCompareIcon },
  { href: "/verified", label: "Verified inventory", icon: ShieldCheck },
  { href: "/demo", label: "Demo catalog", icon: ShoppingBag },
  { href: "/saved", label: "Saved deals", icon: Heart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen max-h-[100dvh] w-64 shrink-0 flex-col overflow-hidden self-start border-r border-orange-100/80 bg-cream-50/95 backdrop-blur-xl lg:flex">
      <div className="flex h-full min-h-0 flex-col p-5">
        <div className="shrink-0">
          <Logo showTagline />

          <nav className="mt-8 flex flex-col gap-1">
            {nav.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              const isCompare = href === "/chat";
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? isCompare
                        ? "bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/25"
                        : "bg-ink-800 text-white shadow-md"
                      : "text-ink-600 hover:bg-orange-50/80"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-xl border border-orange-100 bg-white/70 p-3">
            {user ? (
              <>
                <p className="text-xs font-semibold text-ink-800">{user.name}</p>
                <p className="truncate text-[11px] text-ink-400">{user.email}</p>
                <p className="mt-1 text-[11px] text-ink-500">
                  ZIP {user.address.zipCode}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    router.refresh();
                  }}
                  className="mt-2 flex items-center gap-1 text-[11px] font-medium text-ink-600 hover:text-sage-700"
                >
                  <LogOut size={12} /> Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 text-sm font-semibold text-sage-700 hover:text-sage-800"
              >
                <LogIn size={16} /> Sign in / Create account
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-400">
            Top stores we compare
          </p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {SIDEBAR_FEATURED_RETAILERS.map((id) => {
              const r = getRetailerMeta(id);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-orange-100/60"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="truncate text-[11px] font-medium text-ink-700">
                    {r.name}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 shrink-0 text-[10px] leading-snug text-ink-400">
            Verified grocery first · apparel experimental · {PUBLIC_SHOPPABLE_STORE_COUNT}{" "}
            stores
          </p>
        </div>
      </div>
    </aside>
  );
}
