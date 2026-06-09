"use client";

import { useRef, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { SearchSendIcon } from "@/components/icons/SearchSendIcon";
import { identifyProductImage } from "@/lib/vision/identify-client";

interface Props {
  onSearch: (query: string) => void;
}

export function TypewriterInput({ onSearch }: Props) {
  const [value, setValue] = useState("");
  const [scanning, setScanning] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    autoResize();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onSearch(q);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPhotoError(null);
    setScanning(true);
    try {
      const { query, error } = await identifyProductImage(file);
      if (query) {
        setValue(query);
        onSearch(query);
      } else {
        setPhotoError(error ?? "Couldn't read that photo.");
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-end gap-1.5 rounded-[28px] border border-orange-200/80 bg-white px-2 py-1.5 shadow-[0_12px_40px_rgba(234,88,12,0.10)] transition focus-within:border-orange-300 focus-within:shadow-[0_14px_48px_rgba(234,88,12,0.16)] sm:gap-2 sm:px-2.5"
      >
        <label htmlFor="home-search" className="sr-only">
          Product to compare
        </label>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
        />

        {/* Left "+" — upload a product photo to identify it */}
        <button
          type="button"
          aria-label="Add a product photo"
          title="Add a product photo"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-orange-50 hover:text-orange-500 disabled:opacity-60"
        >
          {scanning ? (
            <Loader2 size={20} strokeWidth={2.2} className="animate-spin text-orange-500" aria-hidden />
          ) : (
            <Plus size={20} strokeWidth={2.2} aria-hidden />
          )}
        </button>

        <textarea
          ref={inputRef}
          id="home-search"
          name="q"
          rows={1}
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={scanning ? "Reading your photo…" : "Ask for a product or paste a link…"}
          style={{ maxHeight: "12rem" }}
          className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 pr-2 text-base leading-relaxed text-stone-900 outline-none placeholder:text-stone-400 sm:text-lg"
        />

        {/* Submit button — keeps the Homivion shopping cart */}
        <button
          type="submit"
          aria-label="Search"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-400/30 transition hover:from-orange-600 hover:to-amber-600 sm:h-10 sm:w-10"
        >
          <SearchSendIcon size={18} />
        </button>
      </form>

      {photoError && (
        <p className="mt-2 px-3 text-center text-sm text-orange-700">{photoError}</p>
      )}
    </div>
  );
}
