import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based routing for partners.mobiledinners.com.
 *
 * The merchant side is a separate hostname to everyone outside the codebase,
 * but the same deployment inside it: this rewrites `partners.<domain>/x` onto
 * `/partners/x`, so going live is one CNAME rather than a second build, and the
 * whole thing stays browsable at /partners locally where subdomains are a pain.
 *
 * Rewrites, not redirects — the visitor's URL bar keeps saying partners.
 */

/** Paths that mean the same thing on either host and must not be prefixed. */
const SHARED_PREFIXES = [
  "/api",
  "/ops",      // the operator application
  "/kds",      // the kitchen display
  "/staff",    // staff sign-in
  "/terms",
  "/privacy",
  "/_next",
  "/favicon",
];

function hostOf(req: NextRequest): string {
  // x-forwarded-host is what a proxy or load balancer sets; fall back to Host.
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(":")[0].toLowerCase();
}

export function middleware(req: NextRequest) {
  const host = hostOf(req);
  const { pathname, search } = req.nextUrl;

  const isPartnersHost = host === "partners" || host.startsWith("partners.");
  if (!isPartnersHost) {
    // On the consumer host, /partners/* still resolves directly. That is what
    // makes local development work without editing anyone's hosts file.
    return NextResponse.next();
  }

  if (pathname.startsWith("/partners")) return NextResponse.next();
  if (SHARED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? "/partners" : `/partners${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except static assets; the shared-prefix list above does the
  // finer filtering once we know the host.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
