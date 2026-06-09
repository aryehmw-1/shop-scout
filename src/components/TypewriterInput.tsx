"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { SearchSendIcon } from "@/components/icons/SearchSendIcon";

interface Props {
  onSearch: (query: string) => void;
}

export function TypewriterInput({ onSearch }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-[28px] border border-orange-200/80 bg-white px-2 py-1.5 shadow-[0_12px_40px_rgba(234,88,12,0.10)] transition focus-within:border-orange-300 focus-within:shadow-[0_14px_48px_rgba(234,88,12,0.16)] sm:gap-2 sm:px-2.5"
    >
      <label htmlFor="home-search" className="sr-only">
        Product to compare
      </label>

      {/* Left "+" — focuses the input, mirrors the clean composer look */}
      <button
        type="button"
        aria-label="Start typing"
        onClick={() => inputRef.current?.focus()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-orange-50 hover:text-orange-500"
      >
        <Plus size={20} strokeWidth={2.2} aria-hidden />
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
        placeholder="Ask for a product or paste a link…"
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
  );
}
