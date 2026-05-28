"use client";

import type { ChatMessage as ChatMessageType, ProductOffer } from "@/lib/types";
import { FormattedText } from "./FormattedText";
import { ProductResults } from "./ProductResults";
import { QuickChips } from "./QuickChips";
import { ShoppingBag } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  onChipSelect?: (chip: string) => void;
  isLatest?: boolean;
  loading?: boolean;
}

export function ChatMessageBubble({
  message,
  savedIds,
  onSave,
  onShopClick,
  onChipSelect,
  isLatest,
  loading,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-600 text-white shadow-md"
          aria-hidden
        >
          <ShoppingBag size={18} />
        </div>
      )}

      <div
        className={`flex flex-col ${isUser ? "max-w-[min(100%,28rem)] items-end" : "w-full max-w-full items-start"}`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser
              ? "bg-sage-600 text-white rounded-br-sm"
              : "rounded-bl-sm border border-stone-200/80 bg-white text-stone-700 shadow-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <FormattedText text={message.content} />
          )}
        </div>

        {message.productResults &&
          (message.productResults.local.length > 0 ||
            message.productResults.online.length > 0) && (
            <ProductResults
              results={message.productResults}
              savedIds={savedIds}
              onSave={onSave}
              onShopClick={onShopClick}
            />
          )}

        {!isUser &&
          isLatest &&
          message.chips &&
          message.chips.length > 0 &&
          onChipSelect && (
            <QuickChips
              chips={message.chips}
              onSelect={onChipSelect}
              disabled={loading}
            />
          )}
      </div>
    </div>
  );
}
