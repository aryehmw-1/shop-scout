"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage as ChatMessageType, ProductOffer } from "@/lib/types";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { FormattedText } from "./FormattedText";
import { ProductResults } from "./ProductResults";
import { CompareExperience } from "./CompareExperience";
import { QuickChips } from "./QuickChips";
import { getRetailerMeta } from "@/lib/retailers/meta";

/**
 * Reveals an assistant message gradually, as if it's being written in real
 * time. Only animates the freshly-arrived latest reply (recent timestamp) —
 * historical messages and user messages render instantly. Re-parses the
 * growing substring each tick so Markdown blocks form as they stream in.
 */
function AssistantText({ text, animate }: { text: string; animate: boolean }) {
  const doneRef = useRef(!animate);
  const [shown, setShown] = useState(animate ? "" : text);

  useEffect(() => {
    if (doneRef.current) {
      setShown(text);
      return;
    }
    let i = 0;
    const step = Math.max(2, Math.round(text.length / 160));
    const id = setInterval(() => {
      i = Math.min(text.length, i + step);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        doneRef.current = true;
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <FormattedText text={shown} />;
}

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
              ? "rounded-2xl rounded-br-sm border border-orange-200/70 bg-white px-4 py-3 text-[15px] leading-relaxed text-stone-800"
              : "text-[15px] leading-relaxed text-stone-800"
          }
        >
          {isUser ? (
            <FormattedText text={message.content} />
          ) : (
            <AssistantText
              text={message.content}
              animate={Boolean(isLatest) && Date.now() - (message.timestamp ?? 0) < 4000}
            />
          )}
        </div>

        {message.productResults?.retailerPreference &&
          message.productResults.retailerPreferenceHasOffers === false &&
          (message.productResults.online?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
              No {getRetailerMeta(message.productResults.retailerPreference).name} offers
              right now — showing the best matches from other stores.
            </div>
          )}

        {message.productResults && (
          <div className="mt-4 min-w-0 w-[calc(100%+56px)] -ml-[52px] lg:w-full lg:ml-0 lg:max-w-full">
            {/* MOBILE (frozen): the existing chat results layout. */}
            <div className="lg:hidden">
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
            {/* DESKTOP: the AI chat IS the compare experience — render the
                compare-page L5 layout (separate exact cards + grouped similar
                rail) when we have offers; fall back to ProductResults for the
                request-form / similar-only / "checking live prices" states. */}
            <div className="hidden lg:block">
              {(message.productResults.online?.length ?? 0) > 0 ? (
                <CompareExperience
                  results={message.productResults}
                  savedIds={savedIds}
                  onSave={onSave}
                  onShopClick={onShopClick}
                  searchQuery={searchQuery}
                  layoutMode="grid"
                />
              ) : (
                <ProductResults
                  results={message.productResults}
                  savedIds={savedIds}
                  onSave={onSave}
                  onShopClick={onShopClick}
                  enriching={enriching}
                  searchQuery={searchQuery}
                  conversationDebug={message.conversationDebug}
                />
              )}
            </div>
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
