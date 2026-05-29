"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { applyTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { loadAddress, loadPreferences, saveAddress, savePreferences } from "@/lib/storage";
import { isValidUsZip, normalizeZip, zipOnlyAddress } from "@/lib/location/zip-only";
import { THEME_PRESETS, type ThemeId } from "@/lib/theme/presets";
import type { UserAddress } from "@/lib/types";
import { Check, LogOut } from "lucide-react";

export default function SettingsPage() {
  const { user, loading, updateAddress, logout } = useAuth();
  const [address, setAddress] = useState<UserAddress>(zipOnlyAddress(""));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("warm");

  useEffect(() => {
    const src = user?.address ?? loadAddress();
    if (src?.zipCode) setAddress(zipOnlyAddress(src.zipCode, src.label));
    const prefs = loadPreferences();
    if (prefs.colorTheme) setTheme(prefs.colorTheme);
  }, [user]);

  const pickTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, colorTheme: id });
  };

  const save = async () => {
    if (!isValidUsZip(address.zipCode)) return;
    setSaving(true);
    const zipOnly = zipOnlyAddress(address.zipCode);
    saveAddress(zipOnly);
    if (user) {
      try {
        await updateAddress(zipOnly);
      } catch {
        /* local save ok */
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppShell>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-stone-200/60 bg-white/80 px-6 py-8 lg:px-12">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
            <p className="text-stone-600">ZIP for shipping estimates · account · appearance</p>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-12">
          <div className="mx-auto max-w-2xl space-y-6">
            {saved && (
              <div className="flex items-center gap-2 rounded-xl bg-sage-50 px-4 py-3 text-sm font-medium text-sage-800">
                <Check size={16} /> ZIP saved
              </div>
            )}

            <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-stone-800">Shipping region (ZIP only)</h2>
              <p className="mt-1 text-sm text-stone-500">
                Used for approximate shipping context when comparing online prices. No street
                address is stored or requested.
              </p>

              <div className="mt-4">
                <label className="block">
                  <span className="text-sm font-medium text-stone-600">ZIP code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={address.zipCode}
                    onChange={(e) =>
                      setAddress(zipOnlyAddress(normalizeZip(e.target.value)))
                    }
                    className="mt-1 w-full max-w-[160px] rounded-xl border border-stone-200 px-4 py-2.5 text-lg font-semibold focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={saving || !isValidUsZip(address.zipCode)}
                className="mt-6 rounded-xl bg-sage-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save ZIP"}
              </button>
            </section>

            <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-stone-800">Screen color</h2>
              <p className="mt-1 text-sm text-stone-500">
                Pick a background accent for the app. Saved on this device.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => pickTheme(preset.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      theme === preset.id
                        ? "border-sage-600 bg-sage-50 text-sage-900 ring-2 ring-sage-300"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-black/10 shadow-inner"
                      style={{ background: preset.swatch }}
                      aria-hidden
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-stone-800">Account</h2>
              {loading ? (
                <p className="mt-2 text-sm text-stone-500">Loading…</p>
              ) : user ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-stone-600">
                    Signed in as <strong>{user.name}</strong> ({user.email})
                  </p>
                  <p className="text-xs text-stone-500">
                    ZIP and saved deals sync to this account.
                  </p>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-stone-600">
                    Create a free account to save your ZIP and deals on any device.
                  </p>
                  <div className="flex gap-3">
                    <Link
                      href="/signup"
                      className="rounded-xl bg-sage-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sage-700"
                    >
                      Create account
                    </Link>
                    <Link
                      href="/login"
                      className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </AppShell>
  );
}
