import { createHmac } from "crypto";

const SECRET = process.env.PRODUCT_REQUEST_SECRET ?? "fallback-dev-secret";

export function signToken(id: string, action: "approve" | "decline"): string {
  return createHmac("sha256", SECRET).update(`${id}:${action}`).digest("hex").slice(0, 40);
}

export function verifyToken(id: string, action: "approve" | "decline", token: string): boolean {
  return signToken(id, action) === token;
}
