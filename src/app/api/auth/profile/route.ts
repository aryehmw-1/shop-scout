import { getSessionUserId } from "@/lib/auth/session";
import { updateUser } from "@/lib/auth/users";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const patch: Parameters<typeof updateUser>[1] = {};

    if (body.name) patch.name = String(body.name).trim();
    if (body.address) {
      const zip = String(body.address.zipCode ?? "")
        .replace(/\D/g, "")
        .slice(0, 5);
      if (zip.length !== 5) {
        return NextResponse.json({ error: "Invalid ZIP" }, { status: 400 });
      }
      patch.address = {
        zipCode: zip,
        label: body.address.label ?? "Home",
      };
    }
    if (body.preferences) patch.preferences = body.preferences;
    if (body.savedOffers) patch.savedOffers = body.savedOffers;

    const user = await updateUser(userId, patch);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
