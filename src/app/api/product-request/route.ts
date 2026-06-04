import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { signToken } from "@/lib/product-request-token";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "Aryehmweiss@icloud.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@homivion.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homivion.com";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_placeholder")) return null;
  return new Resend(key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productQuery = (body.productQuery ?? "").trim();
    const userEmail = (body.userEmail ?? "").trim().toLowerCase();

    if (!productQuery || !userEmail) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Save to DB
    const request = await prisma.productRequest.create({
      data: { productQuery, userEmail, status: "pending" },
    });

    // Build one-click approve / decline URLs
    const approveUrl = `${APP_URL}/api/product-request/review?id=${request.id}&action=approve&token=${signToken(request.id, "approve")}`;
    const declineUrl = `${APP_URL}/api/product-request/review?id=${request.id}&action=decline&token=${signToken(request.id, "decline")}`;

    // Email to owner with approve / decline buttons
    const resend = getResend();
    await resend?.emails.send({
      from: FROM_EMAIL,
      to: OWNER_EMAIL,
      subject: `🛒 New product request: ${productQuery}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1c1917;margin-bottom:4px;font-size:20px">New Product Request</h2>
          <p style="color:#78716c;margin-top:0;margin-bottom:24px;font-size:14px">
            A user asked for a product Homivion doesn't carry yet.
          </p>

          <!-- Details table -->
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
            <tr>
              <td style="padding:10px 14px;background:#f5f5f4;border-radius:10px 10px 0 0;font-weight:600;color:#44403c;width:130px;white-space:nowrap">
                Product
              </td>
              <td style="padding:10px 14px;background:#f5f5f4;border-radius:10px 10px 0 0;color:#1c1917;font-weight:600;font-size:15px">
                ${productQuery}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fafaf9;font-weight:600;color:#44403c">
                User email
              </td>
              <td style="padding:10px 14px;background:#fafaf9;color:#1c1917">
                ${userEmail}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f5f5f4;border-radius:0 0 10px 10px;font-weight:600;color:#44403c">
                Request ID
              </td>
              <td style="padding:10px 14px;background:#f5f5f4;border-radius:0 0 10px 10px;color:#a8a29e;font-size:12px;font-family:monospace">
                ${request.id}
              </td>
            </tr>
          </table>

          <!-- Action buttons -->
          <p style="font-size:14px;font-weight:600;color:#44403c;margin-bottom:12px">
            Add this product to Homivion?
          </p>
          <table style="border-collapse:collapse">
            <tr>
              <td style="padding-right:10px">
                <a href="${approveUrl}"
                   style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;
                          font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;
                          letter-spacing:0.01em">
                  ✅ Yes, add it
                </a>
              </td>
              <td>
                <a href="${declineUrl}"
                   style="display:inline-block;background:#f5f5f4;color:#78716c;text-decoration:none;
                          font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;
                          border:1px solid #e7e5e4">
                  🚫 No, decline
                </a>
              </td>
            </tr>
          </table>

          <p style="margin-top:24px;font-size:12px;color:#d6d3d1">
            Clicking a button will instantly update the database. The user will be notified by email if approved.
          </p>
        </div>
      `,
    });

    // Confirmation email to user
    await resend?.emails.send({
      from: FROM_EMAIL,
      to: userEmail,
      subject: `We got your request — Homivion`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1c1917;margin-bottom:8px">We've got it! 🎉</h2>
          <p style="color:#44403c;margin-top:0;line-height:1.6">
            Thanks for letting us know. We've added
            <strong style="color:#1c1917">${productQuery}</strong> to our request list
            and will review it shortly.
          </p>
          <p style="color:#44403c;line-height:1.6;margin-top:10px">
            If approved, we'll email you right here so you can start comparing prices.
          </p>
          <div style="margin:24px 0;border-left:3px solid #f97316;padding-left:16px;color:#78716c;font-size:14px">
            Your request: <em>${productQuery}</em>
          </div>
          <p style="color:#a8a29e;font-size:13px">— The Homivion team</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, id: request.id });
  } catch (err) {
    console.error("[product-request] error:", err);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
