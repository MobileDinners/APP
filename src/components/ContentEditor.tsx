"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClaimFinding } from "@/lib/claims";
import type { ContentMeta, NavLink, SiteContent } from "@/lib/site-content";
import { SignOut } from "./SignOut";

/**
 * Editor for the diner-facing header and footer.
 *
 * Everything is edited in place and saved in one go rather than field by
 * field: the header nav is a single composition, and autosaving a half-renamed
 * link onto a live storefront is not a kindness. "Discard" is therefore always
 * available and always accurate, because nothing has left the browser yet.
 */

const INPUT =
  "w-full rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[14px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

export function ContentEditor({
  initial,
  meta: initialMeta,
  claims: initialClaims,
  staff,
  durable,
}: {
  initial: SiteContent;
  meta: ContentMeta;
  claims: ClaimFinding[];
  staff: { name: string; email: string };
  /** False when no disk is mounted, so saved content dies with the container. */
  durable: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SiteContent>(initial);
  const [draft, setDraft] = useState<SiteContent>(initial);
  const [meta, setMeta] = useState<ContentMeta>(initialMeta);
  const [claims, setClaims] = useState<ClaimFinding[]>(initialClaims);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function patch(next: Partial<SiteContent>) {
    setDraft((d) => ({ ...d, ...next }));
    setFlash(null);
  }

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError(null);
    setFlash(null);
    const res = await fetch("/api/site-content", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PUT" ? JSON.stringify(draft) : undefined,
    });
    const data = (await res.json()) as {
      error?: string;
      content?: SiteContent;
      meta?: ContentMeta;
      claims?: ClaimFinding[];
    };
    setBusy(false);

    if (!res.ok || !data.content) {
      setError(data.error ?? "Could not save");
      if (data.claims) setClaims(data.claims);
      return;
    }

    setSaved(data.content);
    setDraft(data.content);
    setMeta(data.meta ?? null);
    setClaims(data.claims ?? []);
    setFlash(method === "PUT" ? "Saved. The site is live with these words." : "Reset to defaults.");
    // The header and footer are server-rendered from this data, so the rest of
    // the app only shows the change after the router cache is dropped.
    router.refresh();
  }

  const warnings = claims.filter((c) => c.severity === "warn");

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">Site content</h1>
          <p className="mt-1.5 max-w-[58ch] text-[14.5px] leading-relaxed text-ink-2">
            The navigation and footer that every diner sees, on every page. Changes
            go live the moment you save — there is no separate publish step.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-3">
          <SignOut name={staff.name} />
        </div>
      </header>

      {!durable && (
        <p className="mt-6 rounded-[10px] border border-amber bg-amber-soft text-amber px-4 py-3 text-[13.5px] leading-relaxed">
          <strong className="font-extrabold">This deployment has no disk.</strong>{" "}
          MD_DATA_DIR is unset, so the database lives inside the container and is
          destroyed on every deploy and every idle spin-down. Anything you save
          here will look saved and be gone within the hour. Attach a persistent
          disk before you spend real time on this copy.
        </p>
      )}

      {meta && (
        <p className="mt-4 text-[13px] text-ink-3">
          Last edited by {meta.updatedBy} on{" "}
          {new Date(meta.updatedAt).toLocaleString()}.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-[10px] border border-red bg-red-soft text-red px-4 py-3 text-[14px] font-semibold">
          {error}
        </p>
      )}
      {flash && (
        <p className="mt-4 rounded-[10px] border border-green bg-green-soft text-green px-4 py-3 text-[14px] font-semibold">
          {flash}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-[10px] border border-amber bg-amber-soft text-amber px-4 py-3">
          <p className="text-[13px] font-extrabold uppercase tracking-wider">
            {warnings.length} claim{warnings.length === 1 ? "" : "s"} worth a second look
          </p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {warnings.map((w, i) => (
              <li key={i} className="text-[13.5px] leading-snug">
                <span className="font-bold">“{w.matched}”</span> — {w.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------------------ header */}
      <Section
        title="Header navigation"
        hint="Left to right, up to eight. Links must stay on this site."
      >
        <LinkList
          links={draft.headerNav}
          onChange={(headerNav) => patch({ headerNav })}
          max={8}
          minOne
        />
      </Section>

      {/* ------------------------------------------------------------ footer */}
      <Section title="Footer tagline" hint="The paragraph under the logo.">
        <textarea
          value={draft.footerTagline}
          onChange={(e) => patch({ footerTagline: e.target.value })}
          rows={2}
          maxLength={300}
          className={INPUT}
        />
      </Section>

      <Section
        title="Footer columns"
        hint="Up to six columns of up to eight links each."
      >
        <div className="grid gap-4">
          {draft.footerColumns.map((col, ci) => (
            <div key={ci} className="rounded-[10px] border border-line bg-card-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={col.heading}
                  onChange={(e) => {
                    const next = [...draft.footerColumns];
                    next[ci] = { ...col, heading: e.target.value };
                    patch({ footerColumns: next });
                  }}
                  maxLength={30}
                  aria-label={`Column ${ci + 1} heading`}
                  className={`${INPUT} font-extrabold uppercase tracking-wider`}
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      footerColumns: draft.footerColumns.filter((_, i) => i !== ci),
                    })
                  }
                  className="shrink-0 rounded-[8px] border border-line-2 px-3 py-2 text-[13px] font-bold hover:bg-card"
                >
                  Remove column
                </button>
              </div>
              <div className="mt-3">
                <LinkList
                  links={col.links}
                  max={8}
                  onChange={(links) => {
                    const next = [...draft.footerColumns];
                    next[ci] = { ...col, links };
                    patch({ footerColumns: next });
                  }}
                />
              </div>
            </div>
          ))}
          {draft.footerColumns.length < 6 && (
            <button
              type="button"
              onClick={() =>
                patch({
                  footerColumns: [
                    ...draft.footerColumns,
                    { heading: "New column", links: [{ href: "/", label: "Home" }] },
                  ],
                })
              }
              className="justify-self-start rounded-[8px] border border-line-2 px-4 py-2 text-[13.5px] font-bold hover:bg-card-2"
            >
              Add column
            </button>
          )}
        </div>
      </Section>

      <Section title="Legal line" hint="Sits at the very bottom, beside the copyright.">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-ink-3">
              Company name
            </span>
            <input
              value={draft.companyName}
              onChange={(e) => patch({ companyName: e.target.value })}
              maxLength={80}
              className={INPUT}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-ink-3">
              Note
            </span>
            <textarea
              value={draft.footerNote}
              onChange={(e) => patch({ footerNote: e.target.value })}
              rows={2}
              maxLength={300}
              className={INPUT}
            />
          </label>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          Renders as “© {new Date().getFullYear()} {draft.companyName || "…"}”.
        </p>
      </Section>

      {/* ------------------------------------------------------------ actions */}
      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void send("PUT")}
          className="rounded-[10px] bg-brand px-6 py-3 text-[15px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft(saved);
            setError(null);
            setFlash(null);
          }}
          className="rounded-[10px] border border-line-2 px-5 py-3 text-[15px] font-bold hover:bg-card-2 disabled:opacity-40"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={busy || !meta}
          onClick={() => void send("DELETE")}
          className="rounded-[10px] border border-line-2 px-5 py-3 text-[15px] font-bold hover:bg-card-2 disabled:opacity-40"
          title="Return to the copy that ships in the repository"
        >
          Reset to defaults
        </button>
        <Link
          href="/"
          target="_blank"
          className="ml-auto text-[14px] font-extrabold text-brand-strong hover:underline"
        >
          View the site →
        </Link>
      </div>
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">{title}</h2>
      <p className="mb-3 mt-1 text-[13.5px] text-ink-3">{hint}</p>
      {children}
    </section>
  );
}

