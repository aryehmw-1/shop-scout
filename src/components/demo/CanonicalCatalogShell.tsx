"use client";

import { useCallback, useMemo, useState } from "react";
import type { CanonicalCatalogResult } from "@/lib/demo-commerce/canonical/types";
import { CanonicalCatalogHero } from "./CanonicalCatalogHero";
import { CanonicalCatalogClient } from "./CanonicalCatalogClient";

export function CanonicalCatalogShell({ initial }: { initial: CanonicalCatalogResult }) {
  const [heroQuery, setHeroQuery] = useState("");

  const catalog = useMemo(() => {
    if (!heroQuery.trim()) return initial;
    const q = heroQuery.trim().toLowerCase();
    const products = initial.products.filter(
      (p) =>
        p.canonical_title.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.normalized_keywords.some((k) => k.includes(q)),
    );
    return { ...initial, products, total: products.length };
  }, [initial, heroQuery]);

  const onHeroSearch = useCallback((q: string) => {
    setHeroQuery(q);
  }, []);

  return (
    <>
      <CanonicalCatalogHero catalog={initial} onSearch={onHeroSearch} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12">
        <CanonicalCatalogClient initial={catalog} />
      </div>
    </>
  );
}
