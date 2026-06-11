import { getSessionUserId } from "@/lib/auth/session";
import { processMessage, defaultSession } from "@/lib/conversation/engine";
import type { ChatRequest, SessionState } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const session: SessionState = body.session ?? defaultSession();
    // Use `||` (not `??`) so an empty-string zipCode from the client doesn't
    // clobber a ZIP the user already set on the session.
    const zipCode = body.zipCode || session.intent.zipCode || "";

    const userId = (await getSessionUserId()) ?? undefined;

    const result = await processMessage(
      message,
      session,
      zipCode,
      body.learningProfile,
      body.history,
      userId,
      body.progressive !== false,
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack?.slice(0, 500) : "";
    console.error("chat error:", msg, stack);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", detail: msg },
      { status: 500 },
    );
  }
}
