import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listMerchants } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { POINTS_PER_DOLLAR, CENTS_PER_POINT } from "@/lib/money";
import { Chip, Panel, Stat, TableWrap, Td, Th } from "@/components/admin/AdminUI";
import { VisibilityToggle } from "@/components/admin/VisibilityToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Marketplace" };

/**
 * Loyalty tiers, as the customer-facing rewards page defines them.
 *
 * Read from a const rather than a table because that is where they actually
 * live — duplicating them into the database would create two sources of truth
 * and let this screen drift out of agreement with the page diners see. Making
 * them editable is a real change, not a display change; it is called out below
 * rather than faked with an input that saves nowhere.
 */
const TIERS = [
  { name: "bronze", orders: 0, perk: "1× points" },
  { name: "silver", orders: 12, perk: "1.25× points" },
  { name: "gold", orders: 24, perk: "1.5× points + early access to new items" },
  { name: "platinum", orders: 48, perk: "2× points + priority prep" },
];

export default function MarketplacePage() {
  const merchants = listMerchants();
  const featured = merchants.filter((m) => m.isSponsored);
  const hidden = merchants.filter((m) => !m.acceptingOrders);

  const cuisines = new Map<string, number>();
  for (const m of merchants) cuisines.set(m.cuisine, (cuisines.get(m.cuisine) ?? 0) + 1);

  const promos = getDb()
    .prepare("SELECT org_id, brand_name, promo FROM orgs WHERE promo IS NOT NULL AND promo != ''")
    .all() as unknown as { org_id: string; brand_name: string; promo: string }[];

  const tierCounts = getDb()
    .prepare("SELECT tier, COUNT(*) AS n FROM wallet GROUP BY tier")
    .all() as unknown as { tier: string; n: number }[];
  const byTier = new Map(tierCounts.map((t) => [t.tier, t.n]));

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Marketplace</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        What diners see: who is featured, what is promoted, and how points work.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listed" value={String(merchants.length - hidden.length)} tone="good" />
        <Stat
          label="Hidden"
          value={String(hidden.length)}
          tone={hidden.length ? "warn" : "plain"}
        />
        <Stat label="Featured" value={String(featured.length)} />
        <Stat label="Cuisines" value={String(cuisines.size)} />
      </div>

      <Panel
        title="Featured restaurants"
        hint="Featured restaurants are marked sponsored and surface first in the feed."
      >
        {featured.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-5 text-[13.5px] text-ink-3">
            Nothing is featured. Feature a restaurant from its own page.
          </p>
        ) : (
          <div className="grid gap-2">
            {featured.map((m) => (
              <div
                key={m.orgId}
                className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3"
              >
                <Link
                  href={`/admin/merchants/${m.orgId}`}
                  className="text-[14.5px] font-extrabold hover:text-brand-strong hover:underline"
                >
                  {m.brandName}
                </Link>
                <Chip tone="info">featured</Chip>
                <span className="text-[13px] text-ink-3">
                  {m.cuisine} · {m.orders.toLocaleString()} orders ·{" "}
                  {formatCents(m.gmvCents)} GMV
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Visibility" hint="Every restaurant, and whether diners can order from it.">
        <div className="grid gap-3">
          {merchants.map((m) => (
            <div key={m.orgId} className="rounded-[12px] border border-line bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/merchants/${m.orgId}`}
                  className="text-[14.5px] font-extrabold hover:text-brand-strong hover:underline"
                >
                  {m.brandName}
                </Link>
                <span className="text-[12.5px] text-ink-3">{m.cuisine}</span>
              </div>
              <VisibilityToggle
                orgId={m.orgId}
                brandName={m.brandName}
                accepting={m.acceptingOrders}
                sponsored={m.isSponsored}
              />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Categories" hint="Derived from each restaurant's cuisine.">
          <TableWrap>
            <thead>
              <tr>
                <Th>Cuisine</Th>
                <Th right>Restaurants</Th>
              </tr>
            </thead>
            <tbody>
              {[...cuisines.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([c, n]) => (
                  <tr key={c}>
                    <Td>{c}</Td>
                    <Td right mono>{n}</Td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            The category tiles on the marketplace feed are a separate, hardcoded list. They
            are browse shortcuts rather than a taxonomy, and they do not have to match this
            table.
          </p>
        </Panel>

        <Panel title="Promotions" hint="The promo badge shown on a restaurant's card.">
          <TableWrap>
            <thead>
              <tr>
                <Th>Restaurant</Th>
                <Th>Promotion</Th>
              </tr>
            </thead>
            <tbody>
              {promos.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                    No promotions are running.
                  </td>
                </tr>
              ) : (
                promos.map((p) => (
                  <tr key={p.org_id}>
                    <Td>
                      <Link
                        href={`/admin/merchants/${p.org_id}`}
                        className="hover:text-brand-strong hover:underline"
                      >
                        {p.brand_name}
                      </Link>
                    </Td>
                    <Td>
                      <Chip tone="info">{p.promo}</Chip>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableWrap>
        </Panel>
      </div>

      <Panel title="Loyalty rules" hint="One wallet, spendable at every restaurant on the network.">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Earn rate" value={`${POINTS_PER_DOLLAR} pts / $1`} sub="on eligible subtotal" />
          <Stat
            label="Redemption"
            value={`${100 / CENTS_PER_POINT} pts = $1`}
            sub="funded by the platform, not the restaurant"
          />
          <Stat label="Tiers" value={String(TIERS.length)} />
        </div>
        <TableWrap>
          <thead>
            <tr>
              <Th>Tier</Th>
              <Th right>Orders to reach</Th>
              <Th>Perk</Th>
              <Th right>Customers</Th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.name}>
                <Td>
                  <Chip tone={t.name === "gold" || t.name === "platinum" ? "info" : "plain"}>
                    {t.name}
                  </Chip>
                </Td>
                <Td right mono>{t.orders}</Td>
                <Td>{t.perk}</Td>
                <Td right mono>{(byTier.get(t.name) ?? 0).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          These thresholds are defined in code and shown here read-only on purpose. Editing
          them re-tiers thousands of existing wallets and changes what the rewards page
          promises people who have already earned, which needs a migration and a decision
          about grandfathering, not a text box on an admin screen.
        </p>
      </Panel>
    </>
  );
}
