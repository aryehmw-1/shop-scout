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
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { trackEvent } from "@/lib/analytics/track-client";
import { mergeEnrichedSearchResults } from "@/lib/search/merge-enriched-results";
import { useRouter } from "next/navigation";
import { MapPin, ShoppingBasket, Headphones, Wheat, Plus, Loader2, RotateCcw } from "lucide-react";
import { SearchSendIcon } from "@/components/icons/SearchSendIcon";
import { TypewriterInput } from "@/components/TypewriterInput";
import { identifyProductImage } from "@/lib/vision/identify-client";
import { PHOTO_SEARCH_ENABLED } from "@/lib/config/features";

const SHOPPING_LOADING_STEPS = [
  "Checking the database for saved prices...",
  "Searching live offers across stores...",
  "Comparing prices from every retailer...",
  "Hunting down the best delivered price...",
];

const CHAT_LOADING_STEPS = [
  "Thinking about your question...",
  "Putting together a clear answer...",
  "Weighing the best options for you...",
  "Gathering my thoughts on this...",
];

/** Fisher–Yates shuffle — returns a new randomly-ordered copy. */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Advice / opinion / sizing questions are NOT product searches — even when a
 * product link is pasted alongside ("looking into this product: <url> ... do
 * you think I should size down?"). Detect them so the loading state says
 * "Thinking about your question..." instead of "Searching live offers...",
 * keeping the UI in sync with the conversational answer the server returns.
 */
function looksLikeAdviceRequest(text: string) {
  const t = text.toLowerCase();
  if (/\b(compare|cheapest|lowest price|best price|where (can|to) (i )?buy|price check|find me)\b/.test(t)) {
    return false;
  }
  return (
    /\bdo you think\b/.test(t) ||
    /\bwhat do you (recommend|think|suggest)\b/.test(t) ||
    /\bshould i\b.{0,40}\b(get|buy|order|pick|choose|go|size|keep|return)\b/.test(t) ||
    /\b(size up|size down|too (big|small|large|tight|loose)|what size|which size)\b/.test(t) ||
    /\bis (it|this) worth it\b/.test(t) ||
    /\bwould you (recommend|get|buy|keep|return)\b/.test(t) ||
    /\bhelp me (pick|choose|decide)\b/.test(t)
  );
}

/**
 * A natural-language QUESTION that isn't a product/price lookup — e.g. "what's
 * the best material for running socks?", "how does noise cancelling work?".
 * These get a pure text answer, so we route them to the streaming endpoint to
 * start typing immediately. Product/price searches and bare product names are
 * excluded so they keep their reliable results pipeline.
 */
function looksLikeGeneralQuestion(text: string) {
  const t = text.trim().toLowerCase();
  if (looksLikeShoppingRequest(text)) return false;
  if (/https?:\/\/|www\./.test(t)) return false;
  const isQuestion =
    /\?\s*$/.test(t) ||
    /^(what|why|how|which|is|are|should|can|does|do|who|when|where|tell me|explain)\b/.test(t);
  // Require a few words so bare nouns like "milk?" stay on the search path.
  return isQuestion && t.split(/\s+/).filter(Boolean).length >= 3;
}

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
}

/** Approx height (px) of the composer textarea on a single line — anything taller
 *  is "extra" growth that the spacer compensates for. */
const SINGLE_LINE_INPUT_H = 52;

