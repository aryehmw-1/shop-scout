import { verifyUser, toPublicUser } from "@/lib/auth/users";
import { setSessionCookie } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const user = await verifyUser(String(email ?? "").trim(), String(password ?? ""));

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await setSessionCookie(user.id);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
