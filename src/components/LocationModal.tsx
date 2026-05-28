"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { saveAddress, loadAddress } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import type { UserAddress } from "@/lib/types";

interface LocationModalProps {
  onComplete: (address: UserAddress) => void;
  onDismiss?: () => void;
}

export function LocationModal({ onComplete, onDismiss }: LocationModalProps) {
  const { user, updateAddress } = useAuth();
  const existing = loadAddress();

  const [zip, setZip] = useState(existing?.zipCode ?? user?.address.zipCode ?? "");
  const [street, setStreet] = useState(existing?.street ?? user?.address.street ?? "");
  const [city, setCity] = useState(existing?.city ?? user?.address.city ?? "");
  const [state, setState] = useState(existing?.state ?? user?.address.state ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.address) {
      setZip(user.address.zipCode);
      setStreet(user.address.street ?? "");
      setCity(user.address.city ?? "");
      setState(user.address.state ?? "");
    }
  }, [user]);

  const submit = async () => {
    const cleaned = zip.replace(/\D/g, "").slice(0, 5);
    if (cleaned.length !== 5) {
      setError("Please enter a valid 5-digit US ZIP code");
      return;
    }

    const address: UserAddress = {
      zipCode: cleaned,
      street: street.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      label: "Home",
    };

    setSaving(true);
    saveAddress(address);

    if (user) {
      try {
        await updateAddress(address);
      } catch {
        setError("Could not sync to account — saved on this device.");
      }
    }

    setSaving(false);
    onComplete(address);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm">
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto animate-fade-in rounded-3xl border border-stone-200 bg-white p-8 shadow-2xl"
        role="dialog"
        aria-labelledby="location-title"
      >
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-4 top-4 rounded-full p-2 text-stone-400 hover:bg-stone-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        )}

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
          <MapPin size={28} />
        </div>

        <h2
          id="location-title"
          className="mt-5 text-center text-xl font-bold text-stone-900"
        >
          Save your location
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-stone-600">
          We&apos;ll remember this for **nearby stores** and **online shipping**
          to you. {user ? "Synced to your account." : "Create an account to sync across devices."}
        </p>

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-stone-700">ZIP code *</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="e.g. 78701"
              value={zip}
              onChange={(e) => {
                setZip(e.target.value.replace(/\D/g, "").slice(0, 5));
                setError("");
              }}
              className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 text-center text-xl font-bold tracking-widest focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              maxLength={5}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Street (optional)</span>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-stone-700">City</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-stone-700">State</span>
              <input
                type="text"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="mt-2 text-center text-sm text-red-600">{error}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-6 w-full rounded-2xl bg-sage-600 py-3.5 font-semibold text-white transition hover:bg-sage-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & start shopping"}
        </button>
      </div>
    </div>
  );
}
