import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/SignupForm";
import { Eyebrow, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Start free — Mobile Dinners",
  description:
    "Create a restaurant account, add your menu and publish. No card required, no contract, 0% commission on every order.",
};

const STEPS = [
  {
    n: "01",
    h: "Create the account",
    p: "Name, cuisine, address. Takes a minute and creates a real restaurant with an owner login.",
  },
  {
    n: "02",
    h: "Add your menu",
    p: "Sections, items, prices, food costs and prep times. Your draft starts with three placeholders to replace.",
  },
  {
    n: "03",
    h: "Publish",
    p: "Publishing freezes your prices into a version and puts you on the marketplace, your own storefront and the kitchen display at once.",
  },
];

export default function SignupPage() {
  return (
    <Wrap className="py-12 md:py-16">
      <div className="grid gap-10 md:grid-cols-[1fr_460px] md:gap-16">
        <div>
          <Eyebrow>Restaurant signup</Eyebrow>
          <h1 className="mt-3 max-w-[16ch] text-balance text-[38px] font-extrabold leading-[1.04] tracking-[-0.04em] md:text-[52px]">
            Take your first order today
          </h1>
          <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-ink-2">
            This creates a real restaurant on this system — your own operator
            dashboard, menu of record, kitchen display and marketplace listing. No
            card, no sales call, nothing charged today.
          </p>

          <ol className="m-0 mt-9 grid list-none gap-6 p-0">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="num shrink-0 text-[13px] font-extrabold tracking-[0.08em] text-brand-strong">
                  {s.n}
                </span>
                <span>
                  <span className="block text-[16.5px] font-extrabold">{s.h}</span>
                  <span className="mt-1 block max-w-[48ch] text-[14.5px] leading-relaxed text-ink-2">
                    {s.p}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-9 rounded-[16px] border border-line bg-bg-2 p-5">
            <p className="text-[14px] font-extrabold">Already using Square or Clover?</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
              Keep them. Coexist mode imports your catalog and pushes Mobile Dinners
              orders into your existing till, so nothing about closing out changes.
              Connect it from the dashboard once you are in.
            </p>
            <Link
              href="/partners/features#pos"
              className="mt-3 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
            >
              How coexist mode works →
            </Link>
          </div>

          <p className="mt-8 text-[14px] text-ink-3">
            Already have an account?{" "}
            <Link href="/staff/login" className="font-bold text-brand-strong">
              Sign in
            </Link>
          </p>
        </div>

        <div className="md:sticky md:top-24 md:self-start">
          <SignupForm />
        </div>
      </div>
    </Wrap>
  );
}
