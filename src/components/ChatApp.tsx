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
import { SHOPPABLE_STORE_COUNT } from "@/lib/retailers/meta";
import type { UserAddress } from "@/lib/types";
import { Send, Link2, MapPin, RotateCcw } from "lucide-react";

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

  sessionRef.current = session;

  const buildWelcomeMessage = useCallback(
    (zip: string, forLinkPaste?: boolean, userName?: string): ChatMessage => {
      const hi = userName ? `Hi **${firstName(userName)}**! ` : "";

      if (forLinkPaste && isValidZip(zip)) {
        return {
          id: "welcome",
          role: "assistant",
          content: `${hi}Paste a **product page URL** from any store in the box below (Nike, Amazon, Target, etc.). I'll find similar items and compare prices near **${zip}** and online.`,
          chips: ["Find me mens pants", "Womens black hoodie", "Toddler sneakers"],
          timestamp: Date.now(),
        };
      }
      return {
        id: "welcome",
        role: "assistant",
        content: isValidZip(zip)
          ? `${hi}Welcome to **Shop Scout**! Near **${zip}** you'll see **two columns side by side**: nearby stores on the left, online on the right.\n\nTry natural requests like **find me mens pants** or **womens black hoodie** — I understand department and size, then compare prices across ${SHOPPABLE_STORE_COUNT} stores.`
          : `${hi}Welcome to **Shop Scout**! Enter your ZIP for nearby stores and online prices that ship to you.`,
        chips: isValidZip(zip)
          ? [
              "Find me mens pants",
              "Womens black hoodie",
              "Toddler sneakers",
            ]
          : [],
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
      setShowLocation(true);
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

      if (!isValidZip(zipCode) && !/^\d{5}$/.test(trimmed)) {
        setShowLocation(true);
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
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
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
    [loading, session, zipCode, persistAddress, learningProfile, messages],
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

      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-orange-100/80 bg-cream-50/95 px-4 py-3 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={resetChat}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-orange-200/80 bg-white px-3 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40"
            title="Clear chat and start over"
          >
            <RotateCcw size={16} />
            New chat
          </button>
          <button
            type="button"
            onClick={() => setShowLocation(true)}
            className="flex items-center gap-2 rounded-xl border border-sage-200 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-800 transition hover:bg-sage-100"
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
              aria-label="ZIP code"
            />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
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
              />
            ))}
            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-600 text-white">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:0.3s]" />
                  </span>
                </div>
                <div className="rounded-2xl border border-stone-200/80 bg-white px-5 py-4 text-sm text-stone-500 shadow-sm">
                  Checking stores near you + online…
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
            Left = stores near your ZIP · Right = online orders shipped to you.
            Affiliate disclosure applies.
          </p>
        </div>
      </div>
    </>
  );
}
