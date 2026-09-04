"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/staff/login");
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <span className="label !text-ink-2">{name}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="mono rounded-sm border border-line px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-3 hover:border-line-2 hover:text-ink disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </span>
  );
}
