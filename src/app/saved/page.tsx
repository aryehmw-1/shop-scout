"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { loadSavedOffers, toggleSavedOffer } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import type { ProductOffer } from "@/lib/types";
import { Heart, MessageCircle } from "lucide-react";

export default function SavedPage() {
  const { user, syncSavedOffers } = useAuth();
  const [offers, setOffers] = useState<ProductOffer[]>([]);

  useEffect(() => {
    setOffers(user?.savedOffers ?? loadSavedOffers());
  }, [user]);

  const handleSave = (id: string) => {
    const offer = offers.find((o) => o.id === id);
    if (!offer) return;
    const next = toggleSavedOffer(offer);
    setOffers(next);
    syncSavedOffers(next);
  };

  return (
    
      <div className="flex flex-1 flex-col">
        <header className="border-b border-stone-200/60 bg-white/80 px-6 py-8 lg:px-12">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <Heart className="text-red-400" fill="currentColor" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Saved deals</h1>
              <p className="text-stone-600">
                Your favorite finds, ready when you are
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-12">
          <div className="mx-auto max-w-4xl">
            {offers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white/80 py-20 text-center">
                <Heart className="mx-auto text-stone-300" size={48} />
                <p className="mt-4 text-lg font-medium text-stone-700">
                  No saved deals yet
                </p>
                <p className="mt-2 text-stone-500">
                  Tap the heart on any product while shopping to save it here.
                </p>
                <Link
                  href="/chat"
                  className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-sage-600 px-6 py-3 font-semibold text-white hover:bg-sage-700"
                >
                  <MessageCircle size={18} />
                  Start shopping
                </Link>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {offers.map((offer) => (
                  <ProductCard
                    key={offer.id}
                    offer={offer}
                    onSave={handleSave}
                    saved
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    
  );
}