export function ChatApp({ initialMessage, initialZip, inputHint }: ChatAppProps) {
  const router = useRouter();
  const { user, updateAddress, syncSavedOffers } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<SessionState>(defaultSession());
  const [zipCode, setZipCode] = useState(initialZip ?? "");
  const [loading, setLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [loadingMode, setLoadingMode] = useState<"chat" | "shopping">("chat");
  const [loadingPhrases, setLoadingPhrases] = useState<string[]>(CHAT_LOADING_STEPS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showLocation, setShowLocation] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [linkPasteMode, setLinkPasteMode] = useState(inputHint === "link");
  const [learningProfile, setLearningProfile] = useState(loadLearningProfile);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Extra height the growing composer adds beyond one line — drives a spacer so
  // a tall input never covers the latest results, and the view shifts back when
  // text is deleted.
  const [inputExtraHeight, setInputExtraHeight] = useState(0);
  const sessionRef = useRef(session);
  const messagesRef = useRef(messages);
  // Always holds the freshest ZIP so a search can never send a stale value from
  // a closure captured before the user finished typing/changing the ZIP.
  const zipRef = useRef(initialZip ?? "");
  const initialSent = useRef(false);
  const linkHintApplied = useRef(false);
  const chatInitialized = useRef(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [scanningPhoto, setScanningPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
      setInputExtraHeight(0);
    }
  }, [input]);

  // Keep the conversation pinned to the bottom as the composer grows/shrinks, so
  // the latest results stay visible just above the input (and slide back down
  // when the user deletes text).
  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }, [inputExtraHeight]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    zipRef.current = zipCode;
  }, [zipCode]);

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

  // "New chat" now lives in the sidebar/drawer; it fires this global event so it
  // can reset the live chat no matter which nav surface triggered it.
  useEffect(() => {
    const handler = () => resetChat();
    window.addEventListener("homivion:new-chat", handler);
    return () => window.removeEventListener("homivion:new-chat", handler);
  }, [resetChat]);

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

  // Apply the per-turn session updates returned by the server (session state,
  // learning profile, and ZIP sync). Shared by the buffered and streaming
  // request paths so both stay in sync.
  const applySessionSideEffects = useCallback(
    (sess: SessionState | undefined) => {
      if (!sess) return;
      setSession(sess);
      if (sess.intent?.query) {
        setLearningProfile(
          learnFromSearch({
            query: sess.intent.query,
            category: sess.intent.category,
            gender: sess.intent.gender,
            ageGroup: sess.intent.ageGroup,
            zipCode: sess.intent.zipCode,
          }),
        );
      }
      if (sess.intent?.zipCode) {
        const z = sess.intent.zipCode;
        if (isValidZip(z) && z !== zipRef.current) {
          setZipCode(z);
          zipRef.current = z;
        }
        persistAddress({
          ...(loadAddress() ?? { label: "Home" }),
          zipCode: z,
        });
      }
    },
    [persistAddress],
  );

  // Stream a buying-advice reply, rendering it token-by-token. Inserts an empty
  // assistant bubble and fills it as NDJSON frames arrive from the server.
  const streamAdviceReply = useCallback(
    async ({
      body,
      applySession,
    }: {
      body: string;
      applySession: (sess: SessionState | undefined) => void;
    }) => {
      const res = await fetch("/api/chat/advice-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      if (!res.ok || !res.body) throw new Error(`advice-stream ${res.status}`);

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      const handleFrame = (frame: Record<string, unknown>) => {
        if (frame.type === "meta") {
          applySession(frame.session as SessionState | undefined);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    resolvedQuery: frame.resolvedQuery as string | undefined,
                    productResults: frame.productResults as ChatMessage["productResults"],
                    commerceInsight: frame.commerceInsight as ChatMessage["commerceInsight"],
                    compareMode: frame.compareMode as boolean | undefined,
                    chips: frame.chips as string[] | undefined,
                    conversationDebug:
                      frame.conversationDebug as ChatMessage["conversationDebug"],
                  }
                : m,
            ),
          );
        } else if (frame.type === "delta") {
          acc += (frame.text as string) ?? "";
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
      };

      const drain = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleFrame(JSON.parse(line));
          } catch {
            /* ignore partial/non-JSON line */
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        drain(decoder.decode(value, { stream: true }));
      }
      if (buffer.trim()) {
        try {
          handleFrame(JSON.parse(buffer));
        } catch {
          /* ignore */
        }
      }

      // If the stream produced no text at all, show a graceful fallback.
      if (!acc.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry — I couldn't put that together. Try again?" }
              : m,
          ),
        );
      }
    },
    [],
  );

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      setLoadingStepIndex(0);
      return;
    }
    // Pick a fresh random order each time so the "thinking" lines feel varied.
    const steps = shuffled(
      loadingMode === "shopping" ? SHOPPING_LOADING_STEPS : CHAT_LOADING_STEPS,
    );
    setLoadingPhrases(steps);
    setLoadingStepIndex(0);
    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) => Math.min(current + 1, steps.length - 1));
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
    // Outbound retailer click → ProductClick(kind=retailer) + PostHog.
    trackEvent({
      name: "retailer_clicked",
      properties: { retailer: offer.retailer, productId: offer.catalogId },
    });
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
      setLoadingMode(
        looksLikeAdviceRequest(trimmed)
          ? "chat"
          : looksLikeShoppingRequest(trimmed)
            ? "shopping"
            : "chat",
      );
      setLoading(true);
      const searchStarted = Date.now();

      trackEvent({
        name: "search_performed",
        properties: { query: trimmed, source: "chat" },
      });

      const requestBody = JSON.stringify({
        message: trimmed,
        session: sessionRef.current,
        // Send undefined (not "") when no ZIP is set, so the server falls
        // back to the session's stored ZIP instead of treating an empty
        // string as an intentional "no ZIP" override.
        zipCode: zipRef.current || zipCode || undefined,
        learningProfile,
        progressive: true,
        history: [...messagesRef.current, userMsg].slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      // Buying-advice turns stream token-by-token so the answer starts
      // appearing immediately ("typing") instead of waiting ~10s for the whole
      // reply. Speed is the product, so advice goes through the streaming route.
      // We also stream the user's REPLY within an ongoing advice thread (the
      // server marks the session `advicePending`) unless they're now clearly
      // asking for a price lookup — mirroring the server's routing.
      const inAdviceThread =
        Boolean(sessionRef.current?.advicePending) && !looksLikeShoppingRequest(trimmed);
      if (
        looksLikeAdviceRequest(trimmed) ||
        inAdviceThread ||
        looksLikeGeneralQuestion(trimmed)
      ) {
        try {
          await streamAdviceReply({
            body: requestBody,
            applySession: applySessionSideEffects,
          });
        } catch (err) {
          console.error("[chat] advice stream failed:", err);
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
        return;
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: requestBody,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("[chat] API error:", res.status, errData);
          throw new Error(errData?.detail ?? "Chat failed");
        }

        const data = await res.json();
        // setSession + learning profile + ZIP sync (see helper for the ZIP
        // clobber note).
        applySessionSideEffects(data.session);

        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: data.reply,
          resolvedQuery: data.resolvedQuery,
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
    [
      loading,
      zipCode,
      persistAddress,
      learningProfile,
      router,
      inputHint,
      applySessionSideEffects,
      streamAdviceReply,
    ],
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

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || loading || scanningPhoto) return;
    setScanningPhoto(true);
    try {
      const { query, error } = await identifyProductImage(file);
      if (query) {
        setInput(query);
        sendMessage(query);
      } else {
        setInput(error ?? "Couldn't read that photo. Try a clearer shot.");
      }
    } finally {
      setScanningPhoto(false);
    }
  }

  const inputForm = (
    <form
      action="/chat"
      method="get"
      className="mx-auto w-full max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const typed = String(data.get("q") ?? input);
        sendMessage(typed);
      }}
    >
      <div className="relative">
        {/* Photo search — hidden in the public UI (PHOTO_SEARCH_ENABLED), full
            backend preserved. The file input + handler stay mounted only when
            the feature is on. */}
        {PHOTO_SEARCH_ENABLED && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhoto}
            />
            <button
              type="button"
              aria-label="Add a product photo"
              title="Add a product photo"
              onClick={() => fileRef.current?.click()}
              disabled={loading || scanningPhoto}
              className="absolute bottom-3.5 left-2.5 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-orange-50 hover:text-orange-500 disabled:opacity-50"
            >
              {scanningPhoto ? (
                <Loader2 size={20} strokeWidth={2.2} className="animate-spin text-orange-500" aria-hidden />
              ) : (
                <Plus size={20} strokeWidth={2.2} aria-hidden />
              )}
            </button>
          </>
        )}
        <textarea
          ref={inputRef}
          name="q"
          rows={1}
          aria-label="Search products"
          spellCheck
          autoComplete="off"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            const nextH = Math.min(el.scrollHeight, 14 * 16);
            el.style.height = nextH + "px";
            // Grow a spacer + keep the conversation anchored so a tall input
            // bar never hides the latest results (Claude-style composer growth).
            setInputExtraHeight(Math.max(0, nextH - SINGLE_LINE_INPUT_H));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const q = input.trim();
              if (q) sendMessage(q);
            }
          }}
          placeholder={
            scanningPhoto
              ? "Reading your photo…"
              : linkPasteMode
                ? "Paste a product page URL"
                : "Ask for a product or paste a link"
          }
          /* text-base (16px) is required: iOS Safari auto-zooms the page when a
             focused input has a font smaller than 16px. After a search the focus
             returns here, so anything under 16px makes the page zoom in. */
          className={`w-full resize-none overflow-y-auto rounded-2xl border border-orange-200/70 bg-white py-3.5 ${PHOTO_SEARCH_ENABLED ? "pl-12" : "pl-5"} pr-14 text-base text-ink-800 shadow-[0_8px_30px_rgba(234,88,12,0.12)] placeholder:text-ink-400 focus:border-orange-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200/50`}
          style={{ maxHeight: "14rem" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          aria-label="Send"
          className="absolute bottom-3.5 right-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-400/30 transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40"
        >
          <SearchSendIcon size={18} />
        </button>
      </div>
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

      {/* The orange canvas owns the full height on the chat screen (AppShell
          skips its top reserve for scroll="none"), so the header is the top lane. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-orange-50">
        {/* Mobile: a single top lane on the orange background. pl-16 reserves room
            for the fixed sidebar (menu) button so it shares this row with the ZIP;
            on lg there's no floating button so we revert to normal padding. */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 bg-orange-50 pl-16 pr-4 lg:h-auto lg:px-8 lg:py-3">
          {/* Desktop keeps New chat in the header; mobile uses the sidebar drawer. */}
          <button
            type="button"
            onClick={resetChat}
            disabled={loading}
            className="hidden items-center gap-2 rounded-xl border border-orange-200/80 bg-white px-3 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40 lg:flex"
            title="Clear chat and start over"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">New chat</span>
          </button>
          {/* ZIP pill — pinned top-right (ml-auto) so it never sits next to the
              mobile menu button. Tapping anywhere on the pill focuses the input,
              so the same gesture works on the label or the digits. The input uses
              a 16px font so iOS Safari doesn't zoom in when it's focused. */}
          <label
            className="ml-auto flex cursor-text items-center gap-2 rounded-xl border border-sage-200 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-800 transition hover:bg-sage-100"
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
              placeholder="-----"
              className="w-[4.5rem] bg-transparent text-center text-base font-bold text-stone-900 placeholder:text-stone-300 focus:outline-none"
              maxLength={5}
              aria-label="ZIP code for shipping"
            />
          </label>
        </header>

        {/* ── EMPTY STATE ── */}
        {isEmpty ? (
          (
            /* Hero layout — always the home page (incl. after a chat reset):
               "How can I help you shop?" + the three quick-action products. */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto overscroll-contain px-4 pb-10 pt-[18vh] text-center sm:px-6 sm:pt-[20vh] lg:px-8">
              <div className="w-full max-w-3xl">
                <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-stone-950 sm:text-4xl lg:text-[2.75rem]">
                  {user?.name
                    ? `How can I help you shop, ${firstName(user.name)}?`
                    : "How can I help you shop?"}
                </h1>

                {/* Search pill — submits directly into this ChatApp */}
                <div className="mt-7 sm:mt-8">
                  <TypewriterInput onSearch={(q) => { if (q) sendMessage(q); }} />
                </div>

                {/* Quick-action chips */}
                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:gap-3">
                  {[
                    { label: "Whole milk gallon", icon: ShoppingBasket, q: "whole milk gallon" },
                    { label: "Beats Studio Pro", icon: Headphones, q: "Beats Studio Pro" },
                    { label: "Honey Nut Cheerios", icon: Wheat, q: "Honey Nut Cheerios" },
                  ].map(({ label, icon: Icon, q }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-stone-950"
                    >
                      <Icon size={17} className="text-orange-500" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          /* ── ACTIVE CHAT: messages + floating bottom bar ── */
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-6 pb-20 lg:px-8 lg:pb-24">
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
                      : // Assistant turn: use the server-resolved/merged product
                        // query (e.g. "whole milk half gallon") for the results
                        // card and request form — never the raw conversational
                        // message ("sure, do you have half a gallon?").
                        msg.resolvedQuery ??
                        (messages[messages.indexOf(msg) - 1]?.role === "user"
                          ? messages[messages.indexOf(msg) - 1]?.content
                          : undefined)
                    }
                  />
                ))}
                {loading && (
                  <div className="flex gap-3 animate-fade-in">
                    <BrandHomeMark size="xs" pulse />
                    <p className="text-[15px] leading-relaxed text-stone-400">
                      {loadingPhrases[loadingStepIndex] ?? loadingPhrases[0]}
                      <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-stone-300 align-middle">&nbsp;</span>
                    </p>
                  </div>
                )}
                {/* Grows with the composer so a tall input never covers results;
                    collapses back as the user deletes text. */}
                <div aria-hidden style={{ height: inputExtraHeight }} />
                <div ref={bottomRef} className="h-4" />
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-orange-50 from-50% via-orange-50/90 to-transparent px-4 pb-4 pt-12 lg:px-8">
              <div className="pointer-events-auto mx-auto max-w-6xl px-1 sm:px-2">
                {inputForm}
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  ZIP is used for shipping estimates only. Affiliate disclosure applies.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
