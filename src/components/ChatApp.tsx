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
import type { UserAddress } from "@/lib/types";
import { SearchSuggest } from "./SearchSuggest";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { trackEvent } from "@/lib/analytics/track-client";
import { mergeEnrichedSearchResults } from "@/lib/search/merge-enriched-results";
import { useRouter } from "next/navigation";
import { ArrowUp, MapPin, RotateCcw, ShoppingCart, CheckCircle2 } from "lucide-react";
import { TypewriterInput } from "@/components/TypewriterInput";

const SHOPPING_LOADING_STEPS = [
  "Checking database for saved prices...",
  "Searching live offers across stores...",
  "Matching product and comparing prices...",
  "Ranking by best delivered price...",
];

const CHAT_LOADING_STEPS = [
  "Reading your question...",
  "Working on a reply...",
];

function looksLikeShoppingRequest(text: string) {
  const lower = text.toLowerCase();
  if (/https?:\/\/|www\./.test(lower)) return true;
  if (
    /\b(compare|price|prices|deal|buy|shop|shopping|find|search|cheapest|lowest|where can i buy|product|retailer|store|stores)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(milk|cereal|cheerios|paper towels|yogurt|diapers|detergent|shampoo|hoodie|shoes|laptop|headphones|coffee)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

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
  inputHint?: "link";
  /** Show hero headline + typewriter on the empty state (home page) */
  showHero?: boolean;
}

export function ChatApp({ initialMessage, initialZip, inputHint, showHero }: ChatAppProps) {
  const router = useRouter();
  const { user, updateAddress, syncSavedOffers } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<SessionState>(defaultSession());
  const [zipCode, setZipCode] = useState(initialZip ?? "");
  const [loading, setLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [loadingMode, setLoadingMode] = useState<"chat" | "shopping">("chat");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showLocation, setShowLocation] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [linkPasteMode, setLinkPasteMode] = useState(inputHint === "link");
  const [learningProfile, setLearningProfile] = useState(loadLearningProfile);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(session);
  const messagesRef = useRef(messages);
  const initialSent = useRef(false);
  const linkHintApplied = useRef(false);
  const chatInitialized = useRef(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  useEffect(() => {
    if (input === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const buildWelcomeMessage = useCallback(
    (zip: string, forLinkPaste?: boolean, userName?: string): ChatMessage => {
      const hi = userName ? `Hi **${firstName(userName)}**! ` : "";
      const linkMode = forLinkPaste ?? linkPasteMode;

      if (linkMode) {
        return {
          id: "welcome",
          role: "assistant",
          content: isValidZip(zip)
            ? `${hi}Paste a **product page URL** and I'll compare it against other places to buy. Shipping estimates are set to **${zip}**.`
            : `${hi}Paste a **product page URL** and I'll compare it against other places to buy. You can add a **ZIP** later for shipping estimates.`,
          chips: ["whole milk gallon", "paper towels", "organic yogurt"],
          timestamp: Date.now(),
        };
      }
      const withZip = isValidZip(zip);
      const name = userName ? firstName(userName) : null;
      const GREETINGS = [
        name ? `What will you buy today, **${name}**?` : "What will you buy today?",
        name ? `Let's find you the best deals, **${name}**!` : "Let's find you the best deals!",
        "Ready to save money? Tell me what you need.",
        "If you search it, I can find it.",
        name ? `Hi **${name}**! What are we shopping for today?` : "What are we shopping for today?",
      ];
      const greeting = GREETINGS[Math.floor(Date.now() / 60_000) % GREETINGS.length]!;
      return {
        id: "welcome",
        role: "assistant",
        content: greeting,
        chips: withZip
          ? [...ZIP_SET_CHAT_CHIPS.slice(0, 4)]
          : ["whole milk gallon", "paper towels", "Beats Studio Pro", "add ZIP"],
        timestamp: Date.now(),
      };
    },
    [linkPasteMode],
  );

  const resetChat = useCallback(() => {
    setSession(defaultSession());
    setInput("");
    initialSent.current = false;
    setMessages([
      buildWelcomeMessage(zipCode, linkPasteMode, user?.name),
    ]);
  }, [zipCode, linkPasteMode, user?.name, buildWelcomeMessage]);

  useEffect(() => {
    if (inputHint !== "link") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLinkPasteMode(true);
    });
    return () => {
      cancelled = true;
    };
  }, [inputHint]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
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

      if (!chatInitialized.current) {
        chatInitialized.current = true;
        setMessages([buildWelcomeMessage(zip, linkPasteMode || inputHint === "link", user?.name)]);
        if (user?.preferences?.learningProfile) {
          setLearningProfile(syncLearningFromServer(user.preferences.learningProfile));
        }
        return;
      }

      setMessages((prev) => {
        const inConversation =
          prev.length > 1 || (prev.length === 1 && prev[0].role === "user");
        if (inConversation) return prev;
        if (prev.length !== 1 || prev[0]?.id !== "welcome") return prev;
        return [buildWelcomeMessage(zip, linkPasteMode || inputHint === "link", user?.name)];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    user?.name,
    user?.address,
    user?.address?.zipCode,
    user?.savedOffers,
    user?.preferences?.learningProfile,
    initialZip,
    inputHint,
    linkPasteMode,
    buildWelcomeMessage,
  ]);

  useEffect(() => {
    if (!linkPasteMode || !locationReady || linkHintApplied.current) return;
    linkHintApplied.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [linkPasteMode, locationReady]);

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

  useEffect(() => {
    const steps = loadingMode === "shopping" ? SHOPPING_LOADING_STEPS : CHAT_LOADING_STEPS;
    if (!loading) {
      setLoadingStepIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) =>
        Math.min(current + 1, steps.length - 1),
      );
    }, 1100);
    return () => window.clearInterval(timer);
  }, [loading, loadingMode]);

  useEffect(() => {
    void import("@/lib/commerce-intelligence/analytics/session-id").then(({ recordIntelligenceSessionStart }) => {
      recordIntelligenceSessionStart();
    });
    const onLeave = () => {
      const msgs = messagesRef.current;
      if (msgs.length <= 1) return;
      const hadUser = msgs.some((m) => m.role === "user");
      const hadRec = msgs.some((m) => m.commerceInsight ?? m.productResults?.intelligenceInsight);
      if (hadUser && !hadRec) {
        void import("@/lib/commerce-intelligence/analytics/track-client").then(({ trackIntelligenceEvent }) => {
          trackIntelligenceEvent("session_abandon");
        });
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

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
    const lastAssistant = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === "assistant");
    const decision =
      lastAssistant?.commerceInsight?.decision ??
      lastAssistant?.productResults?.intelligenceInsight?.decision;
    const clickedWinner =
      !decision ||
      decision.winnerRetailer === offer.retailer ||
      decision.winnerRetailerName === offer.retailer;

    void import("@/lib/commerce-intelligence/trust-memory/store").then(({ recordTrustMemoryEvent }) => {
      const payload = {
        type: "click" as const,
        retailer: offer.retailer,
        canonicalId: offer.catalogId,
      };
      recordTrustMemoryEvent(payload);
      void import("@/lib/commerce-intelligence/trust-memory/sync").then(({ syncTrustMemoryEventToServer }) => {
        syncTrustMemoryEventToServer(payload);
      });
      void import("@/lib/commerce-intelligence/analytics/track-client").then(({ trackIntelligenceEvent }) => {
        trackIntelligenceEvent("offer_click", {
          retailer: offer.retailer,
          canonicalId: offer.catalogId,
          meta: { clickedWinner },
        });
      });
    });
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
        setLinkPasteMode(true);
        if (inputHint !== "link") {
          router.replace("/chat?hint=link", { scroll: false });
        }
        setInput("");
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (lower.includes("browse inventory") || lower.includes("browse verified")) {
        router.push("/inventory", { scroll: false });
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
      setLoadingMode(looksLikeShoppingRequest(trimmed) ? "shopping" : "chat");
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
            history: [...messagesRef.current, userMsg].slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("[chat] API error:", res.status, errData);
          throw new Error(errData?.detail ?? "Chat failed");
        }

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
          commerceInsight:
            data.commerceInsight ?? data.productResults?.intelligenceInsight,
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
                  m.id === assistantMsg.id && m.productResults ?
                    {
                      ...m,
                      productResults: mergeEnrichedSearchResults(
                        m.productResults,
                        enriched.productResults,
                      ),
                    }
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
    [loading, zipCode, persistAddress, learningProfile, router, inputHint],
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

  // True when the user hasn't sent anything yet — only the welcome message exists
  const hasUserMessages = messages.some((m) => m.role === "user");
  const isEmpty = !hasUserMessages && !loading;

  const inputForm = (
    <form
      action="/chat"
      method="get"
      className="mx-auto flex w-full max-w-2xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const typed = String(data.get("q") ?? input);
        sendMessage(typed);
      }}
    >
      <div className="relative flex-1">
        <SearchSuggest
          value={input}
          onSelect={(q) => {
            setInput(q);
            inputRef.current?.focus();
          }}
          disabled={loading}
        />
        <textarea
          ref={inputRef}
          name="q"
          rows={3}
          aria-label="Search products"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 14 * 16) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const q = input.trim();
              if (q) sendMessage(q);
            }
          }}
          placeholder={
            linkPasteMode
              ? "Paste a product page URL"
              : "Ask for a product or paste a link"
          }
          className="w-full resize-none overflow-y-auto rounded-2xl border border-ink-200 bg-ink-50/80 py-6 px-5 text-base text-ink-800 placeholder:text-ink-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200/80"
          style={{ maxHeight: "14rem" }}
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        aria-label="Send"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-400/30 transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40"
      >
        <ArrowUp size={24} strokeWidth={2.5} />
      </button>
    </form>
  );

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
                linkPasteMode,
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

        {/* ── EMPTY STATE ── */}
        {isEmpty ? (
          showHero ? (
            /* Hero layout — home page feel, no component swap */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-4 pb-16 pt-12 text-center sm:pt-16 lg:px-8">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-semibold text-stone-600 shadow-sm">
                <CheckCircle2 size={15} className="text-emerald-500" aria-hidden />
                Verified prices. Real deals. Trusted results.
              </p>

              <h1 className="font-display text-4xl font-bold leading-tight tracking-normal text-stone-950 sm:text-5xl lg:text-6xl">
                Ask Homivion what to buy.
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
                Type what you need or paste a product link — we compare prices and put the best deal first.
              </p>

              {/* Typewriter bar — submits directly into this ChatApp */}
              <TypewriterInput onSearch={(q) => { if (q) sendMessage(q); }} />

              {/* Quick-tap chips */}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["whole milk gallon", "Honey Nut Cheerios", "Beats Studio Pro", "vanilla ice cream"].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => sendMessage(ex)}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-600 transition hover:border-orange-300 hover:text-stone-950"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Standard welcome (non-home chat page) */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 pt-8 lg:px-8">
              <div className="w-full max-w-2xl space-y-6 text-center">
                {messages[0] && (
                  <p className="text-xl font-semibold text-stone-800">
                    {messages[0].content.replace(/\*\*/g, "")}
                  </p>
                )}
                <div className="w-full">{inputForm}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {["🥛 whole milk gallon", "🧻 paper towels", "🎧 Beats headphones", "🍦 vanilla ice cream"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendMessage(s.replace(/^\S+\s/, ""))}
                      className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-600 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          /* ── ACTIVE CHAT: messages + bottom bar ── */
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-1 sm:px-2">
                {messages.filter((m) => m.id !== "welcome").map((msg) => (
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
                {loading && (
                  <div className="flex gap-3 animate-fade-in">
                    <BrandHomeMark size="xs" pulse />
                    <p className="text-[15px] leading-relaxed text-stone-400">
                      {(loadingMode === "shopping" ? SHOPPING_LOADING_STEPS : CHAT_LOADING_STEPS)[
                        loadingStepIndex
                      ]}
                      <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-stone-300 align-middle">&nbsp;</span>
                    </p>
                  </div>
                )}
                <div ref={bottomRef} className="h-4" />
              </div>
            </div>

            <div className="shrink-0 border-t border-stone-200/60 bg-white/90 px-4 py-4 backdrop-blur-md lg:px-8">
              <div className="mx-auto max-w-6xl px-1 sm:px-2">
                {inputForm}
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  ZIP is used for shipping estimates only. Affiliate disclosure applies.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
