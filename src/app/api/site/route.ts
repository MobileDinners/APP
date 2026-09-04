import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import {
  auditSeo,
  checkClaims,
  generateDraft,
  getSite,
  publishSite,
  saveDraft,
  SiteError,
} from "@/lib/site";
import type { PageModel } from "@/lib/site-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  const site = getSite(session.orgId);
  return NextResponse.json({
    site,
    claims: checkClaims(site.draft),
    seo: auditSeo(session.orgId),
  });
}

/** Saves the draft. Nothing here is visible to a guest until it is published. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json({ error: "Your role cannot edit the website" }, { status: 403 });
  }

  let body: { draft?: PageModel; regenerate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const draft = body.regenerate ? generateDraft(session.orgId) : body.draft;
    if (!draft || !Array.isArray(draft.sections)) {
      return NextResponse.json({ error: "A page model is required" }, { status: 400 });
    }
    const site = saveDraft(session.orgId, draft);
    return NextResponse.json({
      site,
      claims: checkClaims(site.draft),
      seo: auditSeo(session.orgId),
    });
  } catch (err) {
    if (err instanceof SiteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("site save failed", err);
    return NextResponse.json({ error: "Could not save the page" }, { status: 500 });
  }
}

/** Publishes the draft — refused while any blocking claim remains. */
export async function POST() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "publish_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can publish the website" },
      { status: 403 },
    );
  }

  try {
    const site = publishSite(session.orgId);
    return NextResponse.json({ site });
  } catch (err) {
    if (err instanceof SiteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("site publish failed", err);
    return NextResponse.json({ error: "Could not publish the page" }, { status: 500 });
  }
}
