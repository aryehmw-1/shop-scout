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
    const zipCode = body.zipCode ?? session.intent.zipCode ?? "78701";

    const userId = (await getSessionUserId()) ?? undefined;

    const result = await processMessage(
      message,
      session,
      zipCode,
      body.learningProfile,
      body.history,
      userId,
    );

    return NextResponse.json(result);
  } catch (e) {
    console.error("chat error", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
