import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatPageClient } from "./ChatPageClient";

export default function ChatPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-stone-500">
            Loading assistant…
          </div>
        }
      >
        <ChatPageClient />
      </Suspense>
    </AppShell>
  );
}
