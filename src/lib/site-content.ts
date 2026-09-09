import { getDb } from "./db";
import { scanField, type ClaimFinding } from "./claims";
import { PLATFORM_ADMIN_EMAIL } from "./platform";

/**
 * Editable copy for the diner-facing site — the header nav, the footer, and
 * the few standing lines of marketing text around them.
 *
 * These strings used to be `const` arrays inside ConsumerHeader and
 * ConsumerFooter, which meant renaming "Help" to "Support" was a code change,
 * a review and a deploy. That is the wrong shape for words that the person who
 * owns the business wants to change on a Tuesday afternoon.
 *
 * The important design decision is where the defaults live: IN CODE, below.
 * The database only ever holds an override. So an empty database — a fresh
 * deploy, a wiped free-tier disk, a restore gone wrong — renders exactly the
 * site that ships in the repository rather than a page with no navigation.
 * A content store that can blank your header is worse than no content store.
 */

export type NavLink = { href: string; label: string };
export type FooterColumn = { heading: string; links: NavLink[] };

export type SiteContent = {
  /** Main navigation, left to right. */
  headerNav: NavLink[];
  /** The paragraph under the logo in the footer. */
  footerTagline: string;
  footerColumns: FooterColumn[];
  /** The small print beside the copyright line. */
  footerNote: string;
  /** Rendered as "© <year> <companyName>". */
  companyName: string;
};

/**
 * What the site says today. Changing a string here changes the site for any
 * deployment that has never been edited, which is the sane default for a value
 * that is also the fallback.
 */
