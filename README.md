# Mobile Dinners

A food delivery marketplace with **0% commission**, plus the restaurant-side
software that makes that possible. Three working surfaces on one live backend:
a customer app in the DoorDash/Uber Eats idiom, a restaurant dashboard with a
menu editor and an AI price optimizer, and a kitchen display. Place an order on
one and it appears on the other two within a second.

Architecture, business model and roadmap: [`docs/mobile-dinners-os.html`](docs/mobile-dinners-os.html)

---

## Run it

```bash
npm install && npm run dev
```

Open **http://localhost:3100**. For your phone on the same Wi-Fi, use
`npm run dev:lan` and browse to your machine's LAN address on port 3100.

### Sign in

| Who | Where | Credentials |
| --- | --- | --- |
| Customer | `/signin` | Phone `(415) 555-0142` — the code is shown on screen in dev |
| Owner | `/staff/login` | `owner@sunrise-taqueria.test` / `dinner1234` |
| Manager | `/staff/login` | `manager@sunrise-taqueria.test` / `dinner1234` |
| Shift lead | `/staff/login` | `lead@sunrise-taqueria.test` / `dinner1234` |

Every restaurant has an owner at `owner@<slug>.test`. The three Sunrise accounts
exist so the role differences are actually exercisable.

### Surfaces

| Surface | Route | Who |
| --- | --- | --- |
| Customer app | `/` `/search` `/orders` `/rewards` | Guests |
| Restaurant dashboard | `/ops` | Staff |
| Menu editor | `/ops/menu` | Owner, manager |
| Menu optimizer | `/ops/optimizer` | Owner, manager |
| Customers (CRM) | `/ops/customers` | Staff |
| Marketing | `/ops/campaigns` | Owner, manager |
| Upsells | `/ops/upsell` | Staff |
| Website | `/ops/site` | Owner, manager |
| Your POS (Square/Clover) | `/ops/pos` | Owner, manager |
| Public restaurant site | `/site/<slug>` | Anyone |
| Kitchen display | `/kds` | The line |

The floating **⇄** button jumps between them. In production these are separate
apps behind separate logins.

### The demo

1. `/` → **Sunrise Taqueria** → **Al Pastor Tacos** → options → checkout.
   Checkout requires a phone sign-in; browsing and the cart do not.
2. Open `/kds` in a second window — the ticket is already there.
3. **Bump all.** The tracking page fills in with real timestamps, no refresh.
4. `/ops` → advance to **Settled**. Points land in the wallet.
5. `/ops/optimizer` → a price suggestion with a projected margin change and an
   interval. **Apply to draft**, then `/ops/menu` → **Publish**. Only now do
   guests see the new price — and orders placed before it keep the old one.
6. `/ops` → **86** an item, reload `/` — it is gone, and the API returns
   `409 item_unavailable`.

```bash
npm run seed:history     # 9,000 customers and 70 days of sales
npm run reset            # clear orders, restore the wallet
npm run reset:campaigns  # clear campaigns and simulated orders
npm test                 # auth + menu + optimizer + crm + campaigns
```

---

## What's real

- **Auth, three ways.** Customers use phone + one-time code (no password).
  Staff use email + password, scoped to one restaurant with a role. Sessions are
  32 random bytes; only their SHA-256 is stored, so a database leak can't be
  replayed as a login. Passwords are scrypt with per-password salts, and every
  secret comparison is `timingSafeEqual`.
- **Tenant isolation.** Scope comes from the session, never a query parameter.
  Bao Haus staff get `404` on a Sunrise order — the same response as a
  nonexistent one, so ids can't be probed.
- **Roles.** A shift lead can bump tickets and 86 items but cannot edit the
  menu, publish it, or cancel a paid order.
- **Immutable menu versions.** The `items` table is a draft; publishing freezes
  it into a content-hashed snapshot. Every order records the version it was
  priced against, so changing a price never rewrites what a guest agreed to pay.
  Republishing an unchanged menu is refused.
