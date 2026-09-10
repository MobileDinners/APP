/**
 * Prints which payment processor this checkout is actually configured for:
 * "live", "test" or "none".
 *
 * The shell tests need this so they can assert what SHOULD be true for the
 * deployment in front of them, instead of hard-coding one configuration and
 * failing the day somebody adds a key. The value is derived from the same
 * environment the app reads, and the key itself is never printed.
 */
import { readFileSync, existsSync } from "node:fs";

function fromEnvLocal(name) {
  if (!existsSync(".env.local")) return "";
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "").trim();
  }
  return "";
}

const key = (process.env.STRIPE_SECRET_KEY || fromEnvLocal("STRIPE_SECRET_KEY") || "").trim();

// Deliberately the same rule as stripeMode() in src/lib/payments/index.ts:
// absent is "none", sk_live_ is "live", anything else present is "test". A
// stricter rule here would disagree with the app on a malformed key and the
// test would blame the app for the difference.
console.log(!key ? "none" : key.startsWith("sk_live_") ? "live" : "test");
