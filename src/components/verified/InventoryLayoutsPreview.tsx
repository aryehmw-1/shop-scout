"use client";

// PREVIEW-ONLY: renders the same inventory products in 4 compact layout variants
// so we can compare them on localhost (/inventory/layouts) before changing the
// real /inventory page. Each variant shows the same info (image, name, price,
// retailer) and a clear "go to store" action plus Compare.

import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";
import type { VerifiedBrowseResult } from "@/lib/inventory/verified-inventory-browse";
import { affiliateSafeDestination } from "@/lib/affiliate/outbound";
import type { RetailerId } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";

type Product = VerifiedBrowseResult["products"][number];

function priceLabel(p: Product): string {
  return p.minPrice === p.maxPrice
    ? formatPrice(p.minPrice)
    : `${formatPrice(p.minPrice)}–${formatPrice(p.maxPrice)}`;
}
function storeHref(p: Product): string | null {
  return affiliateSafeDestination(p.bestQuote.retailerId as RetailerId, p.bestQuote.productUrl);
}
function compareHref(p: Product): string {
  return `/chat?q=${encodeURIComponent(`${p.brand} ${p.title}`)}`;
}

function Frame({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <h2 className="text-sm font-bold text-stone-900">{title}</h2>
      <p className="mb-2 text-xs text-stone-500">{blurb}</p>
      <div className="mx-auto w-[390px] max-w-full overflow-hidden rounded-[2rem] border-8 border-stone-900 bg-cream-50 p-3 shadow-xl">
        <div className="max-h-[680px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── Variant A: dense 2-col grid (smaller cards, store icon on image) ──────────
function VariantA({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((p) => {
        const dest = storeHref(p);
        return (
          <article key={p.catalogId} className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="relative aspect-square bg-stone-50">
              <ProductImage src={p.imageUrl} alt={p.title} className="h-full w-full object-contain p-1.5" />
              {dest && (
                <a href={dest} target="_blank" rel="noopener noreferrer sponsored"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sage-700 shadow ring-1 ring-stone-200"
                  aria-label="Go to store">
                  <Store size={14} />
                </a>
              )}
            </div>
            <div className="flex flex-1 flex-col p-2">
              <h3 className="line-clamp-2 text-[12px] font-semibold leading-tight text-stone-900">{p.brand} {p.title}</h3>
              <p className="mt-1 text-sm font-bold text-sage-800">{priceLabel(p)}</p>
              <p className="truncate text-[10px] text-stone-400">{p.retailers.join(", ")}</p>
              <Link href={compareHref(p)} className="mt-1.5 rounded-lg bg-sage-700 py-1 text-center text-[11px] font-semibold text-white">Compare</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Variant B: horizontal list rows (thumbnail | info | side store button) ────
function VariantB({ items }: { items: Product[] }) {
  return (
    <div className="space-y-2">
      {items.map((p) => {
        const dest = storeHref(p);
        return (
          <article key={p.catalogId} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-50">
              <ProductImage src={p.imageUrl} alt={p.title} className="h-full w-full object-contain p-1" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-[13px] font-semibold text-stone-900">{p.brand} {p.title}</h3>
              <p className="text-sm font-bold text-sage-800">{priceLabel(p)} <span className="text-[10px] font-normal text-stone-400">· {p.retailers[0]}</span></p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {dest && (
                <a href={dest} target="_blank" rel="noopener noreferrer sponsored"
                  className="flex items-center gap-1 rounded-lg bg-sage-700 px-2.5 py-1 text-[11px] font-semibold text-white" aria-label="Go to store">
                  <Store size={12} /> Store
                </a>
              )}
              <Link href={compareHref(p)} className="rounded-lg border border-stone-200 px-2.5 py-1 text-center text-[11px] font-semibold text-stone-600">Compare</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Variant C: 2-col image-left tiles, info stacked, store as text link ───────
function VariantC({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {items.map((p) => {
        const dest = storeHref(p);
        return (
          <article key={p.catalogId} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-50">
              <ProductImage src={p.imageUrl} alt={p.title} className="h-full w-full object-contain p-1" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-stone-900">{p.brand} {p.title}</h3>
              <p className="mt-0.5 text-base font-bold text-sage-800">{priceLabel(p)}</p>
              <div className="mt-auto flex items-center gap-3 pt-1 text-[12px] font-semibold">
                <Link href={compareHref(p)} className="text-sage-700">Compare</Link>
                {dest && (
                  <a href={dest} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex items-center gap-1 text-orange-600">
                    Go to store <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Variant D: 3-col micro tiles (max density), price + store icon ────────────
function VariantD({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((p) => {
        const dest = storeHref(p);
        return (
          <article key={p.catalogId} className="flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="relative aspect-square bg-stone-50">
              <ProductImage src={p.imageUrl} alt={p.title} className="h-full w-full object-contain p-1" />
            </div>
            <div className="flex flex-1 flex-col p-1.5">
              <h3 className="line-clamp-2 text-[10px] font-medium leading-tight text-stone-800">{p.brand} {p.title}</h3>
              <p className="mt-0.5 text-[12px] font-bold text-sage-800">{priceLabel(p)}</p>
              <div className="mt-1 flex items-center gap-1">
                <Link href={compareHref(p)} className="flex-1 rounded bg-sage-700 py-0.5 text-center text-[9px] font-semibold text-white">Compare</Link>
                {dest && (
                  <a href={dest} target="_blank" rel="noopener noreferrer sponsored"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-orange-100 text-orange-600" aria-label="Go to store">
                    <Store size={11} />
                  </a>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function InventoryLayoutsPreview({ initial }: { initial: VerifiedBrowseResult }) {
  const items = initial.products.slice(0, 12);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 font-homy text-2xl font-bold text-ink-900">Inventory layouts — phone preview</h1>
      <p className="mb-6 text-sm text-stone-500">
        Same data, 4 compact options. Each has Compare + a “go to store” action. Pick one and I’ll apply it to /inventory.
      </p>
      <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-4">
        <Frame title="A · Dense 2-col" blurb="Small cards, store icon on the photo."><VariantA items={items} /></Frame>
        <Frame title="B · List rows" blurb="Thumbnail + info, store button on the right side."><VariantB items={items} /></Frame>
        <Frame title="C · Image-left tiles" blurb="Roomy text, store as a labeled link."><VariantC items={items} /></Frame>
        <Frame title="D · Micro 3-col" blurb="Maximum density, store icon button."><VariantD items={items} /></Frame>
      </div>
    </div>
  );
}
