"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ProductOffer, SessionState } from "@/lib/types";
import { defaultSession } from "@/lib/conversation/default-session";
import { ChatMessageBubble } from "./ChatMessage";
import { LocationModal } from "./LocationModal";
import {
  loadSavedOffers,
  toggleSavedOffer,
  loadPreferences,
  saveAddress,
  loadAddress,
} from "@/lib/storage";
import {
  learnFromProduct,
  learnFromSearch,
  loadLearningProfile,
  syncLearningFromServer,
} from "@/lib/learning/client-storage";
import { useAuth } from "@/contexts/AuthContext";
import { ZIP_SET_CHAT_CHIPS } from "@/lib/inventory/demo-suggestions";
import { getOnboardingContext, getWelcomeChips } from "@/lib/inventory/onboarding-examples";
import { VerifiedOnboardingPaths } from "./onboarding/VerifiedOnboardingPaths";
import type { UserAddress } from "@/lib/types";
import { SearchSuggest } from "./SearchSuggest";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { ValueProposition } from "./ValueProposition";
import { trackEvent } from "@/lib/analytics/track-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Link2, MapPin, RotateCcw, Columns3 } from "lucide-react";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isValidZip(z: string) {
  return /^\d{5}$/.test(z);
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

interface ChatAppProps {
  initialMessage?: string;
  initialZip?: string;
  /** Opens chat ready to paste a URL — does not auto-send anything */
  inputHint?: "link";
}

