import { Suspense } from "react";
import type { Metadata } from "next";
import { ChatPageClient } from "./ChatPageClient";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Shop smarter",
  description:
    "Compare pricing across major retailers. Explainable best deals, trust scores, and price history.",
  openGraph: {
    title: `Shop smarter · ${APP_NAME}`,
    description:
      "Ask what you need or paste a product link — get compare pricing with explainable deal ranking.",
  },
};

interface ChatPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-stone-500">
            Loading assistant…
          </div>
        }
      >
        <ChatPageClient />
      </Suspense>
    </div>
  );
}