/** A reorderable list of label + path pairs, shared by the header and footer. */
function LinkList({
  links,
  onChange,
  max,
  minOne = false,
}: {
  links: NavLink[];
  onChange: (next: NavLink[]) => void;
  max: number;
  minOne?: boolean;
}) {
  function move(from: number, to: number) {
    if (to < 0 || to >= links.length) return;
    const next = [...links];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    onChange(next);
  }

  return (
    <div className="grid gap-2">
      {links.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={l.label}
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...l, label: e.target.value };
              onChange(next);
            }}
            maxLength={40}
            placeholder="Label"
            aria-label={`Link ${i + 1} label`}
            className={`${INPUT} min-w-[9rem] flex-1`}
          />
          <input
            value={l.href}
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...l, href: e.target.value };
              onChange(next);
            }}
            placeholder="/path"
            aria-label={`Link ${i + 1} path`}
            className={`${INPUT} num min-w-[9rem] flex-1`}
          />
          <span className="flex shrink-0 gap-1">
            <IconBtn label="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}>
              ↑
            </IconBtn>
            <IconBtn
              label="Move down"
              onClick={() => move(i, i + 1)}
              disabled={i === links.length - 1}
            >
              ↓
            </IconBtn>
            <IconBtn
              label="Remove"
              onClick={() => onChange(links.filter((_, j) => j !== i))}
              disabled={minOne && links.length === 1}
            >
              ×
            </IconBtn>
          </span>
        </div>
      ))}
      {links.length < max && (
        <button
          type="button"
          onClick={() => onChange([...links, { href: "/", label: "New link" }])}
          className="justify-self-start rounded-[8px] border border-line-2 px-4 py-2 text-[13.5px] font-bold hover:bg-card-2"
        >
          Add link
        </button>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-[8px] border border-line-2 text-[15px] font-bold hover:bg-card-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