- **Menu optimizer.** A constrained search over a demand model, not an LLM
  guessing prices. Pooled category elasticity widened by how thin the data is,
  every projection carries an interval, and guardrails cap moves at ±8%, five
  suggestions per cycle, a 45% margin floor, and never raise the top three
  traffic drivers. Every proposal and verdict is logged to `ai_decisions`.
- **CRM computed from orders, not stored.** Segments use each guest's *own*
  cadence rather than a fixed 30-day rule, so a monthly regular is not chased
  like a weekly one. Churn and predicted value are labelled as heuristics
  because that is what they are.
- **A restaurant sees only its own relationship with a guest.** Tested: a guest
  with 8 orders across the network shows 2 at one restaurant and 1 at another,
  and neither is ever shown the total.
- **Campaigns measure lift, not attribution.** Every send holds back a random
  control group and reports the difference between arms. Consent is per channel
  and suppressions are shown with counts and reasons rather than silently
  shrinking the audience. The estimator is validated against injected effects:
  it recovered a known $1,188 lift as $1,174, and produced 0 false positives in
  25 null runs.
- **Upsells ranked by lift, not frequency.** Chips appear alongside everything,
  so raw co-occurrence would recommend chips forever; lift asks whether an item
  is *more* likely given this cart. Hard filters drop anything sold out, anything
  that would push the ticket past what the kitchen is already committed to, and
  a third item from a category the cart already has two of. Margin is the last
  tiebreak, never the first. One cart in ten is shown nothing, so "upsells raised
  the ticket" is a checkable claim rather than a slogan.
- **Website builder edits a structured page model, not HTML.** Sections are
  typed, so the page stays valid and re-themeable. The menu section holds no
  menu content at all — it is a live binding to the published menu of record,
  so there is never a second copy to go stale.
- **The claims filter is a publish gate, not a warning.** Allergen and health
  claims ("gluten-free", "safe for celiacs", "low-calorie", "boosts immunity")
  block publishing outright, because a guest with celiac disease will believe
  the website and the system cannot verify the kitchen. Origin claims and
  superlatives warn instead — legal exposure rather than physical risk. Nothing
  is silently rewritten; blocked spans are shown with the reason.
- **SEO is a checklist with fixes attached, never a score.** "SEO: 72" tells an
  operator nothing they can act on.
- **Coexist mode with Square and Clover.** A restaurant keeps the till it
  already owns. The POS stays authoritative for names and prices; we keep what a
  till has no concept of — web copy, photos, food cost, marketplace-only items —
  and orders are pushed back so tickets print on their existing hardware.
  Connecting to a restaurant that already sells here matches items by name
  instead of duplicating the menu. If more than three fields on one item
  disagree, **nothing is applied** and it is flagged: that usually means the
  item was replaced rather than edited, and silently overwriting a price is the
  worst thing this system could do.
- **POS access tokens are sealed with AES-256-GCM.** The key comes from
  `MD_TOKEN_KEY` and is required in production — a token that can read sales
  history does not sit in plaintext next to the orders table.
- **Append-only event log.** Order state is a fold over `order_events`.
- **Server-authoritative pricing**, integer cents everywhere, and
  `Idempotency-Key` required on order creation.
- **Live fan-out** over SSE, scoped by session — a guest sees their own order
  and public menu changes, nothing else.

## What's stubbed

- **SQLite, not Postgres.** Same schema shape; no row-level security, so every
  query scopes by `org_id` explicitly instead.
- **Hand-rolled auth.** Small and readable so it can be audited, but a real
  deployment should move to a provider. No passkeys, no MFA, no device pairing
  or staff PINs yet.
- **No SMS or email provider.** Sign-in codes are shown on screen in development
  only. Campaign sends are recorded but nothing is delivered — production needs
  Twilio Verify and an ESP.
