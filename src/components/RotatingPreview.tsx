"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Truck, Star } from "lucide-react";

interface StoreOffer {
  store: string;
  logo: string;
  price: string;
  delivery: string;
  badge?: string;
  rating?: string;
  reviews?: string;
}

interface PreviewProduct {
  query: string;
  name: string;
  emoji: string;
  bg: string;
  textColor: string;
  offers: StoreOffer[];
}

const PREVIEWS: PreviewProduct[] = [
  {
    query: "whole milk gallon",
    name: "Whole Milk, 1 Gallon",
    emoji: "🥛",
    bg: "bg-sky-50",
    textColor: "text-sky-800",
    offers: [
      {
        store: "Walmart",
        logo: "W",
        price: "$3.48",
        delivery: "Free pickup · Ships from $5.99",
        badge: "Lowest price",
        rating: "4.7",
        reviews: "2.4k",
      },
      {
        store: "Target",
        logo: "T",
        price: "$3.79",
        delivery: "Same-day delivery available",
        rating: "4.6",
        reviews: "1.1k",
      },
      {
        store: "Kroger",
        logo: "K",
        price: "$4.19",
        delivery: "In-store or delivery",
        rating: "4.5",
        reviews: "890",
      },
    ],
  },
  {
    query: "Honey Nut Cheerios",
    name: "Honey Nut Cheerios, 10.8 oz",
    emoji: "🌾",
    bg: "bg-amber-50",
    textColor: "text-amber-800",
    offers: [
      {
        store: "Amazon",
        logo: "A",
        price: "$4.29",
        delivery: "Free with Prime · arrives tomorrow",
        badge: "Fastest delivery",
        rating: "4.8",
        reviews: "18k",
      },
      {
        store: "Walmart",
        logo: "W",
        price: "$4.48",
        delivery: "Free pickup · Ships from $5.99",
        rating: "4.7",
        reviews: "6.2k",
      },
      {
        store: "Target",
        logo: "T",
        price: "$4.99",
        delivery: "Buy 2 save 10%",
        rating: "4.6",
        reviews: "3.4k",
      },
    ],
  },
  {
    query: "Beats Studio Pro headphones",
    name: "Beats Studio Pro Headphones",
    emoji: "🎧",
    bg: "bg-violet-50",
    textColor: "text-violet-800",
    offers: [
      {
        store: "Amazon",
        logo: "A",
        price: "$179.95",
        delivery: "Free with Prime · arrives tomorrow",
        badge: "Best deal",
        rating: "4.5",
        reviews: "12k",
      },
      {
        store: "Best Buy",
        logo: "B",
        price: "$199.99",
        delivery: "Free shipping or pickup",
        rating: "4.4",
        reviews: "8.7k",
      },
      {
        store: "Target",
        logo: "T",
        price: "$209.99",
        delivery: "Free shipping over $35",
        rating: "4.3",
        reviews: "2.1k",
      },
    ],
  },
  {
    query: "vanilla ice cream",
    name: "Breyers Vanilla Ice Cream, 48 oz",
    emoji: "🍦",
    bg: "bg-yellow-50",
    textColor: "text-yellow-800",
    offers: [
      {
        store: "Instacart",
        logo: "I",
        price: "$4.99",
        delivery: "Delivered in 1 hour",
        badge: "Fastest",
        rating: "4.6",
        reviews: "940",
      },
      {
        store: "Walmart",
        logo: "W",
        price: "$5.28",
        delivery: "Free pickup today",
        rating: "4.7",
        reviews: "3.2k",
      },
      {
        store: "Kroger",
        logo: "K",
        price: "$5.49",
        delivery: "In-store or delivery",
        rating: "4.5",
        reviews: "780",
      },
    ],
  },
];

const LOGO_COLORS: Record<string, string> = {
  W: "bg-blue-600",
  T: "bg-red-600",
  K: "bg-[#e31837]",
  A: "bg-[#ff9900]",
  B: "bg-blue-800",
  I: "bg-[#43b02a]",
};

export function RotatingPreview() {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PREVIEWS.length);
        setFading(false);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const product = PREVIEWS[idx]!;

  return (
    <div className="mt-10 w-full max-w-2xl text-left">
      <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-stone-400">
        Live example
      </p>

      {/* Query bar replica */}
      <div
        className={`mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
      >
        <span className="text-sm text-stone-400">🔍</span>
        <span className="text-sm font-medium text-stone-600 italic">
          &ldquo;{product.query}&rdquo;
        </span>
      </div>

      {/* Results card */}
      <div
        className={`overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
      >
        {/* Product header */}
        <div className="flex items-center gap-4 border-b border-stone-100 px-4 py-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${product.bg} text-3xl`}
          >
            {product.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wide ${product.textColor}`}>
              Showing prices for
            </p>
            <p className="mt-0.5 font-bold text-stone-950">{product.name}</p>
            <p className="text-sm text-stone-500">Sorted cheapest → highest delivered price</p>
          </div>
          <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
        </div>

        {/* Offer rows */}
        <div className="divide-y divide-stone-100">
          {product.offers.map((offer, i) => (
            <div key={offer.store} className="flex items-center gap-3 px-4 py-3">
              {/* Store logo */}
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${LOGO_COLORS[offer.logo] ?? "bg-stone-500"}`}
              >
                {offer.logo}
              </div>

              {/* Store info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-stone-900">{offer.store}</p>
                  {offer.badge && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      {offer.badge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                  <Truck size={11} className="shrink-0" />
                  <span>{offer.delivery}</span>
                </div>
                {offer.rating && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    <span className="font-medium text-stone-600">{offer.rating}</span>
                    <span>({offer.reviews} reviews)</span>
                  </div>
                )}
              </div>

              {/* Price + CTA */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <p className={`text-lg font-bold ${i === 0 ? "text-emerald-700" : "text-stone-950"}`}>
                  {offer.price}
                </p>
                <span className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600">
                  View deal →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mt-3 flex justify-center gap-1.5">
        {PREVIEWS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setFading(true); setTimeout(() => { setIdx(i); setFading(false); }, 300); }}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-orange-400" : "w-1.5 bg-stone-300"}`}
            aria-label={`Show example ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
