import { createUser } from "@/lib/auth/users";
import { setSessionCookie } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    const zipCode = String(body.zipCode ?? body.address?.zipCode ?? "")
      .replace(/\D/g, "")
      .slice(0, 5);

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: "Email and password (6+ characters) are required" },
        { status: 400 },
      );
    }
    if (zipCode.length !== 5) {
      return NextResponse.json(
        { error: "A valid 5-digit ZIP code is required" },
        { status: 400 },
      );
    }

    const user = await createUser({
      email,
      password,
      name: name || email.split("@")[0],
      address: {
        zipCode,
        street: body.address?.street,
        city: body.address?.city,
        state: body.address?.state,
        label: body.address?.label ?? "Home",
      },
    });

    await setSessionCookie(user.id);

    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