- **Website copy is templated, not model-written.** There is no LLM wired up.
  `draftCopy` in `src/lib/site.ts` is the seam: swap that one function for a
  model call and the page model, claims filter, publish gate and SEO audit
  around it already work.
- **Campaign results are simulated in the demo.** `/api/campaigns/:id/simulate`
  fabricates post-send orders with a KNOWN effect so the estimator can be
  checked against an answer we already have. It refuses to run in production.
- **No payments.** `payment.authorized` goes straight to the event log — no
  processor, no double-entry ledger.
- **Square and Clover are unverified against their live APIs.** No merchant
  credentials exist here, so the adapters are written to the documented request
  and response shapes but have never made a real call. The sandbox provider
  stands in for a till so the mapping, conflict and order-injection logic is
  genuinely tested. Set `SQUARE_CLIENT_ID`/`SQUARE_CLIENT_SECRET` or the Clover
  equivalents to enable them.
- **No dispatch.** Delivery states advance by operator tap; the route map is
  illustrative and says so.
- **Photography is placeholder.** Real dish photos from TheMealDB, resolved once
  by `scripts/fetch-photos.mjs`. Real food, not these restaurants' food.
- **Cross-brand loyalty has no settlement.** Points spend anywhere, but money
  doesn't yet move between restaurants.

---

## Deploying

The app keeps its database in SQLite on local disk, so **it needs a persistent
volume** — it will lose everything on a serverless platform with an ephemeral
filesystem. A `Dockerfile` and `fly.toml` are included for a host that offers
one (Fly.io, Railway, Render, a VM).

```bash
fly launch --no-deploy                              # edit `app` in fly.toml first
fly volumes create md_data --size 1 --region <region>
fly deploy
```

Set `MD_DATA_DIR` to the mount point (`/data` in the provided config).

**Two things to know before it goes public:**

1. A fresh production start **refuses to seed the demo accounts**, because they
   share a password published in this README. Either provision real data, or set
   `MD_ALLOW_DEMO_SEED=true` to accept that on a throwaway demo URL.
2. SQLite means one writer. Do not scale past a single machine without moving to
   Postgres first — which is a real refactor, since the data layer is
   synchronous throughout.

I have not run the container or deployed it: Docker isn't installed here, and
deploying needs your account. What is verified is the standalone server the
container runs — it boots, serves, enforces auth, and passes its health check.

## Layout

```
src/
  app/
    page.tsx  r/[slug]  cart  track/[orderId]      customer
    search  orders  rewards  signin                customer
    ops  ops/menu  ops/optimizer  kds              staff
    staff/login                                    staff auth
    api/
      auth/{otp,staff,logout,me}                   sessions
      orders  orders/[id]  orders/[id]/transitions
      kitchen/bump  menu/availability
      menu/items/[id]  menu/publish                menu draft + versions
      optimizer/decision                           accept / dismiss
      stream  health
  lib/
    db.ts        schema            orders.ts    state machine + service
    auth.ts      sessions, OTP     menu.ts      versioning + publish
    password.ts  scrypt            optimizer.ts elasticity + proposals
    crm.ts       segments, churn   campaigns.ts holdouts + incrementality
    crm-labels.ts / campaign-templates.ts   client-safe types and copy
    seed.ts      6 restaurants     money.ts     integer cents
    events.ts    event bus         images.ts    photo resolution
  components/
scripts/
  fetch-photos.mjs      regenerate the photo map
  generate-history.mjs  70 days of sales for the optimizer
  reset.mjs             clear orders
  db-query.mjs          read-only helper for tests
  reset-campaigns.mjs   clear campaigns and simulated orders
  test-auth.sh  test-menu.sh  test-optimizer.sh
  test-crm.sh   test-campaigns.sh   test-all.sh
```

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · `node:sqlite` (Node 24
built-in — no Docker or native build step needed for local development).
