"use client";

import { useCallback, useMemo, useState } from "react";
import type { DemoCatalogResult } from "@/lib/demo-commerce/types";
import { DemoCatalogHero } from "./DemoCatalogHero";
import { DemoCatalogClient } from "./DemoCatalogClient";

export function DemoCatalogShell({ initial }: { initial: DemoCatalogResult }) {
  const [heroQuery, setHeroQuery] = useState("");

  const catalog = useMemo(() => {
    if (!heroQuery.trim()) return initial;
    const q = heroQuery.trim().toLowerCase();
    const products = initial.products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.retailer.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q),
    );
    return { ...initial, products, total: products.length };
  }, [initial, heroQuery]);

  const onHeroSearch = useCallback((q: string) => {
    setHeroQuery(q);
  }, []);

  return (
    <>
      <DemoCatalogHero catalog={initial} onSearch={onHeroSearch} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12">
        <DemoCatalogClient initial={catalog} />
      </div>
    </>
  );
}
