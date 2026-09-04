import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import {
  CampaignError,
  launch,
  listCampaigns,
  previewAudience,
  TEMPLATES,
} from "@/lib/campaigns";
import type { Segment } from "@/lib/crm-labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  // ?preview=<templateId> returns the audience without creating anything.
  const url = new URL(req.url);
  const templateId = url.searchParams.get("preview");
  if (templateId) {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return NextResponse.json({ error: "Unknown template" }, { status: 404 });
    const holdout = Number(url.searchParams.get("holdout") ?? 10);
    return NextResponse.json({
      preview: previewAudience(
        session.orgId, t.segment as Segment, t.channel, holdout, t.offerType, t.offerValue,
      ),
    });
  }

  return NextResponse.json({ campaigns: listCampaigns(session.orgId) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  // Sending to guests spends money and reputation; a shift lead cannot do it.
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can send a campaign" },
      { status: 403 },
    );
  }

  let body: { templateId?: string; holdoutPct?: number; ignoreQuietHours?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }

  try {
    const { campaign, preview } = launch({
      orgId: session.orgId,
      templateId: body.templateId,
      holdoutPct: body.holdoutPct ?? 10,
      createdBy: session.staffId,
      // Quiet hours can only be waived outside production.
      ignoreQuietHours:
        process.env.NODE_ENV !== "production" && body.ignoreQuietHours === true,
    });
    return NextResponse.json({ campaign, preview }, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("campaign launch failed", err);
    return NextResponse.json({ error: "Could not start the campaign" }, { status: 500 });
  }
}
