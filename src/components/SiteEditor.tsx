"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ClaimReport } from "@/lib/claims";
import {
  SECTION_LABEL,
  THEMES,
  type PageModel,
  type Section,
  type SeoCheck,
  type Site,
  type Theme,
} from "@/lib/site-types";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

export function SiteEditor({
  active,
  staff,
  site,
  claims,
  seo,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  site: Site;
  claims: ClaimReport;
  seo: SeoCheck[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<PageModel>(site.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const canEdit = staff.role === "owner" || staff.role === "manager";
  const dirty = JSON.stringify(draft) !== JSON.stringify(site.draft);
  const failing = seo.filter((c) => !c.ok);

  async function save(next: PageModel) {
    setDraft(next);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/site", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: next }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/site", { method: "POST" });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not publish");
      return;
    }
    setFlash("Published. The page is live and the menu on it updates itself.");
    startTransition(() => router.refresh());
  }

  async function regenerate() {
    setBusy(true);
    const res = await fetch("/api/site", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: true }),
    });
    const data = (await res.json()) as { site?: Site; error?: string };
    setBusy(false);
    if (data.site) setDraft(data.site.draft);
    startTransition(() => router.refresh());
  }

  function patchSection(id: string, patch: Partial<Section>) {
    save({
      ...draft,
      sections: draft.sections.map((s) =>
        s.id === id ? ({ ...s, ...patch } as Section) : s,
      ),
    });
  }

  function move(id: string, dir: -1 | 1) {
    const i = draft.sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.sections.length) return;
    const next = [...draft.sections];
    [next[i], next[j]] = [next[j], next[i]];
    save({ ...draft, sections: next });
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Website</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
          {site.published ? (
            <span className="pill border-green bg-green-soft text-green">live</span>
          ) : (
            <span className="pill border-amber bg-amber-soft text-amber">never published</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {site.published && (
            <Link href={`/site/${site.slug}`} target="_blank" className="label hover:text-ink">
              View live &#8599;
            </Link>
          )}
          <Link href="/ops/upsell" className="label hover:text-ink">Upsells</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      {/* The publish gate. Blocking claims stop the button working at all. */}
      <section
        className={`mb-5 rounded-md border p-4 ${
          claims.blocked > 0
            ? "border-red bg-red-soft"
            : dirty || !site.published
              ? "border-amber bg-amber-soft"
              : "border-line bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label !text-ink-2 mb-1">Before this goes public</p>
            {claims.blocked > 0 ? (
              <p className="text-sm font-semibold text-red">
                {claims.blocked} claim{claims.blocked === 1 ? "" : "s"} must be removed.
                Publishing is blocked.
              </p>
            ) : !site.published ? (
              <p className="text-sm font-semibold">Not published yet.</p>
            ) : dirty ? (
              <p className="text-sm font-semibold">
                Unpublished edits. Guests still see the live version.
              </p>
            ) : (
              <p className="text-sm">
                <span className="font-semibold text-green">Live and up to date.</span>{" "}
                <span className="text-ink-2">
                  Published{" "}
                  {site.publishedAt
                    ? new Date(site.publishedAt).toLocaleString([], {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })
                    : ""}
                </span>
              </p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={publish}
              disabled={busy || claims.blocked > 0}
              className="btn btn-primary shrink-0 px-5 py-2.5 text-[14px] disabled:opacity-40"
            >
              {busy ? "Working…" : site.published ? "Publish changes" : "Publish site"}
            </button>
          )}
        </div>
      </section>

      {flash && (
        <p className="mb-4 rounded-sm border border-green bg-green-soft px-3 py-2 text-sm font-semibold text-green">
          {flash}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-sm border border-red bg-red-soft px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      {!canEdit && (
        <p className="mb-4 rounded-sm border border-line bg-card-2 px-3 py-2 text-sm text-ink-2">
          Your role ({staff.role.replace("_", " ")}) can view the site but not change it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 rounded-md border border-line bg-card p-4">
            <h2 className="label mb-2">Search listing</h2>
            <label className="mb-2 block">
              <span className="label">Title</span>
              <input
                value={draft.metaTitle}
                onChange={(e) => setDraft({ ...draft, metaTitle: e.target.value })}
                onBlur={() => dirty && save(draft)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-sm border border-line bg-card-2 px-3 py-2 text-[14px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="label">Description</span>
              <textarea
                value={draft.metaDescription}
                onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                onBlur={() => dirty && save(draft)}
                disabled={!canEdit}
                rows={2}
                className="mt-1 w-full rounded-sm border border-line bg-card-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="label">Theme</span>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => save({ ...draft, theme: t.id as Theme })}
                  title={t.note}
                  className={`mono rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${
                    draft.theme === t.id
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-line text-ink-3 hover:text-ink"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={busy}
                  className="label ml-auto hover:text-ink"
                >
                  Start over from the restaurant data
                </button>
              )}
            </div>
          </div>

          <h2 className="label mb-2 border-b border-line pb-1.5">Sections</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {draft.sections.map((s, i) => (
              <li key={s.id} className="rounded-md border border-line bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold">{SECTION_LABEL[s.kind]}</span>
                    {s.kind === "menu" && (
                      <span className="pill border-blue bg-blue-soft text-blue">live menu</span>
                    )}
                    {!s.enabled && (
                      <span className="pill border-line-2 bg-card-2 text-ink-3">off</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(s.id, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        className="mono rounded-sm border border-line px-2 py-1 text-[11px] disabled:opacity-30"
                      >
                        &uarr;
                      </button>
                      <button
                        type="button"
                        onClick={() => move(s.id, 1)}
                        disabled={i === draft.sections.length - 1}
                        aria-label="Move down"
                        className="mono rounded-sm border border-line px-2 py-1 text-[11px] disabled:opacity-30"
                      >
                        &darr;
                      </button>
                      <button
                        type="button"
                        onClick={() => patchSection(s.id, { enabled: !s.enabled } as Partial<Section>)}
                        className={`mono rounded-sm border px-2 py-1 text-[11px] uppercase tracking-wider ${
                          s.enabled
                            ? "border-line text-ink-3 hover:border-red hover:text-red"
                            : "border-green bg-green-soft text-green"
                        }`}
                      >
                        {s.enabled ? "Turn off" : "Turn on"}
                      </button>
                    </div>
                  )}
                </div>

                {s.enabled && s.kind === "hero" && (
                  <div className="mt-2 grid gap-2">
                    <Field label="Headline" value={s.headline} disabled={!canEdit}
                      onSave={(v) => patchSection(s.id, { headline: v } as Partial<Section>)} />
                    <Field label="Subheading" value={s.subhead} disabled={!canEdit} textarea
                      onSave={(v) => patchSection(s.id, { subhead: v } as Partial<Section>)} />
                  </div>
                )}
                {s.enabled && s.kind === "about" && (
                  <div className="mt-2">
                    <Field label="Text" value={s.body} disabled={!canEdit} textarea
                      onSave={(v) => patchSection(s.id, { body: v } as Partial<Section>)} />
                  </div>
                )}
                {s.enabled && s.kind === "catering" && (
                  <div className="mt-2 grid gap-2">
                    <Field label="Text" value={s.body} disabled={!canEdit} textarea
                      onSave={(v) => patchSection(s.id, { body: v } as Partial<Section>)} />
                    <Field label="Enquiries email" value={s.email} disabled={!canEdit}
                      onSave={(v) => patchSection(s.id, { email: v } as Partial<Section>)} />
                  </div>
                )}
                {s.enabled && s.kind === "menu" && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                    Bound to the published menu. Change a price in{" "}
                    <Link href="/ops/menu" className="font-bold text-brand-strong">Menu</Link> and this
                    page follows &mdash; there is no second copy to go stale.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <aside>
          <h2 className="label mb-2 border-b border-line pb-1.5">
            Claims check
          </h2>
          {claims.findings.length === 0 ? (
            <p className="py-2 text-[13px] text-green">
              Nothing on the page makes a claim that cannot be backed up.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {claims.findings.map((f, i) => (
                <li key={i} className="border-b border-line py-2 last:border-0">
                  <span
                    className={`pill mr-1.5 ${
                      f.severity === "block"
                        ? "border-red bg-red-soft text-red"
                        : "border-amber bg-amber-soft text-amber"
                    }`}
                  >
                    {f.severity === "block" ? "blocked" : "review"}
                  </span>
                  <span className="mono text-[12.5px] font-bold">
                    &ldquo;{f.matched}&rdquo;
                  </span>
                  <span className="block text-[11.5px] text-ink-3">in {f.field}</span>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{f.reason}</p>
                </li>
              ))}
            </ul>
          )}

          <h2 className="label mb-2 mt-6 border-b border-line pb-1.5">
            SEO &middot; {failing.length ? `${failing.length} to fix` : "all clear"}
          </h2>
          <ul className="m-0 list-none p-0">
            {seo.map((c) => (
              <li key={c.id} className="border-b border-line py-1.5 last:border-0">
                <span className={`text-[13px] ${c.ok ? "" : "font-bold"}`}>
                  <span className={c.ok ? "text-green" : "text-amber"}>
                    {c.ok ? "✓" : "!"}
                  </span>{" "}
                  {c.label}
                </span>
                <span className="block text-[11.5px] text-ink-3">{c.detail}</span>
                {c.fix && <p className="mt-1 text-[12px] text-amber">{c.fix}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            A checklist with fixes attached, not a score. &ldquo;SEO: 72&rdquo; tells you
            nothing you can act on.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  disabled,
  textarea,
  onSave,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  textarea?: boolean;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const common = {
    value: local,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setLocal(e.target.value),
    onBlur: () => local !== value && onSave(local),
    className:
      "mt-1 w-full rounded-sm border border-line bg-card-2 px-3 py-2 text-[13px] outline-none focus:border-brand",
  };
  return (
    <label className="block">
      <span className="label">{label}</span>
      {textarea ? <textarea rows={3} {...common} /> : <input {...common} />}
    </label>
  );
}
