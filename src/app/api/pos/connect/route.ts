import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { can, getSession } from "@/lib/auth";
import { availableProviders, provider, type ProviderId } from "@/lib/pos";
import { saveConnection } from "@/lib/pos/sync";
import { listMenu } from "@/lib/orders";
import { seedSandbox } from "@/lib/pos/sandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "md_pos_state";

export async function GET() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  return NextResponse.json({ providers: availableProviders() });
}

/** Begins the connection. Returns a URL the operator is sent to. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  // Connecting a till exposes sales history and lets us write orders into it.
  if (!can(session.role, "publish_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can connect a POS" },
      { status: 403 },
    );
  }

  let body: { provider?: ProviderId };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const id = body.provider;
  if (!id || !["square", "clover", "sandbox"].includes(id)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const p = provider(id);
  if (!p.configured()) {
    return NextResponse.json(
      { error: `${p.name} is not configured on this server.` },
      { status: 409 },
    );
  }

  // The sandbox has no OAuth: connect immediately and seed it from the current
  // menu so there is something to sync against.
  if (id === "sandbox") {
    const tokens = await p.exchangeCode("", "");
    saveConnection(session.orgId, id, tokens);
    seedSandbox(
      session.orgId,
      listMenu(session.orgId).map((i) => ({
        itemId: i.itemId,
        name: i.name,
        description: i.description,
        priceCents: i.priceCents,
      })),
    );
    return NextResponse.json({ connected: true });
  }

  // CSRF: the callback must prove it came from a request we started.
  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, `${id}:${session.orgId}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    authorizeUrl: p.authorizeUrl(state, `${origin}/api/pos/callback`),
  });
}