export function ChatApp({ initialMessage, initialZip, inputHint }: ChatAppProps) {
  const router = useRouter();
  const { user, updateAddress, syncSavedOffers } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<SessionState>(defaultSession());
  const [zipCode, setZipCode] = useState(initialZip ?? "");
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showLocation, setShowLocation] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [learningProfile, setLearningProfile] = useState(loadLearningProfile);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(session);
  const initialSent = useRef(false);
  const linkHintApplied = useRef(false);
  const chatInitialized = useRef(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  sessionRef.current = session;

  const buildWelcomeMessage = useCallback(
    (zip: string, forLinkPaste?: boolean, userName?: string): ChatMessage => {
      const hi = userName ? `Hi **${firstName(userName)}**! ` : "";

      if (forLinkPaste && isValidZip(zip)) {
        const ctx = getOnboardingContext();
        return {
          id: "welcome",
          role: "assistant",
          content: `${hi}Paste a **product page URL** (Amazon works best today). I'll compare against verified catalog matches where available — shipping to **${zip}**.\n\n${ctx.subhead}`,
          chips: ["Paste an Amazon link", ...getWelcomeChips(true).slice(0, 3)],
          timestamp: Date.now(),
        };
      }
      const ctx = getOnboardingContext();
      return {
        id: "welcome",
        role: "assistant",
        content: isValidZip(zip)
          ? `${hi}**${ctx.headline}**\n\n${ctx.subhead}\n\nShipping to **${zip}**. Start below — browse verified products, paste a link, or try grocery.`
          : `${hi}**${ctx.headline}**\n\n${ctx.subhead}\n\nSearch any product now — add your **ZIP** later for shipping and tax estimates.`,
        chips: isValidZip(zip) ? [...ZIP_SET_CHAT_CHIPS] : [...ctx.chips.slice(0, 4)],
        timestamp: Date.now(),
      };
    },
    [],
  );

  const resetChat = useCallback(() => {
    setSession(defaultSession());
    setInput("");
    initialSent.current = false;
    setMessages([
      buildWelcomeMessage(zipCode, inputHint === "link", user?.name),
    ]);
  }, [zipCode, inputHint, user?.name, buildWelcomeMessage]);

  useEffect(() => {
    const addr = user?.address ?? loadAddress();
    const zip = addr?.zipCode ?? loadPreferences().zipCode ?? initialZip ?? "";
    if (isValidZip(zip)) {
      setZipCode(zip);
      setLocationReady(true);
    } else {
      setLocationReady(true);
    }
    const saved = user?.savedOffers ?? loadSavedOffers();
    setSavedIds(new Set(saved.map((o) => o.id)));

    setMessages((prev) => {
      const inConversation =
        prev.length > 1 || (prev.length === 1 && prev[0].role === "user");
      if (inConversation) return prev;
      return [buildWelcomeMessage(zip, inputHint === "link", user?.name)];
    });

    if (!chatInitialized.current) {
      chatInitialized.current = true;
      if (user?.preferences?.learningProfile) {
        setLearningProfile(syncLearningFromServer(user.preferences.learningProfile));
      }
    }
  }, [user?.id, user?.address?.zipCode, user?.name, initialZip, inputHint, buildWelcomeMessage]);

  useEffect(() => {
    if (inputHint !== "link" || !locationReady || linkHintApplied.current) return;
    linkHintApplied.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputHint, locationReady]);

  const persistAddress = useCallback(
    async (address: UserAddress) => {
      setZipCode(address.zipCode);
      saveAddress(address);
      setSession((s) => ({
        ...s,
        intent: { ...s.intent, zipCode: address.zipCode },
      }));
      if (user) {
        try {
          await updateAddress(address);
        } catch {
          /* saved locally */
        }
      }
    },
    [user, updateAddress],
  );

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const handleSave = useCallback(
    (offer: ProductOffer) => {
      const next = toggleSavedOffer(offer);
      setSavedIds(new Set(next.map((o) => o.id)));
      syncSavedOffers(next);
      setLearningProfile(learnFromProduct(offer));
      const isSaved = next.some((o) => o.id === offer.id);
      trackEvent({
        name: isSaved ? "watchlist_add" : "offer_save",
        properties: {
          offerId: offer.id,
          retailer: offer.retailer,
          catalogId: offer.catalogId,
          action: isSaved ? "add" : "remove",
        },
      });
    },
    [syncSavedOffers],
  );

  const handleShopClick = useCallback((offer: ProductOffer) => {
    setLearningProfile(learnFromProduct(offer));
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const lower = trimmed.toLowerCase();
      if (
        lower.includes("paste an amazon") ||
        lower.includes("compare a product link") ||
        lower.includes("product link")
      ) {
        router.push("/chat?hint=link");
        setInput("");
        inputRef.current?.focus();
        return;
      }
      if (lower.includes("browse verified")) {
        router.push("/verified");
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      const searchStarted = Date.now();

      trackEvent({
        name: "search_performed",
        properties: { query: trimmed, source: "chat" },
      });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
            body: JSON.stringify({
            message: trimmed,
            session: sessionRef.current,
            zipCode,
            learningProfile,
            progressive: true,
            history: [...messages, userMsg].slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) throw new Error("Chat failed");

        const data = await res.json();
        setSession(data.session);

        if (data.session?.intent?.query) {
          setLearningProfile(
            learnFromSearch({
              query: data.session.intent.query,
              category: data.session.intent.category,
              gender: data.session.intent.gender,
              ageGroup: data.session.intent.ageGroup,
              zipCode: data.session.intent.zipCode,
            }),
          );
        }

        if (data.session?.intent?.zipCode) {
          const z = data.session.intent.zipCode;
          persistAddress({
            ...(loadAddress() ?? { label: "Home" }),
            zipCode: z,
          });
        }

        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: data.reply,
          productResults: data.productResults,
          compareMode: data.compareMode,
          chips: data.chips,
          conversationDebug: data.conversationDebug,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (data.productResults) {
          trackEvent({
            name: "search_first_results",
            properties: {
              query: trimmed,
              offerCount: data.productResults.online?.length ?? 0,
              timeToFirstResultMs: Date.now() - searchStarted,
              cacheHit: data.productResults.meta?.cacheHit,
              progressive: true,
              catalogId: data.productResults.enrichmentCatalogId,
            },
          });
        }

        if (
          data.productResults?.enrichmentPending &&
          data.session?.intent
        ) {
          setEnrichingId(assistantMsg.id);
          const enrichStart = Date.now();
          const catalogId = data.productResults.enrichmentCatalogId;

          trackEvent({
            name: "enrichment_started",
            properties: {
              catalogId,
              query: trimmed,
              offerCountBefore: data.productResults.online?.length ?? 0,
            },
          });

          fetch("/api/search/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              intent: data.session.intent,
              catalogId: data.productResults.enrichmentCatalogId,
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((enriched) => {
              if (!enriched?.productResults) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ?
                    { ...m, productResults: enriched.productResults }
                  : m,
                ),
              );
              trackEvent({
                name: "enrichment_completed",
                properties: {
                  catalogId,
                  latencyMs: Date.now() - enrichStart,
                  offerCountAfter: enriched.productResults.online?.length ?? 0,
                  success: true,
                },
              });
            })
            .catch(() => {
              trackEvent({
                name: "enrichment_completed",
                properties: {
                  catalogId,
                  latencyMs: Date.now() - enrichStart,
                  success: false,
                },
              });
            })
            .finally(() => setEnrichingId(null));
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: "Something went wrong — please try again.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, session, zipCode, persistAddress, learningProfile, messages, router],
  );

  useEffect(() => {
    if (initialMessage && locationReady && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, locationReady, sendMessage]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  return (
    <>
      {showLocation && (
        <LocationModal
          onComplete={(address) => {
            persistAddress(address);
            setShowLocation(false);
            setLocationReady(true);
            setMessages([
              buildWelcomeMessage(
                address.zipCode,
                inputHint === "link",
                user?.name,
              ),
            ]);
          }}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-orange-100/80 bg-cream-50/95 px-4 py-3 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetChat}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-orange-200/80 bg-white px-3 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40"
              title="Clear chat and start over"
            >
              <RotateCcw size={16} />
              <span className="hidden sm:inline">New chat</span>
            </button>
            <Link
              href="/compare"
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-sage-300 hover:bg-sage-50"
            >
              <Columns3 size={16} />
              <span className="hidden sm:inline">Compare</span>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setShowLocation(true)}
            className="flex items-center gap-2 rounded-xl border border-sage-200 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-800 transition hover:bg-sage-100"
            title="ZIP for shipping estimates"
          >
            <MapPin size={16} />
            <span className="text-stone-500">ZIP</span>
            <input
              type="text"
              inputMode="numeric"
              value={zipCode}
              onChange={(e) => {
                const z = e.target.value.replace(/\D/g, "").slice(0, 5);
                setZipCode(z);
                if (isValidZip(z)) {
                  persistAddress({
                    ...(loadAddress() ?? user?.address ?? { label: "Home" }),
                    zipCode: z,
                  });
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-14 bg-transparent text-center font-bold text-stone-900 focus:outline-none"
              maxLength={5}
              aria-label="ZIP code for shipping"
            />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-1 sm:px-2">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                savedIds={savedIds}
                onSave={handleSave}
                onShopClick={handleShopClick}
                onChipSelect={sendMessage}
                isLatest={msg.id === lastAssistantId}
                loading={loading}
                enriching={msg.id === enrichingId}
                searchQuery={
                  msg.role === "user" ? msg.content
                  : messages[messages.indexOf(msg) - 1]?.role === "user" ?
                    messages[messages.indexOf(msg) - 1]?.content
                  : undefined
                }
              />
            ))}
            {messages.length <= 1 && !loading && (
              <div className="space-y-4">
                <VerifiedOnboardingPaths onTrySearch={sendMessage} compact />
                <ValueProposition compact />
              </div>
            )}
            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <BrandHomeMark size="xs" pulse />
                <div className="rounded-2xl border border-stone-200/80 bg-white px-5 py-4 text-sm text-stone-500 shadow-sm">
                  Finding verified deals…
                </div>
              </div>
            )}
            <div ref={bottomRef} className="h-4" />
          </div>
        </div>

        <div className="shrink-0 border-t border-stone-200/60 bg-white/90 px-4 py-4 backdrop-blur-md lg:px-8">
          <form
            className="mx-auto flex w-full max-w-6xl gap-2 px-1 sm:px-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <div className="relative flex-1">
              <Link2
                className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                size={18}
              />
              <SearchSuggest
                value={input}
                onSelect={(q) => {
                  setInput(q);
                  inputRef.current?.focus();
                }}
                disabled={loading}
              />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  inputHint === "link" && isValidZip(zipCode)
                    ? "Paste a product page URL here, then press Send…"
                    : isValidZip(zipCode)
                      ? "What do you need? Or paste a product link…"
                      : "Enter ZIP or ask what you need…"
                }
                className="w-full rounded-2xl border border-ink-200 bg-ink-50/80 py-3.5 pl-11 pr-4 text-ink-800 placeholder:text-ink-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200/80"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3.5 font-semibold text-white shadow-md shadow-orange-500/25 transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40"
            >
              <Send size={18} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-6xl text-center text-[11px] text-stone-400">
            ZIP is used for shipping estimates only. Affiliate disclosure applies.
          </p>
        </div>
      </div>
    </>
  );
}
