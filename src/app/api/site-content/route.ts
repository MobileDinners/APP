import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  ContentError,
  checkContentClaims,
  getSiteContent,
  isPlatformAdmin,
  resetSiteContent,
  saveSiteContent,
  siteContentMeta,
  validateContent,
} from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The platform's own header and footer copy.
 *
 * Guarded by MD_ADMIN_EMAILS rather than a restaurant role: this text appears
 * on every diner's screen for every restaurant, so a single taqueria's owner
 * is emphatically not the right person to hold the pen.
 */
async function requireAdmin() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return { error: NextResponse.json({ error: "Staff sign-in required" }, { status: 401 }) };
  }
  if (!isPlatformAdmin(session.email)) {
    // Deliberately not "you are not an admin" — that confirms the account is
    // real and the endpoint exists to someone who has stolen a staff cookie.
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { session };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const content = getSiteContent();
  return NextResponse.json({
    content,
    meta: siteContentMeta(),
    claims: checkContentClaims(content),
  });
}

export async function PUT(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const content = validateContent(body);

    // Same standard the restaurant site builder is held to: an allergen or
    // health claim is refused outright, warnings are returned and shown.
    const claims = checkContentClaims(content);
    const blocking = claims.filter((c) => c.severity === "block");
    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot save: ${blocking[0]!.matched} — ${blocking[0]!.reason}`,
          claims,
        },
        { status: 422 },
      );
    }

    saveSiteContent(content, gate.session.email);
    return NextResponse.json({ content, meta: siteContentMeta(), claims });
  } catch (err) {
    if (err instanceof ContentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("site content save failed", err);
    return NextResponse.json({ error: "Could not save the content" }, { status: 500 });
  }
}

/** Drops the override; the site returns to the copy that ships in the repo. */
export async function DELETE() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  resetSiteContent();
  const content = getSiteContent();
  return NextResponse.json({ content, meta: null, claims: checkContentClaims(content) });
}
