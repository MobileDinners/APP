"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Marketplace visibility and featured placement for one restaurant.
 *
 * Hiding a restaurant is instantly visible to every diner, so it confirms
 * first. Featuring one is reversible and low-stakes, so it does not — a
 * confirmation on every action trains people to click through all of them.
 */
export function VisibilityToggle({
  orgId,
  brandName,
  accepting,
  sponsored,
}: {
  orgId: string;
  brandName: string;
  accepting: boolean;
  sponsored: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(patch: { accepting?: boolean; sponsored?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/merchants/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? "Could not save");
      return;
    }
    router.refresh();
  }

  function toggleVisible() {
    if (accepting) {
      const ok = window.confirm(
        `Hide ${brandName} from the marketplace?\n\n` +
          "It disappears from the feed, from search and from its own storefront " +
          "immediately. Anyone mid-order will not be able to check out.",
      );
      if (!ok) return;
    }
    void send({ accepting: !accepting });
  }

  return (
    <div className="rounded-[12px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={toggleVisible}
          className={`rounded-[10px] px-5 py-2.5 text-[14px] font-extrabold transition-colors disabled:opacity-40 ${
            accepting
              ? "border border-red text-red hover:bg-red-soft"
              : "bg-brand text-brand-ink hover:bg-brand-press"
          }`}
        >
          {accepting ? "Hide from marketplace" : "Show in marketplace"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void send({ sponsored: !sponsored })}
          className="rounded-[10px] border border-line-2 px-5 py-2.5 text-[14px] font-bold hover:bg-card-2 disabled:opacity-40"
        >
          {sponsored ? "Remove from featured" : "Feature on the homepage"}
        </button>

        <span className="text-[13px] text-ink-3">
          {accepting ? "Currently taking orders." : "Currently hidden from diners."}
        </span>
      </div>
      {error && <p className="mt-3 text-[13.5px] font-semibold text-red">{error}</p>}
    </div>
  );
}
