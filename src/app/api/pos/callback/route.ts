import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { provider, type ProviderId } from "@/lib/pos";
import { saveConnection } from "@/lib/pos/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "md_pos_state";

/**
 * OAuth return leg. Everything here is checked before a token is stored:
 * the signed-in staff member, the state cookie we set, and that the state in
 * the URL matches it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const back = (msg: string) =>
    NextResponse.redirect(new URL(`/ops/pos?msg=${encodeURIComponent(msg)}`, url.origin));

  if (denied) return back(`The POS refused the connection: ${denied}`);
  if (!code || !state || !cookie) return back("That connection attempt expired. Try again.");

  const [providerId, orgId, expected] = cookie.split(":");
  if (state !== expected) return back("Connection could not be verified. Try again.");

  // The staff session must still be valid AND belong to the same restaurant.
  const session = await getSession();
  if (session?.kind !== "staff" || session.orgId !== orgId) {
    return back("Sign in again to finish connecting your POS.");
  }

  try {
    const p = provider(providerId as ProviderId);
    const tokens = await p.exchangeCode(code, `${url.origin}/api/pos/callback`);
    saveConnection(orgId, providerId as ProviderId, tokens);
    return NextResponse.redirect(new URL("/ops/pos?msg=Connected", url.origin));
  } catch (err) {
    console.error("POS callback failed", err);
    return back(`Could not finish connecting: ${(err as Error).message}`);
  }
}
