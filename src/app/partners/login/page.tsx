import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Log in — Mobile Dinners",
  description:
    "Diners sign in with a phone number and a one-time code. Restaurant staff sign in with an email and password.",
};

const DOORS = [
  {
    href: "/signin",
    tag: "Diners",
    title: "Order food",
    blurb:
      "Phone number and a six-digit code. No password to remember, and your points wallet follows you across every restaurant on the network.",
    cta: "Sign in with a phone number",
    primary: true,
  },
  {
    href: "/staff/login",
    tag: "Restaurants",
    title: "Run a restaurant",
    blurb:
      "Email and password. Owners, managers and shift leads each see a different set of controls — the operator dashboard, the menu, and the kitchen display.",
    cta: "Staff sign in",
    primary: false,
  },
];

/** Seeded demo accounts. Only ever created when the demo seed is enabled. */
const DEMO = [
  { role: "Owner", email: "owner@sunrise-taqueria.test", can: "Everything, including publishing the menu" },
  { role: "Manager", email: "manager@sunrise-taqueria.test", can: "Menu edits, campaigns, customers" },
  { role: "Shift lead", email: "lead@sunrise-taqueria.test", can: "Advance orders on the line only" },
];

export default function LoginPage() {
  return (
    <Wrap className="py-14 md:py-20">
      <div className="mx-auto max-w-[860px]">
        <div className="text-center">
          <Eyebrow>Log in</Eyebrow>
          <h1 className="mt-3 text-balance text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] md:text-[48px]">
            Which side of the counter?
          </h1>
          <p className="mx-auto mt-4 max-w-[52ch] text-[16.5px] leading-relaxed text-ink-2">
            Diners and staff authenticate differently, because they need different
            things — one is on a phone in a hallway, the other is on a terminal in a
            kitchen.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {DOORS.map((d) => (
            <div
              key={d.href}
              className={`flex flex-col rounded-[20px] border bg-card p-7 ${
                d.primary ? "border-brand ring-1 ring-brand" : "border-line"
              }`}
            >
              <span
                className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${
                  d.primary ? "text-brand-strong" : "text-ink-3"
                }`}
              >
                {d.tag}
              </span>
              <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.025em]">
                {d.title}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{d.blurb}</p>
              <div className="min-h-6 flex-1" />
              <Link
                href={d.href}
                className={`w-full ${d.primary ? "btn btn-primary" : "btn btn-secondary"}`}
              >
                {d.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-[18px] border border-line bg-bg-2 p-6">
          <h2 className="text-[16px] font-extrabold">Demo accounts</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
            This build ships with a seeded restaurant so the operator and kitchen
            surfaces are explorable without signing anything up. All three use the
            password{" "}
            <code className="num rounded bg-card-2 px-1.5 py-0.5 font-bold">dinner1234</code>.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line-2">
                  <th className="pb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Role
                  </th>
                  <th className="pb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Email
                  </th>
                  <th className="pb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Can do
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEMO.map((d) => (
                  <tr key={d.email} className="border-b border-line last:border-0">
                    <td className="py-2.5 text-[14px] font-bold">{d.role}</td>
                    <td className="num py-2.5 pr-4 text-[13.5px] text-ink-2">{d.email}</td>
                    <td className="py-2.5 text-[13.5px] text-ink-2">{d.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
            Diner sign-in on this build shows the one-time code on screen instead of
            sending an SMS, because no SMS provider is connected. In production the
            code is only ever delivered by text.
          </p>
        </div>

        <p className="mt-8 text-center text-[14.5px] text-ink-3">
          No restaurant account yet?{" "}
          <Link href="/partners/signup" className="font-bold text-brand-strong">
            Start free
          </Link>
        </p>
      </div>
    </Wrap>
  );
}
