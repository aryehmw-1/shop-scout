"use client";

import { useSearchParams } from "next/navigation";
import { ChatApp } from "@/components/ChatApp";

/** Category shortcuts — grocery-first; apparel marked experimental */
const CATEGORY_STARTS: Record<string, string> = {
  pantry: "honey nut cereal",
  dairy: "whole milk",
  household: "paper towels",
  salad: "organic spinach",
  meat: "chicken breast",
  produce: "orange juice",
  bakery: "whole wheat bread",
  clothing: "mens hoodie",
  shoes: "running shoes",
  sports: "basketball",
};

export function ChatPageClient() {
  const params = useSearchParams();
  const start = params.get("start");
  const hint = params.get("hint");
  const q = params.get("q") ?? params.get("query");

  const pasteLinkMode = hint === "link" || start === "link";

  const initialMessage =
    q?.trim() ? q.trim()
    : start && !pasteLinkMode ?
      CATEGORY_STARTS[start] ?? `I'm looking for ${start}`
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatApp
        initialMessage={initialMessage}
        inputHint={pasteLinkMode ? "link" : undefined}
        showHero={!initialMessage && !pasteLinkMode}
      />
    </div>
  );
}
