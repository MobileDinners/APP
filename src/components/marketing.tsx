import Link from "next/link";

/**
 * Shared furniture for the mobiledinners.com pages. Server components — no
 * state, no effects — so every marketing page stays static-renderable.
 */

export function Wrap({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  /** Set when the section is a link target, so #anchors actually land. */
  id?: string;
}) {
  return (
    <div id={id} className={`mx-auto max-w-[1180px] px-5 md:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-brand-strong">
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[62ch] text-center" : "max-w-[62ch]"}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-2 text-balance text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[38px]">
        {title}
      </h2>
      {lede && (
        <p className="mt-3 text-[16.5px] leading-relaxed text-ink-2 md:text-[17.5px]">
          {lede}
        </p>
      )}
    </div>
  );
}

/** Page masthead. Every marketing page opens with one so they feel like a set. */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line bg-bg-2">
      <Wrap className="py-14 md:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 max-w-[18ch] text-balance text-[40px] font-extrabold leading-[1.03] tracking-[-0.04em] md:text-[60px]">
          {title}
        </h1>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-ink-2 md:text-[19px]">
          {lede}
        </p>
        {children && <div className="mt-7">{children}</div>}
      </Wrap>
    </section>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[18px] border border-line bg-card p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note?: string;
}) {
  return (
    <div>
      <p className="num text-[34px] font-extrabold leading-none tracking-[-0.03em] md:text-[42px]">
        {value}
      </p>
      <p className="mt-2 text-[14px] font-bold">{label}</p>
      {note && <p className="mt-1 text-[13px] leading-snug text-ink-3">{note}</p>}
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it) => (
        <details key={it.q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-bold [&::-webkit-details-marker]:hidden">
            {it.q}
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card-2 text-[15px] font-extrabold text-ink-2 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-ink-2">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Closing band. Same on every page so the ask never depends on scroll depth. */
export function CtaBand({
  title = "Stop paying for your own customers",
  lede = "Set up a menu, publish a site and take your first zero-commission order today. No contract, no per-order cut, cancel whenever.",
  primary = { href: "/partners/signup", label: "Start free" },
  secondary = { href: "/partners/pricing", label: "See pricing" },
}: {
  title?: string;
  lede?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="mt-20">
      <Wrap>
        <div className="rounded-[24px] bg-ink px-6 py-12 text-bg md:px-12 md:py-16">
          <h2 className="max-w-[20ch] text-balance text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] md:text-[42px]">
            {title}
          </h2>
          <p className="mt-4 max-w-[58ch] text-[16.5px] leading-relaxed opacity-75">{lede}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={primary.href}
              className="rounded-full bg-brand px-6 py-3.5 text-[15.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
            >
              {primary.label}
            </Link>
            <Link
              href={secondary.href}
              className="rounded-full border border-bg/25 px-6 py-3.5 text-[15.5px] font-extrabold text-bg transition-colors hover:bg-bg/10"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
      </Wrap>
    </section>
  );
}

/** Legal-document shell: terms and privacy share it so they read as a pair. */
export function LegalPage({
  title,
  updated,
  summary,
  sections,
}: {
  title: string;
  updated: string;
  summary: string;
  sections: { id: string; heading: string; body: React.ReactNode }[];
}) {
  return (
    <>
      <section className="border-b border-line bg-bg-2">
        <Wrap className="py-12 md:py-16">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="mt-3 text-[36px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[48px]">
            {title}
          </h1>
          <p className="num mt-3 text-[14px] font-semibold text-ink-3">
            Last updated {updated}
          </p>
          <p className="mt-4 max-w-[68ch] text-[16.5px] leading-relaxed text-ink-2">
            {summary}
          </p>
        </Wrap>
      </section>

      <Wrap className="py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-[220px_1fr] md:gap-14">
          <nav aria-label="Sections" className="md:sticky md:top-20 md:self-start">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-3">
              Contents
            </p>
            <ol className="m-0 mt-3 grid list-none gap-1.5 p-0">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex gap-2 text-[13.5px] font-semibold text-ink-2 hover:text-ink"
                  >
                    <span className="num text-ink-3">{i + 1}.</span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="mb-10 scroll-mt-24 last:mb-0">
                <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">
                  <span className="num mr-2 text-ink-3">{i + 1}.</span>
                  {s.heading}
                </h2>
                <div className="mt-3 grid gap-3 text-[15.5px] leading-relaxed text-ink-2 [&_a]:font-bold [&_a]:text-brand-strong [&_li]:mb-1.5 [&_strong]:font-bold [&_strong]:text-ink [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Wrap>
    </>
  );
}
