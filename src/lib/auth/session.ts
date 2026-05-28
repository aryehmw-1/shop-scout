import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "pantry_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days — stay signed in

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? "pantry-scout-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.userId ?? null;
}

/** Extend cookie expiry on each visit so active users stay logged in */
export async function refreshSessionCookie(userId: string) {
  await setSessionCookie(userId);
}
