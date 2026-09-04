"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

type Provider = { id: string; name: string; configured: boolean; note: string };
type Connection = {
  provider: string; merchantId: string; status: string;
  lastSyncAt: string | null; lastError: string | null; connectedAt: string;
};
type SyncChange = {
  externalId: string; name: string; action: string;
  fields: Array<{ field: string; from: string; to: string }>; reason?: string;
};
type SyncLog = {
  logId: string; provider: string; created: number; updated: number;
  unchanged: number; flagged: number; skipped: number; changes: SyncChange[];
  ok: boolean; error: string | null; createdAt: string;
};
type Push = {
  order_id: string; status: string; attempts: number;
  last_error: string | null; external_order_id: string | null; updated_at: string;
};

export function PosConnect({
  active,
  staff,
  providers,
  connection,
  mappedCount,
  history,
  pending,
  message,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  providers: Provider[];
  connection: Connection | null;
  mappedCount: number;
  history: SyncLog[];
  pending: Push[];
  message: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(message);

  const canManage = staff.role === "owner" || staff.role === "manager";

  async function connect(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/pos/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id }),
    });
    const data = (await res.json()) as {
      authorizeUrl?: string; connected?: boolean; error?: string;
    };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not start the connection");
      return;
    }
    if (data.authorizeUrl) {
      window.location.href = data.authorizeUrl;
      return;
    }
    setFlash("Sandbox till connected and seeded from your current menu.");
    startTransition(() => router.refresh());
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    const res = await fetch("/api/pos/sync", { method: "POST" });
    const data = (await res.json()) as {
      result?: { created: number; updated: number; flagged: number; publishedVersion?: number; ok: boolean; error?: string };
      error?: string;
    };
    setBusy(null);
    if (!res.ok || data.result?.ok === false) {
      setError(data.error ?? data.result?.error ?? "Sync failed");
      startTransition(() => router.refresh());
      return;
    }
    const r = data.result!;
    setFlash(
      `${r.created} added, ${r.updated} updated, ${r.flagged} needing review` +
        (r.publishedVersion ? ` — published menu v${r.publishedVersion}.` : "."),
    );
    startTransition(() => router.refresh());
  }

  async function retry(orderId: string) {
    setBusy(orderId);
    await fetch("/api/pos/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retryOrderId: orderId }),
    });
    setBusy(null);
    startTransition(() => router.refresh());
  }

  async function remove() {
    setBusy("disconnect");
    await fetch("/api/pos/sync", { method: "DELETE" });
    setBusy(null);
    setFlash("Disconnected. Your menu here is unchanged.");
    startTransition(() => router.refresh());
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Your POS</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
          {connection && (
            <span
              className={`pill ${
                connection.status === "active"
                  ? "border-green bg-green-soft text-green"
                  : connection.status === "needs_reauth"
                    ? "border-amber bg-amber-soft text-amber"
                    : "border-red bg-red-soft text-red"
              }`}
            >
              {connection.status.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/menu" className="label hover:text-ink">Menu</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      <section className="mb-5 rounded-md border border-blue bg-blue-soft p-3.5">
        <p className="label !text-blue mb-1">Keep the till you already have</p>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Connecting Square or Clover lets you use Mobile Dinners without replacing anything
          mid-season. Your POS stays in charge of item names and prices. We keep the things a
          till has no concept of — web descriptions, photos, food cost, marketplace-only items
          — and we push orders back so tickets print on the hardware your staff already use.
        </p>
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
      {connection?.lastError && (
        <p className="mb-4 rounded-sm border border-amber bg-amber-soft px-3 py-2 text-sm text-amber">
          Last attempt failed: {connection.lastError}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          {!connection ? (
            <>
              <h2 className="label mb-2.5 border-b border-line pb-1.5">Connect a POS</h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {providers.map((p) => (
                  <li key={p.id} className="rounded-md border border-line bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-extrabold">{p.name}</p>
                        <p className="mt-0.5 text-[13px] text-ink-2">{p.note}</p>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => connect(p.id)}
                          disabled={!p.configured || busy === p.id}
                          className="btn btn-primary shrink-0 px-4 py-2 text-[14px] disabled:opacity-40"
                        >
                          {busy === p.id ? "Opening…" : p.configured ? "Connect" : "Unavailable"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-extrabold capitalize">{connection.provider}</p>
                    <p className="mono mt-0.5 text-[12px] text-ink-3">
                      merchant {connection.merchantId}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {mappedCount} item{mappedCount === 1 ? "" : "s"} linked ·{" "}
                      {connection.lastSyncAt
                        ? `last synced ${new Date(connection.lastSyncAt).toLocaleString([], {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}`
                        : "never synced"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={sync}
                        disabled={busy === "sync"}
                        className="btn btn-primary px-4 py-2 text-[14px] disabled:opacity-40"
                      >
                        {busy === "sync" ? "Syncing…" : "Sync menu now"}
                      </button>
                      <button
                        type="button"
                        onClick={remove}
                        disabled={busy === "disconnect"}
                        className="rounded-full border border-line px-4 py-2 text-[14px] font-bold hover:border-red hover:text-red"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {pending.length > 0 && (
                <section className="mt-4 rounded-md border border-amber bg-amber-soft p-4">
                  <p className="label !text-ink-2 mb-1">Orders not yet on your till</p>
                  <p className="mb-2 text-[13px] text-ink-2">
                    These guests have paid and their food is owed regardless. The ticket just
                    has not reached your POS yet.
                  </p>
                  <ul className="m-0 list-none p-0">
                    {pending.map((p) => (
                      <li key={p.order_id} className="flex items-center gap-3 border-b border-line-2 py-1.5 text-[13px] last:border-0">
                        <span className="mono">#{p.order_id.slice(0, 6)}</span>
                        <span className="text-ink-2">
                          {p.status} · {p.attempts} attempt{p.attempts === 1 ? "" : "s"}
                        </span>
                        <span className="flex-1 truncate text-ink-3">{p.last_error}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => retry(p.order_id)}
                            disabled={busy === p.order_id}
                            className="mono rounded-sm border border-line px-2 py-1 text-[11px] uppercase"
                          >
                            {busy === p.order_id ? "…" : "Retry"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <h2 className="label mb-2.5 mt-6 border-b border-line pb-1.5">Sync history</h2>
              {history.length === 0 ? (
                <p className="py-2 text-[13px] text-ink-3">Nothing synced yet.</p>
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {history.map((h) => (
                    <li key={h.logId} className="rounded-md border border-line bg-card p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] font-bold">
                          {new Date(h.createdAt).toLocaleString([], {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                        </span>
                        <span className="label">
                          {h.ok
                            ? `${h.created} added · ${h.updated} updated · ${h.unchanged} unchanged · ${h.flagged} flagged`
                            : "failed"}
                        </span>
                      </div>
                      {h.error && <p className="mt-1 text-[12.5px] text-red">{h.error}</p>}
                      {h.changes.length > 0 && (
                        <ul className="m-0 mt-2 list-none border-t border-line p-0 pt-2">
                          {h.changes.slice(0, 8).map((c) => (
                            <li key={c.externalId} className="py-1 text-[12.5px]">
                              <span
                                className={`pill mr-1.5 ${
                                  c.action === "flagged"
                                    ? "border-amber bg-amber-soft text-amber"
                                    : c.action === "created"
                                      ? "border-green bg-green-soft text-green"
                                      : "border-line-2 bg-card-2 text-ink-3"
                                }`}
                              >
                                {c.action}
                              </span>
                              <span className="font-bold">{c.name}</span>
                              {c.fields.map((f) => (
                                <span key={f.field} className="ml-2 text-ink-2">
                                  {f.field}{" "}
                                  <span className="mono text-red line-through">{f.from}</span>{" "}
                                  <span className="mono text-green">{f.to}</span>
                                </span>
                              ))}
                              {c.reason && (
                                <span className="block text-[11.5px] text-ink-3">{c.reason}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <aside>
          <h2 className="label mb-2 border-b border-line pb-1.5">Who wins a disagreement</h2>
          <ul className="m-0 list-none p-0 text-[12.5px] leading-relaxed">
            <Rule field="Name and price" winner="Your POS" note="Overwritten here on every sync." />
            <Rule field="Description, photo" winner="Mobile Dinners" note="A till has nowhere to put web copy." />
            <Rule field="Sold out (86)" winner="Most recent" note="Either side can 86 an item; the last change wins." />
            <Rule field="Food cost" winner="Mobile Dinners" note="Your POS does not track it. The optimizer needs it." />
            <Rule field="Marketplace-only items" winner="Mobile Dinners" note="Never pushed to your till." />
          </ul>
          <p className="mt-3 rounded-sm border border-line bg-card p-2.5 text-[12px] leading-relaxed text-ink-2">
            If more than three fields on one item disagree, <span className="font-bold text-ink">nothing
            is changed</span> and it is flagged instead. That usually means the item was replaced
            on the till rather than edited, and silently overwriting a price is the worst thing
            this system could do.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Rule({ field, winner, note }: { field: string; winner: string; note: string }) {
  return (
    <li className="border-b border-line py-2 last:border-0">
      <span className="font-bold">{field}</span>
      <span className="ml-1.5 pill border-line-2 bg-card-2 text-ink-3">{winner}</span>
      <span className="mt-0.5 block text-ink-3">{note}</span>
    </li>
  );
}
