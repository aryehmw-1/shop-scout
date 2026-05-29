"use client";

import { useCallback, useState } from "react";
import type { ProductOffer } from "@/lib/types";
import { toggleSavedOffer, loadSavedOffers } from "@/lib/storage";
import { addToWatchlist, readWatchlist } from "@/lib/alerts/types";

/** Saved offers + local watchlist hooks (no server alerts yet). */
export function useSavedOffers() {
  const [savedIds, setSavedIds] = useState<Set<string>>(() =>
    new Set(loadSavedOffers().map((o) => o.id)),
  );

  const toggleSave = useCallback((offer: ProductOffer) => {
    const next = toggleSavedOffer(offer);
    setSavedIds(new Set(next.map((o) => o.id)));
  }, []);

  return { savedIds, toggleSave };
}

export function useWatchlist() {
  const [items, setItems] = useState(readWatchlist);

  const watch = useCallback(
    (catalogId: string, title: string, price?: number, imageUrl?: string) => {
      setItems(
        addToWatchlist({
          catalogId,
          title,
          lastSeenPriceUsd: price,
          imageUrl,
          addedAt: new Date().toISOString(),
        }),
      );
    },
    [],
  );

  return { watchlist: items, watchProduct: watch };
}