export const DEFAULT_CONTENT: SiteContent = {
  headerNav: [
    { href: "/", label: "Home" },
    { href: "/restaurants", label: "Restaurants" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/about", label: "About Us" },
    { href: "/support", label: "Help" },
  ],
  footerTagline:
    "In-store prices, no service fees, and one points wallet that works at every restaurant on the network.",
  footerColumns: [
    {
      heading: "Order",
      links: [
        { href: "/restaurants", label: "All restaurants" },
        { href: "/search", label: "Search" },
        { href: "/orders", label: "Your orders" },
        { href: "/account", label: "Your account" },
        { href: "/rewards", label: "Points wallet" },
      ],
    },
    {
      heading: "Help",
      links: [
        { href: "/support", label: "Help centre" },
        { href: "/support#contact", label: "Contact us" },
        { href: "/orders", label: "Report an order problem" },
        { href: "/signin", label: "Sign in" },
      ],
    },
    {
      heading: "Company",
      links: [
        { href: "/about", label: "About Mobile Dinners" },
        { href: "/how-it-works", label: "Why no service fees" },
        { href: "/how-it-works#points", label: "How points work" },
        { href: "/partners", label: "For Restaurants" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { href: "/terms", label: "Terms of Service" },
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/privacy#rights", label: "Your data rights" },
      ],
    },
  ],
  // Empty by design. This used to read "Demo environment — restaurants, orders
  // and prices here are generated fixtures, and no payment is taken", which sat
  // on every page of the customer site telling anyone who read it that none of
  // this was real. Editable from the admin content editor if there is ever
  // something worth saying here.
  footerNote: "",
  companyName: "Mobile Dinners, Inc.",
};

/* ------------------------------------------------------------------ *
 * Who may edit
 * ------------------------------------------------------------------ */

/**
 * Who may administer the platform — the site copy here, and everything under
 * /admin.
 *
 * This is the PLATFORM's own surface, not a restaurant's, so restaurant roles
 * are the wrong gate: an owner at one of six taquerias should not be able to
 * rewrite the navigation every other restaurant's customers see, still less
 * read every rival's revenue.
 *
 * Two ways in, and the order matters:
 *
 *   1. PLATFORM_ADMIN_EMAIL is always an administrator. It is the account the
 *      platform is run from, and hard-coding it means a fresh deployment is
 *      administrable without first setting an environment variable — which is
 *      the failure mode that leaves a live site nobody can get into.
 *
 *   2. MD_ADMIN_EMAILS adds any number of others, comma separated.
 *
 * With neither, this fails CLOSED in production. Outside production any
 * signed-in staff may administer, so the whole thing is usable on a laptop
 * without ceremony.
 *
 * The cost of (1) is stated here rather than buried: the repository is public,
 * so that address is known. It is exactly as safe as its password, which is
 * why no code path in this project ever assigns it one — the account is
 * created by scripts/create-admin.cjs, which refuses to run in production
 * without MD_ADMIN_PASSWORD and rejects the published demo password outright.
 */
export function isPlatformAdmin(email: string | undefined): boolean {
  const wanted = email?.trim().toLowerCase();

  if (wanted && wanted === PLATFORM_ADMIN_EMAIL.toLowerCase()) return true;

  const raw = process.env.MD_ADMIN_EMAILS;
  if (!raw) return process.env.NODE_ENV !== "production";
  if (!wanted) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

/**
 * Whether edits will actually outlive a restart.
 *
 * On Render's free plan there is no mounted disk, so the SQLite file lives in
 * the container and is destroyed on every deploy and every idle spin-down.
 * Content saved there looks saved and is gone by morning. The editor says so
 * out loud rather than letting someone rewrite their footer twice.
 */
export function storageIsDurable(): boolean {
  return Boolean(process.env.MD_DATA_DIR);
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export class ContentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const LIMITS = {
  navLinks: 8,
  columns: 6,
  linksPerColumn: 8,
  label: 40,
  heading: 30,
  text: 300,
} as const;

/**
 * Internal paths only.
 *
 * The header and footer render on every page of the site, so a link here is
 * the single most valuable place to put a hostile URL: it inherits the brand,
 * the padlock and the reader's trust. An editor account is therefore not
 * allowed to point one off-site at all — not `http://`, not protocol-relative
 * `//evil.example`, and certainly not `javascript:`. If Mobile Dinners ever
 * needs an outbound footer link, that is a code change with a review, which is
 * the correct amount of friction for it.
 */
function assertInternalHref(href: string, where: string): void {
  if (!href.startsWith("/")) {
    throw new ContentError(
      `${where}: links must start with "/" — "${href}" points off-site.`,
    );
  }
  if (href.startsWith("//")) {
    throw new ContentError(
      `${where}: "${href}" is a protocol-relative URL, which leaves the site.`,
    );
  }
}

function cleanText(
  value: unknown,
  where: string,
  max: number,
  /**
   * Only the footer note. Every other field is structural — an empty nav label
   * or company name is a broken page — but the footer note is a remark, and
   * "no remark" has to be an option a person can actually choose. Without this
   * the only way to stop saying something is to say something else.
   */
  allowEmpty = false,
): string {
  if (typeof value !== "string") throw new ContentError(`${where} must be text.`);
  const text = value.trim();
  if (!text && !allowEmpty) throw new ContentError(`${where} cannot be empty.`);
  if (text.length > max) {
    throw new ContentError(`${where} is ${text.length} characters; the limit is ${max}.`);
  }
  return text;
}

function cleanLink(raw: unknown, where: string): NavLink {
  if (!raw || typeof raw !== "object") throw new ContentError(`${where} is malformed.`);
  const r = raw as Record<string, unknown>;
  const label = cleanText(r.label, `${where} label`, LIMITS.label);
  const href = cleanText(r.href, `${where} link`, 200);
  assertInternalHref(href, where);
  return { href, label };
}

/**
 * Parses and bounds whatever the form posted. Throws on the first problem with
 * a message naming the field, because "invalid content" helps nobody fix it.
 */
export function validateContent(raw: unknown): SiteContent {
  if (!raw || typeof raw !== "object") throw new ContentError("Body must be an object.");
  const r = raw as Record<string, unknown>;

  const navRaw = Array.isArray(r.headerNav) ? r.headerNav : [];
  if (navRaw.length === 0) {
    throw new ContentError("The header needs at least one navigation link.");
  }
  if (navRaw.length > LIMITS.navLinks) {
    throw new ContentError(`The header takes at most ${LIMITS.navLinks} links.`);
  }
  const headerNav = navRaw.map((l, i) => cleanLink(l, `Header link ${i + 1}`));

  const colsRaw = Array.isArray(r.footerColumns) ? r.footerColumns : [];
  if (colsRaw.length > LIMITS.columns) {
    throw new ContentError(`The footer takes at most ${LIMITS.columns} columns.`);
  }
  const footerColumns: FooterColumn[] = colsRaw.map((c, i) => {
    const col = (c ?? {}) as Record<string, unknown>;
    const heading = cleanText(col.heading, `Footer column ${i + 1} heading`, LIMITS.heading);
    const linksRaw = Array.isArray(col.links) ? col.links : [];
    if (linksRaw.length > LIMITS.linksPerColumn) {
      throw new ContentError(
        `"${heading}" has ${linksRaw.length} links; the limit is ${LIMITS.linksPerColumn}.`,
      );
    }
    return {
      heading,
      links: linksRaw.map((l, j) => cleanLink(l, `"${heading}" link ${j + 1}`)),
    };
  });

  return {
    headerNav,
    footerColumns,
    footerTagline: cleanText(r.footerTagline, "Footer tagline", LIMITS.text),
    footerNote: cleanText(r.footerNote, "Footer note", LIMITS.text, true),
    companyName: cleanText(r.companyName, "Company name", 80),
  };
}

/**
 * Runs the free-text fields past the claims filter.
 *
 * Navigation labels are not scanned — they are one or two words and the filter
 * would only ever fire on them by accident. The tagline and the note are real
 * marketing copy on every page of the site, which is exactly what the filter
 * is for.
 */
export function checkContentClaims(content: SiteContent): ClaimFinding[] {
  return [
    ...scanField("Footer tagline", content.footerTagline),
    ...scanField("Footer note", content.footerNote),
  ];
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

const ROW_KEY = "consumer";

/**
 * The stored override, merged over the defaults.
 *
 * Merged rather than replaced so that adding a new field to SiteContent does
 * not blank it on every deployment that saved content before the field
 * existed. A parse failure falls back to the defaults and says so in the log:
 * a corrupt row must not take the whole site down.
 */
export function getSiteContent(): SiteContent {
  try {
    const row = getDb()
      .prepare("SELECT value FROM site_content WHERE key = ?")
      .get(ROW_KEY) as { value: string } | undefined;
    if (!row) return DEFAULT_CONTENT;
    return { ...DEFAULT_CONTENT, ...(JSON.parse(row.value) as Partial<SiteContent>) };
  } catch (err) {
    console.error("site_content unreadable; serving defaults", err);
    return DEFAULT_CONTENT;
  }
}

/** True once someone has saved an override — drives "Reset to defaults". */
export function hasOverride(): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS n FROM site_content WHERE key = ?")
    .get(ROW_KEY) as { n: number } | undefined;
  return Boolean(row);
}

export function saveSiteContent(content: SiteContent, editedBy: string): void {
  getDb()
    .prepare(
      `INSERT INTO site_content (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .run(ROW_KEY, JSON.stringify(content), new Date().toISOString(), editedBy);
}

/** Drops the override so the site returns to what ships in the repository. */
export function resetSiteContent(): void {
  getDb().prepare("DELETE FROM site_content WHERE key = ?").run(ROW_KEY);
}

export type ContentMeta = { updatedAt: string; updatedBy: string } | null;

export function siteContentMeta(): ContentMeta {
  const row = getDb()
    .prepare("SELECT updated_at, updated_by FROM site_content WHERE key = ?")
    .get(ROW_KEY) as { updated_at: string; updated_by: string } | undefined;
  return row ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
}
