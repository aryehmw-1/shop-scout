"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SearchSuggestProps {
  value: string;
  onSelect: (query: string) => void;
  disabled?: boolean;
}

interface SuggestResponse {
  queries: string[];
  products: Array<{ catalogId: string; title: string; brand: string }>;
}

export function SearchSuggest({ value, onSelect, disabled }: SearchSuggestProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SuggestResponse>({ queries: [], products: [] });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggest = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = (await res.json()) as SuggestResponse;
      setItems(data);
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (disabled || value.trim().length < 2) {
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggest(value), 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, disabled, fetchSuggest]);

  if (!open || disabled) return null;

  const hasItems = items.queries.length > 0 || items.products.length > 0;
  if (!hasItems) return null;

  return (
    <ul className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-52 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
      {items.products.map((p) => (
        <li key={p.catalogId}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-sage-50"
            onMouseDown={() => {
              onSelect(`${p.brand} ${p.title}`.trim());
              setOpen(false);
            }}
          >
            <span className="font-medium text-stone-800">{p.title}</span>
            <span className="ml-2 text-xs text-stone-500">{p.brand}</span>
          </button>
        </li>
      ))}
      {items.queries.map((q) => (
        <li key={q}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            onMouseDown={() => {
              onSelect(q);
              setOpen(false);
            }}
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}
