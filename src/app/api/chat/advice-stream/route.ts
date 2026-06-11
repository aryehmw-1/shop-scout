import { getSessionUserId } from "@/lib/auth/session";
import { buildReplyContext, defaultSession } from "@/lib/conversation/engine";
import { resolveChatTurn } from "@/lib/conversation/turn";
import { generateAssistantReply, streamAssistantReply } from "@/lib/ai/generate-reply";
import type { ChatRequest, SessionState } from "@/lib/types";
import { NextResponse } from "next/server";

/**
 * Streaming chat endpoint used for buying-advice turns. Emits newline-delimited
 * JSON frames so the client can render the answer as it's generated:
 *   { "type": "meta", ... }   — session/chips/results metadata (sent first)
 *   { "type": "delta", "text" } — incremental reply text (one or many)
 *   { "type": "done" }          — stream finished
 *
 * Only advice turns are token-streamed; any other turn falls back to a single
 * buffered reply delivered through the same frame protocol, so the client can
 * treat every response uniformly.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const session: SessionState = body.session ?? defaultSession();
  // `||` (not `??`) so an empty-string zipCode never clobbers the session ZIP.
  const zipCode = body.zipCode || session.intent.zipCode || "";
  const userId = (await getSessionUserId()) ?? undefined;
  const progressive = body.progressive !== false;

  const turn = await resolveChatTurn(
    message,
    session,
    zipCode,
    body.learningProfile,
    userId,
    body.history,
    progressive,
  );

  const ctx = buildReplyContext(message, turn, body.history);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));

      send({
        type: "meta",
        resolvedQuery: turn.query ?? turn.session.intent.query,
        chips: turn.chips,
        productResults: turn.productResults,
        commerceInsight:
          turn.commerceInsight ?? turn.productResults?.intelligenceInsight,
        compareMode: turn.compareMode,
        session: turn.session,
        conversationDebug: turn.conversationDebug,
      });

      try {
        // Token-stream advice AND plain conversational answers (general
        // questions) — anything that's a pure text reply. Product/price
        // searches carry results, not a streamed essay, so they're emitted as a
        // single buffered delta to keep the results pipeline intact.
        const tokenStream =
          turn.adviceMode || (turn.action === "conversational" && !turn.productResults);
        if (tokenStream) {
          for await (const delta of streamAssistantReply(ctx)) {
            send({ type: "delta", text: delta });
          }
        } else {
          const reply = await generateAssistantReply(ctx);
          send({ type: "delta", text: reply });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("advice-stream error:", detail);
        send({ type: "error", detail });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// Avoid any caching/buffering of the streamed response.
export const dynamic = "force-dynamic";
