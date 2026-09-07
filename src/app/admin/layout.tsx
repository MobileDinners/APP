import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin, storageIsDurable } from "@/lib/site-content";
import { SignOut } from "@/components/SignOut";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

/**
 * The internal admin application.
 *
 * Everything under /admin is platform-wide: it reads across every restaurant
 * and every customer, with none of the tenant scoping that governs the rest of
 * the codebase. That makes this layout the single most important gate in the
 * product, so the check lives HERE rather than in each page — a new page added
 * under this directory is protected by existing, not by remembering.
 *
 * A caller without the grant gets notFound(), not a 403. Telling an attacker
 * that /admin exists and they are merely not welcome is a free hint.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/admin");
  if (!isPlatformAdmin(session.email)) notFound();

  return (
    <div className="min-h-screen bg-bg-2">
      <header className="sticky top-0 z-40 border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-ink text-[13px] font-extrabold text-bg">
              M
            </span>
            <span className="text-[15px] font-extrabold tracking-[-0.02em]">Mobile Dinners</span>
          </Link>
          <span className="rounded-full bg-red-soft px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-red">
            Internal admin
          </span>

          <div className="ml-auto flex items-center gap-3 text-[12.5px] text-ink-3">
            {!storageIsDurable() && (
              <span className="hidden rounded-full border border-amber bg-amber-soft px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-amber sm:inline">
                No disk — data is ephemeral
              </span>
            )}
            <Link href="/" className="font-semibold hover:text-ink">
              View site
            </Link>
            <SignOut name={session.name} />
          </div>
        </div>
        <AdminNav />
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">{children}</main>
    </div>
  );
}
