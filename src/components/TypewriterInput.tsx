"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, ShoppingCart } from "lucide-react";

const EXAMPLES = [
  "Compare iPhone 17 prices across all websites",
  "Find me the cheapest Beats Studio Pro headphones",
  "What's the lowest price on vanilla ice cream?",
  "Whole milk gallon — cheapest store near me",
  "Honey Nut Cheerios best price",
  "Bounty paper towels bulk deal",
];

const TYPE_SPEED = 48;
const DELETE_SPEED = 22;
const PAUSE_AFTER_TYPE = 1800;
const PAUSE_AFTER_DELETE = 420;

interface Props {
  onSearch: (query: string) => void;
}

export function TypewriterInput({ onSearch }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting" | "waiting">("typing");

  const [mode, setMode] = useState<"animating" | "focused" | "typing">("animating");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (mode !== "animating") return;

    const target = EXAMPLES[exampleIdx]!;

    if (phase === "typing") {
      if (displayed.length < target.length) {
        const t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), TYPE_SPEED);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("pausing"), PAUSE_AFTER_TYPE);
      return () => clearTimeout(t);
    }

    if (phase === "pausing") {
      setPhase("deleting");
      return;
    }

    if (phase === "deleting") {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), DELETE_SPEED);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => {
        setExampleIdx((i) => (i + 1) % EXAMPLES.length);
        setPhase("typing");
      }, PAUSE_AFTER_DELETE);
      return () => clearTimeout(t);
    }
  }, [displayed, phase, exampleIdx, mode]);

  function handleFocus() {
    if (mode === "animating") {
      setMode("focused");
      setDisplayed("");
    }
  }

  function handleBlur() {
    // Once the user has clicked the field, keep it in focused/typing mode permanently
    // (never resume the animation)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setMode("typing");
    setValue(e.target.value);
    if (e.target.value === "") setMode("focused");
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
    if (mode === "animating") {
      // No user input — open chat with welcome screen
      onSearch("");
      return;
    }
    const q = value.trim();
    if (!q) return;
    onSearch(q);
  }

  const showAnimation = mode === "animating";
  const showPlaceholder = mode === "focused";
  const inputVal = mode === "typing" ? value : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-2xl items-end gap-1.5 rounded-3xl border border-orange-200/80 bg-white px-2 py-2 shadow-[0_12px_40px_rgba(234,88,12,0.10)] transition focus-within:border-orange-300 focus-within:shadow-[0_14px_48px_rgba(234,88,12,0.16)] sm:gap-2 sm:px-2.5"
    >
      <label htmlFor="home-search" className="sr-only">
        Product to compare
      </label>

      {/* Left "+" — focuses the input, mirrors the clean composer look */}
      <button
        type="button"
        aria-label="Start typing"
        onClick={() => inputRef.current?.focus()}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-orange-50 hover:text-orange-500"
      >
        <Plus size={22} strokeWidth={2.2} aria-hidden />
      </button>

      <div className="relative min-w-0 flex-1">
        {showAnimation && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center pr-2 text-base sm:text-lg"
          >
            <span className="truncate text-stone-400">{displayed}</span>
            <span className="ml-0.5 inline-block h-5 w-[2px] shrink-0 animate-blink bg-orange-400 sm:h-6" />
          </div>
        )}

        <textarea
          ref={inputRef}
          id="home-search"
          name="q"
          rows={1}
          autoComplete="off"
          value={inputVal}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={showPlaceholder ? "Ask Homivion or paste a link…" : ""}
          style={{ maxHeight: "14rem" }}
          className={`w-full resize-none overflow-y-auto bg-transparent py-2.5 pr-2 text-base leading-relaxed outline-none placeholder:text-stone-400 sm:text-lg ${
            showAnimation ? "text-transparent caret-transparent" : "text-stone-900"
          }`}
        />
      </div>

      {/* Submit button — keeps the Homivion shopping cart */}
      <button
        type="submit"
        aria-label="Search"
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-400/30 transition hover:from-orange-600 hover:to-amber-600 sm:h-11 sm:w-11"
      >
        <ShoppingCart size={20} strokeWidth={2} aria-hidden />
      </button>
    </form>
  );
}
