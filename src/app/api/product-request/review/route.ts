import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { verifyToken } from "@/lib/product-request-token";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@homivion.com";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_placeholder")) return null;
  return new Resend(key);
}

function htmlPage(title: string, emoji: string, body: string, color: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Homivion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #fafaf9; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 20px;
            max-width: 480px; width: 100%; padding: 40px 36px; text-align: center;
            box-shadow: 0 8px 40px rgba(0,0,0,0.07); }
    .emoji { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #1c1917; margin-bottom: 10px; }
    p { font-size: 15px; color: #78716c; line-height: 1.6; margin-bottom: 8px; }
    .highlight { font-weight: 600; color: #1c1917; }
    .badge { display: inline-block; margin-top: 20px; padding: 8px 20px;
             border-radius: 999px; font-size: 13px; font-weight: 600;
             background: ${color}22; color: ${color}; border: 1px solid ${color}55; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    ${body}
    <div class="badge">Homivion Admin</div>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id") ?? "";
  const action = searchParams.get("action") as "approve" | "decline" | null;
  const token = searchParams.get("token") ?? "";

  if (!id || !action || !["approve", "decline"].includes(action)) {
    return htmlPage("Invalid Link", "⚠️", "<p>This link is missing required parameters.</p>", "#ef4444");
  }

  if (!verifyToken(id, action, token)) {
    return htmlPage("Link Expired", "🔒", "<p>This link is no longer valid or has already been used.</p>", "#f97316");
  }

  const existing = await prisma.productRequest.findUnique({ where: { id } });

  if (!existing) {
    return htmlPage("Not Found", "🔍", "<p>This product request no longer exists.</p>", "#a8a29e");
  }

  if (existing.status !== "pending") {
    const already = existing.status === "added" ? "already approved" : "already declined";
    return htmlPage("Already Reviewed", "✅", `<p>This request was <span class="highlight">${already}</span> previously.</p>`, "#a8a29e");
  }

  if (action === "approve") {
    await prisma.productRequest.update({
      where: { id },
      data: { status: "added", notifiedAt: new Date() },
    });

    // Notify the user their product is being added
    try {
      await getResend()?.emails.send({
        from: FROM_EMAIL,
        to: existing.userEmail,
        subject: `Great news — your product is being added to Homivion! 🎉`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#1c1917;margin-bottom:8px">Your request was approved! 🎉</h2>
            <p style="color:#44403c;line-height:1.6;margin-bottom:12px">
              We've approved your request and are adding
              <strong style="color:#1c1917">${existing.productQuery}</strong>
              to Homivion right now.
            </p>
            <p style="color:#44403c;line-height:1.6;margin-bottom:24px">
              Head back to <a href="https://homivion.com/chat" style="color:#f97316;font-weight:600">Homivion.com</a>
              in a little while and search for it — you'll be able to compare prices across stores.
            </p>
            <div style="border-left:3px solid #f97316;padding-left:16px;color:#78716c;font-size:14px;margin-bottom:24px">
              Your request: <em>${existing.productQuery}</em>
            </div>
            <p style="color:#a8a29e;font-size:13px">— The Homivion team</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[product-request/review] failed to send approval email", e);
    }

    return htmlPage(
      "Product Approved ✓",
      "✅",
      `<p>You've approved <span class="highlight">${existing.productQuery}</span>.</p>
       <p style="margin-top:8px">The user at <span class="highlight">${existing.userEmail}</span> has been notified by email.</p>`,
      "#22c55e",
    );
  }

  // decline
  await prisma.productRequest.update({
    where: { id },
    data: { status: "declined", notifiedAt: new Date() },
  });

  return htmlPage(
    "Request Declined",
    "🚫",
    `<p>You've declined <span class="highlight">${existing.productQuery}</span>.</p>
     <p style="margin-top:8px;font-size:13px;color:#a8a29e">No email was sent to the user.</p>`,
    "#ef4444",
  );
}
