import { getSessionUserId, refreshSessionCookie } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/users";
import { NextResponse } from "next/server";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const user = await findUserById(userId);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  await refreshSessionCookie(userId);
  return NextResponse.json({ user });
}
