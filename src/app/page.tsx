import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";

export default function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-stone-500">Loading…</div>}>
        <ChatApp showHero />
      </Suspense>
    </div>
  );
}
