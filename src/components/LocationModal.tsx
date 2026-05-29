"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { saveAddress, loadAddress } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { isValidUsZip, normalizeZip, zipOnlyAddress } from "@/lib/location/zip-only";
import type { UserAddress } from "@/lib/types";

interface LocationModalProps {
  onComplete: (address: UserAddress) => void;
  onDismiss?: () => void;
}

export function LocationModal({ onComplete, onDismiss }: LocationModalProps) {
  const { user, updateAddress } = useAuth();
  const existing = loadAddress();

  const [zip, setZip] = useState(existing?.zipCode ?? user?.address.zipCode ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.address?.zipCode) {
      setZip(user.address.zipCode);
    }
  }, [user]);

  const submit = async () => {
    const cleaned = normalizeZip(zip);
    if (!isValidUsZip(cleaned)) {
      setError("Please enter a valid 5-digit US ZIP code");
      return;
    }

    const address = zipOnlyAddress(cleaned);

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
          Your ZIP code
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-stone-600">
          We only ask for your <strong>ZIP</strong> — used for regional shipping estimates when
          comparing online prices. We never collect your street address or precise location.
        </p>

        <div className="mt-6">
          <label className="block">
            <span className="text-sm font-medium text-stone-700">ZIP code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="e.g. 78701"
              value={zip}
              onChange={(e) => {
                setZip(normalizeZip(e.target.value));
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 text-center text-xl font-bold tracking-widest focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              maxLength={5}
            />
          </label>
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
          {saving ? "Saving…" : "Save ZIP & continue"}
        </button>
      </div>
    </div>
  );
}
