import Link from "next/link";
import type { Metric } from "@/lib/admin";

/**
 * Shared furniture for the internal admin dashboard.
 *
 * The one idea worth stating: `Stat` refuses to render a number it cannot
 * stand behind. Several integrations have never run, so their tables are empty
 * — and an empty table is not a zero. "0 deliveries, 100% success" would be a
 * confident lie about an integration that has never been switched on, so a
 * Metric that is unavailable renders as an explanation instead of a figure.
 */

export function Stat({
  label,
  value,
  sub,
  tone = "plain",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-green"
      : tone === "warn"
        ? "text-amber"
        : tone === "bad"
          ? "text-red"
          : "text-ink";

  const body = (
    <>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-3">{label}</p>
      <p className={`num mt-1.5 text-[26px] font-extrabold leading-none tracking-[-0.03em] ${toneClass}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{sub}</p>}
    </>
  );

  const className =
    "rounded-[12px] border border-line bg-card p-4" +
    (href ? " transition-colors hover:border-line-2 hover:bg-card-2" : "");

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A stat whose data may not exist yet. Says why instead of showing a zero. */
export function MetricStat<T>({
  label,
  metric,
  render,
  tone,
}: {
  label: string;
  metric: Metric<T>;
  render: (value: T) => { value: string; sub?: string; tone?: "plain" | "good" | "warn" | "bad" };
  tone?: "plain" | "good" | "warn" | "bad";
}) {
  if (!metric.available) {
    return (
      <div className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-3">{label}</p>
        <p className="num mt-1.5 text-[15px] font-extrabold leading-none text-ink-3">No data</p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{metric.reason}</p>
      </div>
    );
  }
  const r = render(metric.value);
  return <Stat label={label} value={r.value} sub={r.sub} tone={r.tone ?? tone} />;
}

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontally scrollable so a wide table never makes the page scroll. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line bg-card">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-3 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  mono,
}: {
  children?: React.ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`border-b border-line px-3 py-2.5 align-middle ${right ? "text-right" : ""} ${
        mono ? "num" : ""
      }`}
    >
      {children}
    </td>
  );
}

/**
 * A status chip. `tone` is chosen by the caller rather than guessed from the
 * text, because "failed" is red on a payment and unremarkable on a webhook
 * replay, and the component has no way to tell those apart.
 */
export function Chip({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "good" | "warn" | "bad" | "info";
}) {
  const map = {
    plain: "border-line-2 bg-card-2 text-ink-2",
    good: "border-green bg-green-soft text-green",
    warn: "border-amber bg-amber-soft text-amber",
    bad: "border-red bg-red-soft text-red",
    info: "border-blue bg-blue-soft text-blue",
  } as const;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
        {children}
      </td>
    </tr>
  );
}

/**
 * A bar chart, drawn with divs.
 *
 * No charting library: this is a dozen bars on an internal page, and pulling in
 * a runtime dependency to draw them would cost more than it returns.
 */
export function BarChart({
  data,
  format,
}: {
  data: { label: string; value: number; tone?: "brand" | "bad" }[];
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line bg-card p-4">
      <div className="flex min-w-[520px] items-end gap-2" style={{ height: 150 }}>
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="num text-[10.5px] font-bold text-ink-3">{format(d.value)}</span>
            <div
              className={`w-full rounded-t-[4px] ${d.tone === "bad" ? "bg-red" : "bg-brand"}`}
              style={{ height: `${Math.max(2, (d.value / max) * 105)}px` }}
              title={`${d.label}: ${format(d.value)}`}
            />
            <span className="num text-[10.5px] text-ink-3">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}
