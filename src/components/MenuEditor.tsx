"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { MenuChange, MenuItem, MenuVersion, Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

const STATIONS = ["grill", "fry", "assembly", "cold", "bar"];

export function MenuEditor({
  active,
  staff,
  items,
  live,
  versions,
  changes,
  photoKeywords,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  items: MenuItem[];
  live: MenuVersion | null;
  versions: MenuVersion[];
  changes: MenuChange[];
  photoKeywords: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const canEdit = staff.role === "owner" || staff.role === "manager";

  async function save(itemId: string, patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/menu/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save");
      return;
    }
    setEditing(null);
    startTransition(() => router.refresh());
  }

  async function addItem(item: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/menu/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not add the item");
      return false;
    }
    setAdding(false);
    setFlash(`Added "${item.name}" to the draft. Publish the menu to put it on sale.`);
    startTransition(() => router.refresh());
    return true;
  }

  async function removeItem(item: MenuItem) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/menu/items/${item.itemId}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not remove the item");
      return;
    }
    setFlash(`Removed "${item.name}" from the draft.`);
    startTransition(() => router.refresh());
  }

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/menu/publish", { method: "POST" });
    const data = (await res.json()) as { error?: string; version?: MenuVersion };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not publish");
      return;
    }
    setFlash(`Published v${data.version?.versionNo}. Live everywhere now.`);
    startTransition(() => router.refresh());
  }

  const sections = [...new Set(items.map((i) => i.section))];

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Menu</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
          {live ? (
            <span className="pill border-green bg-green-soft text-green">
              live v{live.versionNo}
            </span>
          ) : (
            <span className="pill border-amber bg-amber-soft text-amber">never published</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/payments" className="label hover:text-ink">Payments</Link>
          <Link href="/ops/pos" className="label hover:text-ink">POS</Link>
          <Link href="/ops/campaigns" className="label hover:text-ink">Marketing</Link>
          <Link href="/ops/customers" className="label hover:text-ink">Customers</Link>
          <Link href="/ops/optimizer" className="label hover:text-ink">
            Optimizer
          </Link>
          <Link href="/ops" className="label hover:text-ink">
            Orders
          </Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      {/* Draft vs live. This block is the whole point of versioning. */}
      <section
        className={`mb-5 rounded-md border p-4 ${
          changes.length > 0 ? "border-amber bg-amber-soft" : "border-line bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label !text-ink-2 mb-1">Unpublished changes</p>
            {changes.length === 0 ? (
              <p className="text-sm">
                <span className="text-green font-semibold">Draft matches live.</span>{" "}
                {live && (
                  <span className="text-ink-2">
                    v{live.versionNo} &middot; {live.itemCount} items &middot; hash{" "}
                    <span className="mono">{live.contentHash.slice(0, 12)}</span>
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm font-semibold">
                {changes.length} item{changes.length === 1 ? "" : "s"} edited. Guests still
                see {live ? `v${live.versionNo}` : "nothing"} until you publish.
              </p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={publish}
              disabled={busy || changes.length === 0}
              className="btn btn-primary shrink-0 px-5 py-2.5 text-[14px] disabled:opacity-40"
            >
              {busy ? "Publishing…" : `Publish v${(live?.versionNo ?? 0) + 1}`}
            </button>
          )}
        </div>

        {changes.length > 0 && (
          <ul className="m-0 mt-3 list-none border-t border-line-2 p-0 pt-2">
            {changes.map((c) => (
              <li key={c.itemId} className="py-1.5 text-[13px]">
                <span className="font-bold">{c.name}</span>{" "}
                {c.kind !== "changed" && (
                  <span className="pill border-line-2 bg-card-2 text-ink-3">{c.kind}</span>
                )}
                {c.fields.map((f) => (
                  <span key={f.field} className="ml-2 text-ink-2">
                    {f.field}:{" "}
                    <span className="mono text-red line-through">{f.from || "—"}</span>{" "}
                    <span className="mono text-green">{f.to || "—"}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
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
          Your role ({staff.role.replace("_", " ")}) can view the menu but not change it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div>
          {canEdit && (
            <section className="mb-5">
              {adding ? (
                <NewItemForm
                  sections={sections}
                  photoKeywords={photoKeywords}
                  busy={busy}
                  onCancel={() => setAdding(false)}
                  onSave={addItem}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => { setAdding(true); setError(null); }}
                  className="w-full rounded-md border border-dashed border-line-2 bg-card px-4 py-3 text-left hover:border-brand"
                >
                  <span className="text-[15px] font-bold text-brand-strong">+ Add an item</span>
                  <span className="mt-0.5 block text-[13px] text-ink-2">
                    Goes into the draft. Guests do not see it until you publish.
                  </span>
                </button>
              )}
            </section>
          )}

          {sections.map((section) => (
            <section key={section} className="mb-5">
              <h2 className="label mb-2 border-b border-line pb-1.5">{section}</h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {items
                  .filter((i) => i.section === section)
                  .map((item) => {
                    const marginCents = item.priceCents - item.costCents;
                    const marginPct = item.priceCents
                      ? Math.round((marginCents / item.priceCents) * 100)
                      : 0;
                    return (
                      <li
                        key={item.itemId}
                        className="rounded-md border border-line bg-card p-3"
                      >
                        {editing === item.itemId ? (
                          <ItemForm
                            item={item}
                            busy={busy}
                            onCancel={() => setEditing(null)}
                            onSave={(patch) => save(item.itemId, patch)}
                          />
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-bold">{item.name}</p>
                              <p className="mt-0.5 text-[13px] text-ink-2">
                                {item.description}
                              </p>
                              <p className="label mt-1.5">
                                {item.station} &middot; {Math.round(item.prepSeconds / 60)} min
                                &middot; cost {formatCents(item.costCents)} &middot;{" "}
                                <span
                                  className={
                                    marginPct >= 65
                                      ? "text-green"
                                      : marginPct >= 50
                                        ? "text-amber"
                                        : "text-red"
                                  }
                                >
                                  {marginPct}% margin
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="num mono text-[15px] font-bold">
                                {formatCents(item.priceCents)}
                              </span>
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditing(item.itemId)}
                                    className="mono rounded-sm border border-line px-2 py-1 text-[11px] uppercase tracking-wider hover:border-line-2"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item)}
                                    disabled={busy}
                                    title="Only possible for items that have never been ordered"
                                    className="mono rounded-sm border border-line px-2 py-1 text-[11px] uppercase tracking-wider hover:border-red hover:text-red disabled:opacity-40"
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>

        <aside>
          <h2 className="label mb-2 border-b border-line pb-1.5">Published versions</h2>
          <ul className="m-0 list-none p-0">
            {versions.length === 0 && (
              <li className="py-2 text-[13px] text-ink-3">Nothing published yet.</li>
            )}
            {versions.map((v) => (
              <li key={v.menuVersionId} className="border-b border-line py-2">
                <p className="text-[13px] font-bold">
                  v{v.versionNo}
                  <span className="ml-2 font-normal text-ink-3">{v.source}</span>
                </p>
                <p className="mono mt-0.5 text-[11px] text-ink-3">
                  {v.contentHash.slice(0, 16)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {v.itemCount} items &middot;{" "}
                  {new Date(v.publishedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            Every order stores the version it was priced against, so changing a price
            here never rewrites what a guest already agreed to pay.
          </p>
        </aside>
      </div>
    </main>
  );
}

function ItemForm({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: MenuItem;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2));
  const [cost, setCost] = useState((item.costCents / 100).toFixed(2));
  const [prep, setPrep] = useState(String(Math.round(item.prepSeconds / 60)));
  const [station, setStation] = useState(item.station);

  const priceCents = Math.round(parseFloat(price || "0") * 100);
  const costCents = Math.round(parseFloat(cost || "0") * 100);
  const marginPct = priceCents ? Math.round(((priceCents - costCents) / priceCents) * 100) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          description,
          priceCents,
          costCents,
          prepSeconds: Math.round(parseFloat(prep || "0") * 60),
          station,
        });
      }}
      className="grid gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-sm border border-line bg-card-2 px-2.5 py-1.5 text-[14px] font-bold outline-none focus:border-brand"
        aria-label="Item name"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="rounded-sm border border-line bg-card-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
        aria-label="Description"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="grid gap-1">
          <span className="label">Price $</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Cost $</span>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="decimal"
            className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Prep min</span>
          <input
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            inputMode="numeric"
            className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Station</span>
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as MenuItem["station"])}
            className="mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
          >
            {STATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="label">
        Margin at these numbers:{" "}
        <span className={marginPct >= 65 ? "text-green" : marginPct >= 50 ? "text-amber" : "text-red"}>
          {marginPct}%
        </span>
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-sm bg-brand px-3 py-1.5 text-[13px] font-bold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save to draft"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-line px-3 py-1.5 text-[13px] font-bold hover:border-line-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The add-item form.
 *
 * Margin is shown live as the price and cost are typed, because that number is
 * the one an operator will regret getting wrong and the one a till never shows
 * them. The section is a free-typed field with existing sections offered — a
 * fixed dropdown would stop anyone adding "Specials" on a Friday.
 */
function NewItemForm({
  sections,
  photoKeywords,
  busy,
  onCancel,
  onSave,
}: {
  sections: string[];
  photoKeywords: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (item: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [prep, setPrep] = useState("5");
  const [section, setSection] = useState(sections[0] ?? "Menu");
  const [station, setStation] = useState("assembly");
  const [imageKw, setImageKw] = useState("food");

  const priceCents = Math.round(parseFloat(price || "0") * 100);
  const costCents = Math.round(parseFloat(cost || "0") * 100);
  const marginPct = priceCents ? Math.round(((priceCents - costCents) / priceCents) * 100) : 0;
  const ready = name.trim().length > 0 && priceCents > 0 && section.trim().length > 0;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSave({
          name, description, priceCents, costCents,
          prepSeconds: Math.round(parseFloat(prep || "0") * 60),
          section, station, imageKw,
        });
        if (ok) {
          setName(""); setDescription(""); setPrice(""); setCost("");
        }
      }}
      className="rounded-md border border-brand bg-card p-4"
    >
      <h3 className="text-[15px] font-extrabold">New item</h3>
      <p className="mt-0.5 text-[13px] text-ink-2">
        Added to the draft. Nobody can order it until you publish the menu.
      </p>

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1">
          <span className="label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
            placeholder="Birria Ramen"
            className="rounded-sm border border-line bg-card-2 px-3 py-2 text-[14px] font-bold outline-none focus:border-brand"
          />
        </label>

        <label className="grid gap-1">
          <span className="label">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="What a guest should know before ordering it."
            className="rounded-sm border border-line bg-card-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="grid gap-1">
            <span className="label">Price $</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="13.50"
              className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Food cost $</span>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="4.10"
              className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Prep min</span>
            <input
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
              inputMode="numeric"
              className="num mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Station</span>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="mono rounded-sm border border-line bg-card-2 px-2 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              {STATIONS.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="label">Section</span>
            <input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              list="md-sections"
              maxLength={60}
              className="rounded-sm border border-line bg-card-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
            />
            <datalist id="md-sections">
              {sections.map((s) => <option key={s} value={s} />)}
            </datalist>
          </label>
          <label className="grid gap-1">
            <span className="label">Photo</span>
            <select
              value={imageKw}
              onChange={(e) => setImageKw(e.target.value)}
              className="rounded-sm border border-line bg-card-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              {photoKeywords.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="label mt-3">
        Margin at these numbers:{" "}
        {priceCents === 0 ? (
          <span className="text-ink-3">enter a price</span>
        ) : costCents > priceCents ? (
          <span className="text-red">
            loses {`$${((costCents - priceCents) / 100).toFixed(2)}`} every sale
          </span>
        ) : (
          <span
            className={marginPct >= 65 ? "text-green" : marginPct >= 50 ? "text-amber" : "text-red"}
          >
            {marginPct}%
          </span>
        )}
        {costCents === 0 && priceCents > 0 && (
          <span className="text-ink-3">
            {" "}&middot; add a food cost so the optimizer can price this item
          </span>
        )}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy || !ready}
          className="rounded-sm bg-brand px-3.5 py-1.5 text-[13px] font-bold text-brand-ink disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add to draft"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-line px-3.5 py-1.5 text-[13px] font-bold hover:border-line-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
