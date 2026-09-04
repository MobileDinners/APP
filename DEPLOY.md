# Deploying Mobile Dinners to Render

Everything here is done from a browser and a terminal. It assumes nothing has
been created yet.

---

## Before you start

Three facts about this stack that decide the setup:

**The database is SQLite on a mounted disk.** That means one instance, a paid
plan, and about a minute of downtime per deploy. It is the right shape for a
pilot and the wrong shape for scale — see [When to move to Postgres](#when-to-move-to-postgres).

**No external service is contacted without credentials.** Payments and delivery
fall back to local sandboxes in development, and *refuse to run those sandboxes
in production*. A deployment can never accept an order it cannot charge for, or
promise a courier who was never dispatched.

**An empty database is a valid state.** A fresh production deploy starts with
no restaurants and waits for one to sign up at `/partners/signup`. That is
deliberate, not a failure.

---

## 1. Put the code on GitHub

Render deploys from a Git repository. The repo is already initialised and
committed locally; it needs a remote.

Create an empty **private** repository on GitHub — no README, no `.gitignore`,
nothing — then:

```bash
git remote add origin https://github.com/<you>/mobile-dinners.git
git push -u origin main
```

`.gitignore` already excludes `data/`, `.env.local` and `node_modules/`, so no
database and no secret is pushed. Verify with `git ls-files | grep -c env` — it
should find only `.env.example`.

---

## 2. Create the service on Render

1. **New → Blueprint**, and point it at the repository.
2. Render reads [`render.yaml`](./render.yaml) and proposes one web service with
   a 1 GB disk. Accept it.
3. It will prompt for every variable marked `sync: false`. **Leave them all
   blank for now** except `MD_PUBLIC_URL` — you do not have the real values yet,
   and the app boots fine without them.
4. Set `MD_PUBLIC_URL` to `https://mobile-dinners.onrender.com` (or whatever
   hostname Render assigns). You can correct it later.

First build takes roughly five minutes. When it finishes:

```bash
curl https://<your-service>.onrender.com/api/health
# {"ok":true,"restaurants":0,"time":"..."}
```

`"restaurants":0` is correct. The marketplace is empty because nobody has
signed up yet.

> **The plan matters.** The disk needs `starter` or above. On the free tier the
> filesystem is ephemeral, so every restaurant, order and account is destroyed
> on each deploy. `render.yaml` pins `starter`; do not lower it.

---

## 3. Decide what the first deploy contains

**For a sales demo** — you want the six seeded restaurants so there is something
to show:

```
MD_ALLOW_DEMO_SEED = true
```

This loads demo data whose staff accounts share the password `dinner1234`,
which is published in this repository. Acceptable on a URL you control and
hand out deliberately. **Never on a deployment taking real orders.**

**For a real launch** — leave it unset. The marketplace starts empty and fills
as restaurants sign up.

The flag only has an effect on an empty database. Once anything exists, the
seed never runs again, so you cannot flip it later to "add demos" to a live
system.

---

## 4. Connect Stripe

In the Render dashboard, **Environment → Add**:

```
STRIPE_SECRET_KEY                    sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   pk_test_...
```

Use **test** keys first. The operator screen shows a blue "test mode" banner so
nobody mistakes a simulated charge for a real one.

Then add the webhook. In the Stripe dashboard, **Developers → Webhooks → Add
endpoint**:

- URL: `https://<your-service>.onrender.com/api/payments/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `charge.refunded`, `account.updated`

Copy the signing secret it gives you back into Render as
`STRIPE_WEBHOOK_SECRET`. Until that is set, the webhook endpoint returns 503 to
everything — which is the correct posture, because an unverifiable payment
event must never move money.

---

## 5. Connect DoorDash Drive

From [developer.doordash.com/portal](https://developer.doordash.com/portal),
create a **Drive** credential set:

```
DOORDASH_DEVELOPER_ID
DOORDASH_KEY_ID
DOORDASH_SIGNING_SECRET
DOORDASH_WEBHOOK_SECRET
DOORDASH_ENV = sandbox
```

Add a webhook pointing at `https://<your-service>.onrender.com/api/delivery/webhook`.

Drive also needs a signed agreement and coverage in your launch city. Confirm
both before promising delivery to a pilot restaurant.

---

## 6. Point the domain at it

In Render, **Settings → Custom Domains**, add:

- `mobiledinners.com`
- `partners.mobiledinners.com`

Render gives you a CNAME target for each. Add both at your registrar.

The partners subdomain needs **no separate service**. `src/middleware.ts`
rewrites the `partners.` host onto `/partners/*`, so one deployment serves both
sites and going live there is one DNS record.

Once the domain resolves, update `MD_PUBLIC_URL` to `https://mobiledinners.com`
and update both webhook URLs in Stripe and DoorDash to match.

---

## Deploying changes

`autoDeploy: true` means a push to `main` deploys.

```bash
git push
```

**A service with a disk cannot deploy without downtime.** Render must stop the
running instance to detach the disk before the new one can mount it — expect
roughly a minute where the site is down. Deploy outside service hours.

---

## Backups

Render snapshots disks daily on paid plans, but a snapshot is not an export.
To take a copy you can actually read:

```bash
# From the Render shell (Dashboard → Shell)
cp /data/mobile-dinners.db /tmp/backup.db
```

Then download it from the shell. Do this before any migration, and before the
first real order.

---

## When to move to Postgres

The disk is the ceiling. Move when any of these becomes true:

- **One instance is not enough.** A Render disk attaches to exactly one
  instance, so the app cannot scale horizontally as it stands.
- **A minute of downtime per deploy stops being acceptable.** That constraint
  disappears with a managed database.
- **You want point-in-time recovery.** Daily disk snapshots are coarse for
  something holding real payment records.

The schema in `src/lib/db.ts` was written against Postgres semantics
deliberately — the migration is mostly a driver swap plus row-level security
policies, not a redesign.

---

## Troubleshooting

**Health check fails, service won't come up.** Read the logs. The most likely
cause is `MD_DATA_DIR` not matching the disk `mountPath` — both must be `/data`.

**"Cannot find module node:sqlite".** The Node version is below 22. The
Dockerfile pins `node:24-slim`, so this only happens if Render was configured to
use its native Node runtime instead of Docker. `render.yaml` sets
`runtime: docker`.

**Orders can be placed but never charge.** `STRIPE_SECRET_KEY` is unset.
Checkout returns a clear 500 rather than silently accepting an order it cannot
charge for. Same for delivery without the DoorDash keys.

**Everything is empty after a deploy.** The service is on the free tier and the
disk is not persisting. Upgrade to `starter`.

**A restaurant cannot connect their POS.** `MD_TOKEN_KEY` changed. Every
previously sealed token is now unreadable and each restaurant has to reconnect.
Never rotate that value casually.
