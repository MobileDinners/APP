import { getDb } from "./db";
import { getRestaurantById, listMenu } from "./orders";
import { currentVersion } from "./menu";
import { scan, type ClaimReport } from "./claims";
import type { PageModel, Section, SeoCheck, Site, Theme } from "./site-types";

export * from "./site-types";

/**
 * Site builder — spec §2.B-01.
 *
 * Generation is templated per cuisine rather than model-written. That is a
 * deliberate limitation, not a disguise: there is no LLM wired up here, and
 * pretending otherwise would be the dishonest option. The seam is `draftCopy`
 * below — swap that one function for a model call and everything around it
 * (page model, claims filter, publish gate, SEO audit) already works.
 */

export class SiteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

const CUISINE_THEME: Record<string, Theme> = {
  Mexican: "masa",
  "Middle Eastern": "masa",
  Chinese: "ember",
  Vietnamese: "slate",
  American: "ember",
  Pizza: "ember",
};

/**
 * The copy layer. Templated from real restaurant data — never invented facts,
 * and deliberately free of anything the claims filter would reject.
 */
function draftCopy(brand: string, cuisine: string, blurb: string, address: string) {
  return {
    headline: brand,
    subhead: blurb,
    metaTitle: `${brand} — ${cuisine} in your neighbourhood`,
    metaDescription:
      `${blurb} Order ${cuisine.toLowerCase()} from ${brand} for pickup or delivery at ${address}. ` +
      `Menu prices match the ones in store.`.slice(0, 300),
    about:
      `${brand} serves ${cuisine.toLowerCase()} food at ${address}. ` +
      `Order directly here for pickup or delivery — the prices on this page are the same ` +
      `ones on the menu inside, because we do not pay a commission on them.`,
    catering:
      `Feeding a group? Tell us how many people and when, and we will come back with ` +
      `a quote and a pickup time.`,
  };
}

