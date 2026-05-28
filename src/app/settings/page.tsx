"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { loadAddress, saveAddress } from "@/lib/storage";
import type { UserAddress } from "@/lib/types";
import { Check, LogOut } from "lucide-react";

export default function SettingsPage() {
  const { user, loading, updateAddress, logout } = useAuth();
  const [address, setAddress] = useState<UserAddress>({
    zipCode: "",
    label: "Home",
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const src = user?.address ?? loadAddress();
    if (src) setAddress({ label: "Home", ...src });
  }, [user]);

  const save = async () => {
    if (address.zipCode.length !== 5) return;
    setSaving(true);
    saveAddress(address);
    if (user) {
      try {
        await updateAddress(address);
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
            <p className="text-stone-600">Your saved location and account</p>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-12">
          <div className="mx-auto max-w-2xl space-y-6">
            {saved && (
              <div className="flex items-center gap-2 rounded-xl bg-sage-50 px-4 py-3 text-sm font-medium text-sage-800">
                <Check size={16} /> Address saved
              </div>
            )}

            <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-stone-800">Saved address</h2>
              <p className="mt-1 text-sm text-stone-500">
                Used for nearby store results. Online row shows everything that
                ships to your ZIP.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-stone-600">ZIP code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={address.zipCode}
                    onChange={(e) =>
                      setAddress((a) => ({
                        ...a,
                        zipCode: e.target.value.replace(/\D/g, "").slice(0, 5),
                      }))
                    }
                    className="mt-1 w-full max-w-[160px] rounded-xl border border-stone-200 px-4 py-2.5 text-lg font-semibold focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-600">Street</span>
                  <input
                    type="text"
                    value={address.street ?? ""}
                    onChange={(e) =>
                      setAddress((a) => ({ ...a, street: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-2.5 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-stone-600">City</span>
                    <input
                      type="text"
                      value={address.city ?? ""}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, city: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-2.5 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-600">State</span>
                    <input
                      type="text"
                      maxLength={2}
                      value={address.state ?? ""}
                      onChange={(e) =>
                        setAddress((a) => ({
                          ...a,
                          state: e.target.value.toUpperCase(),
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-2.5 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={saving || address.zipCode.length !== 5}
                className="mt-6 rounded-xl bg-sage-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save address"}
              </button>
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
                    Your address and saved deals sync to this account.
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
                    Create a free account to save your address on any device.
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
