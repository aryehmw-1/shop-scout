"use client";

import type { ChatMessage as ChatMessageType, ProductOffer } from "@/lib/types";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { FormattedText } from "./FormattedText";
import { ProductResults } from "./ProductResults";
import { QuickChips } from "./QuickChips";

interface ChatMessageProps {
  message: ChatMessageType;
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  onChipSelect?: (chip: string) => void;
  isLatest?: boolean;
  loading?: boolean;
  enriching?: boolean;
  searchQuery?: string;
}

export function ChatMessageBubble({
  message,
  savedIds,
  onSave,
  onShopClick,
  onChipSelect,
  isLatest,
  loading,
  enriching,
  searchQuery,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && <BrandHomeMark size="xs" />}

      <div
        className={`flex flex-col ${isUser ? "max-w-[min(100%,67%)] items-end" : "w-full max-w-full items-start"}`}
      >
        <div
          className={
            isUser
              ? "rounded-2xl rounded-br-sm border border-sage-200 bg-sage-50 px-4 py-3 text-[15px] leading-relaxed text-stone-800"
              : "text-[15px] leading-relaxed text-stone-800"
          }
        >
          <FormattedText text={message.content} />
        </div>

        {message.productResults && (
          <div className="mt-4 w-full min-w-0 max-w-full">
            <ProductResults
              results={message.productResults}
              savedIds={savedIds}
              onSave={onSave}
              onShopClick={onShopClick}
              enriching={enriching}
              searchQuery={searchQuery}
              conversationDebug={message.conversationDebug}
            />
          </div>
        )}

        {isLatest &&
          !loading &&
          message.chips &&
          message.chips.length > 0 &&
          onChipSelect && (
            <QuickChips chips={message.chips} onSelect={onChipSelect} disabled={loading} />
          )}
      </div>
    </div>
  );
}
