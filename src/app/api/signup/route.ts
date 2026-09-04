import { NextResponse } from "next/server";
import { loginStaff, setSessionCookie } from "@/lib/auth";
import { createRestaurant, SignupError } from "@/lib/signup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Restaurant self-signup. Creates the org and owner account, then signs the
 * owner straight in — a signup that ends at a login form is a signup that
 * loses half its conversions.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  try {
    const result = createRestaurant({
      brandName: String(body.brandName ?? ""),
      cuisine: String(body.cuisine ?? ""),
      address: String(body.address ?? ""),
      ownerName: String(body.ownerName ?? ""),
      email,
      password,
    });

    const login = loginStaff(email, password);
    if (login.ok) await setSessionCookie(login.token, login.ttlMs);

    return NextResponse.json({
      ok: true,
      orgId: result.orgId,
      slug: result.slug,
      signedIn: login.ok,
      next: "/ops/menu",
    });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status },
      );
    }
    console.error("signup failed", err);
    return NextResponse.json(
      { error: "Could not create the account" },
      { status: 500 },
    );
  }
}
