import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers, and host-based routing for partners.mobiledinners.com.
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

/**
 * Response headers applied to everything.
 *
 * This site takes card details through Stripe and holds a restaurant's whole
 * customer list, so the defaults matter more than usual.
 *
 * `frame-ancestors 'none'` is the important one: without it the checkout can be
 * loaded in a hidden iframe on another site and clicked through by a victim who
 * thinks they are clicking something else. X-Frame-Options says the same thing
 * for older browsers that ignore CSP.
 *
 * `style-src` keeps 'unsafe-inline'. Tailwind emits inline styles and the food
 * photography sets its placeholder hue as a style attribute, so removing it
 * would break the page for no security gain — style injection cannot execute.
 * Scripts get no such exemption.
 */
function securityHeaders(res: NextResponse, nonce: string): NextResponse {
  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets Next's own bundle load its chunks once the entry
    // script is trusted by nonce, so no host allowlist is needed for our code.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // Food photography, plus the data: URIs the placeholder gradients use.
    "img-src 'self' data: blob: https://www.themealdb.com https://*.stripe.com",
    // Stripe.js needs to reach its API; everything else is same-origin.
    "connect-src 'self' https://api.stripe.com",
    // Stripe Elements and the hosted onboarding render in an iframe.
    "frame-src https://js.stripe.com https://hooks.stripe.com https://connect.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Nothing here needs a camera, a microphone or a payment handler API.
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=()",
  );

  // Only over HTTPS: sending HSTS on plain http tells a browser to upgrade a
  // host that may not have a certificate, which locks people out of localhost.
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  return res;
}

function hostOf(req: NextRequest): string {
  // x-forwarded-host is what a proxy or load balancer sets; fall back to Host.
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(":")[0].toLowerCase();
}

export function middleware(req: NextRequest) {
  const host = hostOf(req);
  const { pathname, search } = req.nextUrl;

  // One nonce per request, handed to Next through a request header so its own
  // inline bootstrap script carries it. A nonce reused across requests is worth
  // nothing, which is why it is generated here rather than configured.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);

  const isPartnersHost = host === "partners" || host.startsWith("partners.");

  const needsRewrite =
    isPartnersHost &&
    !pathname.startsWith("/partners") &&
    !SHARED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!needsRewrite) {
    // On the consumer host, /partners/* still resolves directly. That is what
    // makes local development work without editing anyone's hosts file.
    return securityHeaders(NextResponse.next({ request: { headers } }), nonce);
  }

  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? "/partners" : `/partners${pathname}`;
  url.search = search;
  return securityHeaders(NextResponse.rewrite(url, { request: { headers } }), nonce);
}

export const config = {
  // Everything except static assets; the shared-prefix list above does the
  // finer filtering once we know the host.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
