/**
 * The page model — spec §6.8.
 *
 * The builder edits a STRUCTURED model, not raw HTML. That is the whole design
 * decision: "add a catering section" inserts a typed section with real fields,
 * so the page stays valid, stays fast, stays re-themeable, and can be
 * re-rendered by a different template later without a migration.
 *
 * The menu section carries no menu content at all. It is a live binding to the
 * published menu of record, so publishing a price in the POS updates the
 * website — there is never a second copy of the menu to go stale.
 */

export type SectionKind =
  | "hero"
  | "order"
  | "menu"
  | "about"
  | "hours"
  | "reviews"
  | "catering";

export type Section =
  | { id: string; kind: "hero"; enabled: boolean; headline: string; subhead: string }
  | { id: string; kind: "order"; enabled: boolean; heading: string; note: string }
  | { id: string; kind: "menu"; enabled: boolean; heading: string; maxItems: number }
  | { id: string; kind: "about"; enabled: boolean; heading: string; body: string }
  | { id: string; kind: "hours"; enabled: boolean; heading: string }
  | { id: string; kind: "reviews"; enabled: boolean; heading: string }
  | { id: string; kind: "catering"; enabled: boolean; heading: string; body: string; email: string };

export type Theme = "ember" | "slate" | "masa";

export type PageModel = {
  theme: Theme;
  metaTitle: string;
  metaDescription: string;
  sections: Section[];
};

export type SiteStatus = "draft" | "published";

export type Site = {
  orgId: string;
  slug: string;
  status: SiteStatus;
  draft: PageModel;
  published: PageModel | null;
  publishedAt: string | null;
  updatedAt: string;
};

/** One actionable item, never a score. A number tells an operator nothing. */
export type SeoCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /** What to do about it, when it is not ok. */
  fix: string | null;
};

export const THEMES: { id: Theme; name: string; hue: number; note: string }[] = [
  { id: "ember", name: "Ember", hue: 14, note: "Warm red. Suits grills, tacos, pizza." },
  { id: "slate", name: "Slate", hue: 210, note: "Cool and quiet. Suits delis and cafés." },
  { id: "masa", name: "Masa", hue: 38, note: "Corn and amber. Suits Latin and Middle Eastern." },
];

export const SECTION_LABEL: Record<SectionKind, string> = {
  hero: "Hero",
  order: "Order now",
  menu: "Menu",
  about: "About",
  hours: "Hours & location",
  reviews: "Reviews",
  catering: "Catering",
};
