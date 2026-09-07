import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, getRestaurantById } from "@/lib/orders";
import { getPaymentForOrder } from "@/lib/payments/store";
import { refundableAmount } from "@/lib/payments/refunds";
import { formatCents } from "@/lib/money";
import { Chip, Panel, Stat, TableWrap, Td, Th, timeAgo } from "@/components/admin/AdminUI";
import { RefundButton } from "@/components/admin/RefundButton";

export const dynamic = "force-dynamic";

const GOOD = new Set(["COMPLETED", "SETTLED"]);
const BAD = new Set(["CANCELLED", "FAILED"]);

/**
 * One order, in full — the page support opens when a diner complains.
 *
 * Everything needed to decide what happened and what to do about it: what was
 * ordered, what was charged, where the money went, the whole event log, and
 * the refund control. Splitting those across screens is how a support call
 * takes ten minutes instead of one.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = getOrder(orderId);
  if (!order) notFound();

  const org = getRestaurantById(order.orgId);
  const payment = getPaymentForOrder(orderId);
  const refundable = refundableAmount(orderId);

  return (
    <>
      <p className="text-[13px] text-ink-3">
        <Link href="/admin/orders" className="font-semibold hover:text-ink hover:underline">
          Orders
        </Link>{" "}
        / <span className="num">{orderId.slice(-8)}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="num text-[24px] font-extrabold tracking-[-0.03em]">
          {orderId.slice(-8)}
        </h1>
        <Chip tone={GOOD.has(order.state) ? "good" : BAD.has(order.state) ? "bad" : "plain"}>
          {order.state}
        </Chip>
        <Chip tone="plain">{order.fulfillment}</Chip>
        <Link
          href={`/track/${orderId}`}
          target="_blank"
          className="text-[13.5px] font-extrabold text-brand-strong hover:underline"
        >
          Diner's tracking view →
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Restaurant"
          value={org?.brandName ?? order.orgId}
          href={`/admin/merchants/${order.orgId}`}
        />
        <Stat label="Customer" value={order.guestName || "—"} sub={order.guestPhone || undefined} />
        <Stat label="Order total" value={formatCents(order.totalCents)} />
        <Stat
          label="Refunded"
          value={formatCents(refundable.refundedCents)}
          tone={refundable.refundedCents > 0 ? "warn" : "plain"}
          sub={
            refundable.refundedCents > 0
              ? `${formatCents(refundable.remainingCents)} still refundable`
              : undefined
          }
        />
      </div>

      {/* ---------------------------------------------------------- refund */}
      <Panel
        title="Refund"
        hint="Mobile Dinners absorbs refunds. The restaurant keeps its share."
      >
        <RefundButton
          orderId={orderId}
          chargeCents={refundable.chargeCents}
          refundedCents={refundable.refundedCents}
          remainingCents={refundable.remainingCents}
          disabledReason={refundable.refundable ? null : refundable.reason}
        />
      </Panel>

      {/* --------------------------------------------------------- payment */}
      <Panel title="Payment">
        {!payment ? (
          <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-5 text-[13.5px] text-ink-3">
            No card payment recorded. This order went through the sandbox processor, or
            predates payments being wired up.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Status"
              value={payment.status}
              tone={payment.status === "succeeded" ? "good" : "bad"}
            />
            <Stat label="Charged" value={formatCents(payment.chargeCents)} />
            <Stat
              label="To the restaurant"
              value={formatCents(payment.restaurantCents)}
              sub="not clawed back on a refund"
            />
            <Stat label="Platform share" value={formatCents(payment.platformCents)} />
          </div>
        )}
        {payment && (
          <p className="num mt-3 text-[12.5px] text-ink-3">intent {payment.intentId}</p>
        )}
      </Panel>

      {/* ------------------------------------------------------------ items */}
      <Panel title="What was ordered">
        <TableWrap>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th right>Qty</Th>
              <Th right>Unit</Th>
              <Th right>Line</Th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.lineNo}>
                <Td>
                  {l.name}
                  {l.optionsLabel && (
                    <span className="block text-[12px] text-ink-3">{l.optionsLabel}</span>
                  )}
                  {l.notes && (
                    <span className="block text-[12px] italic text-ink-3">“{l.notes}”</span>
                  )}
                </Td>
                <Td right mono>{l.qty}</Td>
                <Td right mono>{formatCents(l.unitPriceCents)}</Td>
                <Td right mono>{formatCents(l.unitPriceCents * l.qty)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <div className="mt-3 grid gap-2 text-[13.5px] sm:max-w-[320px]">
          <Line label="Subtotal" value={order.subtotalCents} />
          {order.discountCents > 0 && <Line label="Points" value={-order.discountCents} />}
          <Line label="Tax" value={order.taxCents} />
          {order.deliveryFeeCents > 0 && <Line label="Delivery" value={order.deliveryFeeCents} />}
          {order.tipCents > 0 && <Line label="Tip" value={order.tipCents} />}
          <div className="flex justify-between border-t border-line pt-2 font-extrabold">
            <span>Total</span>
            <span className="num">{formatCents(order.totalCents)}</span>
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ events */}
      <Panel title="Event log" hint="Append-only. The order's state is a fold over this.">
        <TableWrap>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Event</Th>
              <Th>Actor</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {order.events.map((e) => (
              <tr key={e.seq}>
                <Td mono>{e.seq}</Td>
                <Td mono>
                  <span
                    className={
                      e.eventType === "payment.refunded" ? "font-bold text-amber" : undefined
                    }
                  >
                    {e.eventType}
                  </span>
                </Td>
                <Td>{e.actor}</Td>
                <Td mono>{timeAgo(e.occurredAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{label}</span>
      <span className="num">{formatCents(value)}</span>
    </div>
  );
}