export function generateDraft(orgId: string): PageModel {
  const org = getRestaurantById(orgId);
  if (!org) throw new SiteError("Unknown restaurant", 404);

  const copy = draftCopy(org.brandName, org.cuisine, org.blurb, org.address);

  return {
    theme: CUISINE_THEME[org.cuisine] ?? "ember",
    metaTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    sections: [
      { id: "hero", kind: "hero", enabled: true, headline: copy.headline, subhead: copy.subhead },
      { id: "order", kind: "order", enabled: true, heading: "Order now", note: "Pickup or delivery, straight from us." },
      { id: "menu", kind: "menu", enabled: true, heading: "Menu", maxItems: 40 },
      { id: "about", kind: "about", enabled: true, heading: "About", body: copy.about },
      { id: "hours", kind: "hours", enabled: true, heading: "Find us" },
      { id: "reviews", kind: "reviews", enabled: true, heading: "What people say" },
      { id: "catering", kind: "catering", enabled: false, heading: "Catering", body: copy.catering, email: "" },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

type Row = {
  org_id: string; slug: string; status: string; draft_json: string;
  published_json: string | null; published_at: string | null; updated_at: string;
};

function toSite(r: Row): Site {
  return {
    orgId: r.org_id,
    slug: r.slug,
    status: r.status as Site["status"],
    draft: JSON.parse(r.draft_json) as PageModel,
    published: r.published_json ? (JSON.parse(r.published_json) as PageModel) : null,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

/** Creates the draft on first access, so a restaurant always has a site. */
export function getSite(orgId: string): Site {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sites WHERE org_id = ?").get(orgId) as
    | unknown as Row | undefined;
  if (row) return toSite(row);

  const org = getRestaurantById(orgId);
  if (!org) throw new SiteError("Unknown restaurant", 404);

  const draft = generateDraft(orgId);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sites (org_id, slug, status, draft_json, published_json, published_at, updated_at)
     VALUES (?, ?, 'draft', ?, NULL, NULL, ?)`,
  ).run(orgId, org.slug, JSON.stringify(draft), now);

  return getSite(orgId);
}

export function getPublishedBySlug(slug: string): { site: Site; orgId: string } | null {
  const row = getDb()
    .prepare("SELECT * FROM sites WHERE slug = ? AND published_json IS NOT NULL")
    .get(slug) as unknown as Row | undefined;
  return row ? { site: toSite(row), orgId: row.org_id } : null;
}

export function saveDraft(orgId: string, draft: PageModel): Site {
  getSite(orgId); // ensure the row exists
  getDb()
    .prepare("UPDATE sites SET draft_json = ?, updated_at = ? WHERE org_id = ?")
    .run(JSON.stringify(draft), new Date().toISOString(), orgId);
  return getSite(orgId);
}

/** Every guest-visible string on the page, keyed for the claims report. */
export function copyFields(model: PageModel): Record<string, string> {
  const fields: Record<string, string> = {
    "Page title": model.metaTitle,
    "Page description": model.metaDescription,
  };
  for (const s of model.sections) {
    if (!s.enabled) continue;
    if (s.kind === "hero") {
      fields["Hero headline"] = s.headline;
      fields["Hero subheading"] = s.subhead;
    } else if (s.kind === "about") {
      fields["About heading"] = s.heading;
      fields["About text"] = s.body;
    } else if (s.kind === "catering") {
      fields["Catering heading"] = s.heading;
      fields["Catering text"] = s.body;
    } else if (s.kind === "order") {
      fields["Order heading"] = s.heading;
      fields["Order note"] = s.note;
    } else {
      fields[`${s.kind} heading`] = s.heading;
    }
  }
  return fields;
}

export function checkClaims(model: PageModel): ClaimReport {
  return scan(copyFields(model));
}

/**
 * Publishing is refused while any blocking claim survives. This is the gate the
 * whole claims filter exists for — a warning nobody has to clear is not a
 * control.
 */
export function publishSite(orgId: string): Site {
  const site = getSite(orgId);
  const report = checkClaims(site.draft);
  if (!report.publishable) {
    throw new SiteError(
      `Cannot publish: ${report.blocked} claim${report.blocked === 1 ? "" : "s"} must be removed first.`,
      409,
    );
  }
  if (!site.draft.sections.some((s) => s.enabled)) {
    throw new SiteError("Cannot publish a page with every section switched off.");
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE sites SET published_json = ?, status = 'published',
                        published_at = ?, updated_at = ? WHERE org_id = ?`,
    )
    .run(JSON.stringify(site.draft), now, now, orgId);
  return getSite(orgId);
}

/* ------------------------------------------------------------------ *
 * SEO audit
 * ------------------------------------------------------------------ */

/**
 * A checklist with fixes attached, never a score out of 100. "SEO: 72" tells an
 * operator nothing they can act on.
 */
export function auditSeo(orgId: string): SeoCheck[] {
  const site = getSite(orgId);
  const model = site.draft;
  const org = getRestaurantById(orgId);
  const menu = listMenu(orgId);
  const published = currentVersion(orgId);

  const title = model.metaTitle.trim();
  const desc = model.metaDescription.trim();
  const hero = model.sections.find((s) => s.kind === "hero");
  const about = model.sections.find((s) => s.kind === "about");
  const soldOut = menu.filter((m) => !m.isAvailable).length;
  const report = checkClaims(model);

  const checks: SeoCheck[] = [
    {
      id: "title",
      label: "Page title",
      ok: title.length >= 15 && title.length <= 60,
      detail: `${title.length} characters`,
      fix: title.length < 15
        ? "Too short to say what this place is. Aim for 15–60 characters."
        : title.length > 60
          ? "Google truncates past about 60 characters. Trim it."
          : null,
    },
    {
      id: "description",
      label: "Meta description",
      ok: desc.length >= 70 && desc.length <= 160,
      detail: `${desc.length} characters`,
      fix: desc.length < 70
        ? "Too short to earn a click. Aim for 70–160 characters."
        : desc.length > 160
          ? "Will be cut off in results. Trim to 160."
          : null,
    },
    {
      id: "h1",
      label: "One clear headline",
      ok: Boolean(hero && hero.kind === "hero" && hero.enabled && hero.headline.trim()),
      detail: hero?.enabled ? "Hero section on" : "Hero section is off",
      fix: hero?.enabled ? null : "Turn the hero section on — the page needs one obvious H1.",
    },
    {
      id: "schema",
      label: "Restaurant & Menu structured data",
      ok: true,
      detail: "Emitted automatically from the published menu",
      fix: null,
    },
    {
      id: "menu-live",
      label: "Menu is live-bound",
      ok: Boolean(published),
      detail: published ? `Bound to menu v${published.versionNo}` : "No published menu version",
      fix: published ? null : "Publish the menu so the site has something to bind to.",
    },
    {
      id: "ordering",
      label: "Ordering on the page",
      ok: model.sections.some((s) => s.kind === "order" && s.enabled),
      detail: "No redirect to a third-party ordering domain",
      fix: "Turn the order section on — sending guests off-site costs conversion and link authority.",
    },
    {
      id: "hours",
      label: "Hours and address",
      ok: model.sections.some((s) => s.kind === "hours" && s.enabled),
      detail: org?.address ?? "",
      fix: "Turn on hours & location — local search depends on it.",
    },
    {
      id: "about",
      label: "Some real text on the page",
      ok: Boolean(about && about.kind === "about" && about.enabled && about.body.trim().length > 120),
      detail: about && about.kind === "about" ? `${about.body.trim().length} characters` : "About is off",
      fix: "A page with almost no text has nothing to rank for. Add a short About.",
    },
    {
      id: "claims",
      label: "No unverifiable claims",
      ok: report.publishable,
      detail: report.blocked
        ? `${report.blocked} blocking, ${report.warnings} to review`
        : report.warnings
          ? `${report.warnings} to review`
          : "Clean",
      fix: report.blocked ? "Remove the blocked claims before publishing." : null,
    },
    {
      id: "availability",
      label: "Menu reflects what is actually available",
      ok: true,
      detail: soldOut ? `${soldOut} item(s) hidden as sold out` : "Everything available",
      fix: null,
    },
  ];

  return checks;
}
