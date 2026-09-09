import Link from "next/link";
import { integrationStatus, listAllStaff } from "@/lib/admin";
import { storageIsDurable } from "@/lib/site-content";
import { Chip, Panel, Stat, TableWrap, Td, Th, shortDate } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin System" };

/** Where each webhook has to be pointed, so nobody has to grep for the path. */
const WEBHOOKS = [
  {
    label: "Stripe",
    path: "/api/payments/webhook",
    secret: "STRIPE_WEBHOOK_SECRET",
    events: "payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, account.updated",
  },
  {
    label: "DoorDash Drive",
    path: "/api/delivery/webhook",
    secret: "DOORDASH_WEBHOOK_SECRET",
    events: "delivery status updates",
  },
  {
    label: "Square / Clover OAuth return",
    path: "/api/pos/callback",
    secret: "—",
    events: "authorization code exchange",
  },
];

export default function SettingsPage() {
  const integrations = integrationStatus();
  const staff = listAllStaff();
  const admins = staff.filter((s) => s.isPlatformAdmin);
  const configured = integrations.filter((i) => i.configured).length;
  const publicUrl = process.env.MD_PUBLIC_URL ?? "";

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">System</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Integrations, webhooks and who can administer the platform.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Integrations configured"
          value={`${configured}/${integrations.length}`}
          tone={configured === integrations.length ? "good" : "warn"}
        />
        <Stat
          label="Platform admins"
          value={String(admins.length)}
          tone={admins.length === 0 ? "bad" : "good"}
          sub={admins.length === 0 ? "nobody can administer in production" : undefined}
        />
        <Stat label="Staff accounts" value={String(staff.length)} />
        <Stat
          label="Storage"
          value={storageIsDurable() ? "Persistent" : "Ephemeral"}
          tone={storageIsDurable() ? "good" : "bad"}
          sub={storageIsDurable() ? undefined : "data is lost on every restart"}
        />
      </div>

      {!storageIsDurable() && (
        <div className="mt-5 rounded-[12px] border border-red bg-red-soft p-4 text-[13.5px] leading-relaxed text-red">
          <strong className="font-extrabold">No persistent disk.</strong> MD_DATA_DIR is
          unset, so the database lives inside the container. Every deploy and every idle
          spin-down destroys it: restaurants, customers, orders, subscriptions, all of it.
          Nothing on this dashboard survives a restart until a disk is mounted and
          MD_DATA_DIR points at it.
        </div>
      )}

      {/* ------------------------------------------------------ API keys */}
      <Panel
        title="API keys and credentials"
        hint="Presence only. No value, prefix or fragment of a secret is ever rendered here."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Integration</Th>
              <Th>Environment variable</Th>
              <Th>State</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((i) => (
              <tr key={i.key}>
                <Td>{i.label}</Td>
                <Td mono>
                  <span className="text-[12.5px] text-ink-2">{i.key}</span>
                </Td>
                <Td>
                  {i.configured ? <Chip tone="good">set</Chip> : <Chip tone="warn">not set</Chip>}
                </Td>
                <Td>
                  <span
                    className={`text-[12.5px] ${
                      i.detail.startsWith("LIVE")
                        ? "font-extrabold text-red"
                        : i.detail.startsWith("EPHEMERAL") || i.detail.startsWith("not set:")
                          ? "font-bold text-amber"
                          : "text-ink-3"
                    }`}
                  >
                    {i.detail}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Secrets are set in the hosting environment, never in this interface, because a form that
          writes a live Stripe key into the application database would put it somewhere far
          weaker than where it is now, and would print it back to whoever opened this page.
        </p>
      </Panel>

      {/* ------------------------------------------------------ webhooks */}
      <Panel title="Webhook endpoints" hint="Where each provider must be pointed.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>Endpoint</Th>
              <Th>Signing secret</Th>
              <Th>Events</Th>
            </tr>
          </thead>
          <tbody>
            {WEBHOOKS.map((w) => (
              <tr key={w.path}>
                <Td>{w.label}</Td>
                <Td mono>
                  <span className="text-[12.5px]">
                    {publicUrl}
                    {w.path}
                  </span>
                </Td>
                <Td mono>
                  <span className="text-[12.5px] text-ink-2">{w.secret}</span>
                </Td>
                <Td>
                  <span className="text-[12.5px] text-ink-3">{w.events}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      {/* --------------------------------------------------------- admins */}
      <Panel
        title="Administrators"
        hint="Staff accounts whose email appears in MD_ADMIN_EMAILS may reach this application."
      >
        {admins.length === 0 ? (
          <div className="rounded-[12px] border border-red bg-red-soft p-4 text-[13.5px] leading-relaxed text-red">
            <strong className="font-extrabold">No administrators are configured.</strong> In
            production the allowlist fails closed, so nobody would be able to open this
            dashboard at all. Set MD_ADMIN_EMAILS to a comma-separated list of staff emails.
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Restaurant</Th>
                <Th>Role</Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.staffId}>
                  <Td>{a.name}</Td>
                  <Td mono>{a.email}</Td>
                  <Td>{a.brandName}</Td>
                  <Td>
                    <Chip tone="info">platform admin</Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Platform admin is granted by environment variable rather than by a database flag,
          on purpose: it means an attacker who reaches the database, or who compromises
          a restaurant owner&apos;s account, still cannot promote themselves. Changing it needs
          access to the hosting environment.
        </p>
      </Panel>

      <Panel title="All staff accounts" hint="Every signed-in user across every restaurant.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Restaurant</Th>
              <Th>Role</Th>
              <Th>Created</Th>
              <Th>State</Th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.staffId}>
                <Td>{s.name}</Td>
                <Td mono>
                  <span className="text-[12.5px]">{s.email}</span>
                </Td>
                <Td>{s.brandName}</Td>
                <Td>{s.role.replace("_", " ")}</Td>
                <Td mono>{shortDate(s.createdAt)}</Td>
                <Td>
                  {s.disabled ? (
                    <Chip tone="bad">disabled</Chip>
                  ) : s.isPlatformAdmin ? (
                    <Chip tone="info">admin</Chip>
                  ) : (
                    <Chip tone="good">active</Chip>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title="Site content" hint="The marketplace header and footer.">
        <div className="rounded-[12px] border border-line bg-card p-4">
          <Link
            href="/ops/content"
            className="text-[14px] font-extrabold text-brand-strong hover:underline"
          >
            Edit header and footer copy →
          </Link>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Navigation links, footer columns, tagline and the legal line.
          </p>
        </div>
      </Panel>
    </>
  );
}
