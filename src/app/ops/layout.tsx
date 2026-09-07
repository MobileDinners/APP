import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PLATFORM_ORG_ID } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * The operator application belongs to restaurants, not to the platform.
 *
 * /ops/page.tsx already sent platform staff to /admin, but only that one page
 * did — every other route underneath it was reachable. That is not a
 * hypothetical: it sent someone to /ops/payments signed in as the platform
 * administrator, where they onboarded Mobile Dinners itself to Stripe Connect
 * as though it were one of its own restaurants. The page was convincing
 * because it was working correctly; it was simply answering for an org that is
 * not a restaurant.
 *
 * Putting the check in the layout means a page added under this directory is
 * covered by existing rather than by remembering — the same reason the admin
 * gate lives in its layout.
 *
 * Only the platform org is redirected. Ordinary staff auth stays with each
 * page, which needs the session for its own scoping anyway.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.kind === "staff" && session.orgId === PLATFORM_ORG_ID) {
    redirect("/admin");
  }
  return <>{children}</>;
}
