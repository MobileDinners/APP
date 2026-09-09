import Link from "next/link";
import { formatCents } from "@/lib/money";
import { engagementSummary, listCustomers } from "@/lib/admin";
import { Chip, Panel, Stat, TableWrap, Td, Th, shortDate } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Customers" };

const PAGE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows, total } = listCustomers({ q, limit: PAGE, offset: (page - 1) * PAGE });
  const eng = engagementSummary();
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const href = (p: number) =>
    `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Customers</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        One account per diner, with a points wallet that works at every restaurant.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={total.toLocaleString()} sub={q ? `matching “${q}”` : undefined} />
        <Stat label="SMS opt-in" value={eng.smsOptIn.toLocaleString()} />
        <Stat label="Email opt-in" value={eng.emailOptIn.toLocaleString()} />
        <Stat
          label="Opted out"
          value={eng.optedOut.toLocaleString()}
          tone={eng.optedOut > 0 ? "warn" : "plain"}
          sub="must not be messaged"
        />
      </div>

      <Panel
        title="All customers"
        hint="Newest first. Search matches name, phone or email."
        action={
          <form action="/admin/customers" className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search customers"
              aria-label="Search customers"
              className="rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-[8px] bg-ink px-4 py-2 text-[13.5px] font-bold text-bg"
            >
              Search
            </button>
          </form>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Joined</Th>
              <Th right>Orders</Th>
              <Th right>Lifetime spend</Th>
              <Th>Tier</Th>
              <Th right>Points</Th>
              <Th>Last order</Th>
              <Th>Marketing</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No customers match that search.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.personId} className="hover:bg-card-2">
                  <Td>
                    <Link
                      href={`/admin/customers/${c.personId}`}
                      className="font-bold hover:text-brand-strong hover:underline"
                    >
                      {c.displayName || "—"}
                    </Link>
                    <span className="num block text-[12px] text-ink-3">{c.phone}</span>
                  </Td>
                  <Td mono>{shortDate(c.createdAt)}</Td>
                  <Td right mono>{c.orders.toLocaleString()}</Td>
                  <Td right mono>{formatCents(c.spendCents)}</Td>
                  <Td>
                    <Chip tone={c.tier === "platinum" || c.tier === "gold" ? "info" : "plain"}>
                      {c.tier}
                    </Chip>
                  </Td>
                  <Td right mono>{c.pointsBalance.toLocaleString()}</Td>
                  <Td mono>{shortDate(c.lastOrderAt)}</Td>
                  <Td>
                    {c.optedOutAt ? (
                      <Chip tone="bad">opted out</Chip>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {c.marketingSms && <Chip tone="good">sms</Chip>}
                        {c.marketingEmail && <Chip tone="good">email</Chip>}
                        {!c.marketingSms && !c.marketingEmail && (
                          <span className="text-ink-3">—</span>
                        )}
                      </span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-[13.5px]">
            {page > 1 && (
              <Link href={href(page - 1)} className="font-bold hover:text-brand-strong hover:underline">
                ← Previous
              </Link>
            )}
            <span className="num text-ink-3">
              Page {page} of {pages.toLocaleString()}
            </span>
            {page < pages && (
              <Link href={href(page + 1)} className="font-bold hover:text-brand-strong hover:underline">
                Next →
              </Link>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
