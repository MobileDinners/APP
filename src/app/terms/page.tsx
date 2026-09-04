import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Terms of Service — Mobile Dinners",
  description:
    "The agreement between Mobile Dinners and the restaurants and diners who use it, including the zero-commission pledge.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 3, 2026"
      summary="These terms cover both sides of the network: restaurants who sell through Mobile Dinners, and diners who order through it. They are written to be read rather than survived. This build is a demonstration environment — see section 12."
      sections={[
        {
          id: "agreement",
          heading: "The agreement",
          body: (
            <>
              <p>
                These terms form a contract between Mobile Dinners, Inc.
                (&ldquo;we&rdquo;) and you. If you create a restaurant account, you are
                agreeing on behalf of that business and confirming you are authorised
                to do so. If you order food, you are agreeing as an individual.
              </p>
              <p>
                Creating an account, placing an order or accepting an order through
                the platform means you accept these terms. If you do not, do not use
                the service.
              </p>
            </>
          ),
        },
        {
          id: "commission",
          heading: "The zero-commission pledge",
          body: (
            <>
              <p>
                <strong>
                  We do not, and will not, charge a restaurant a percentage of any
                  order placed through Mobile Dinners.
                </strong>{" "}
                This applies to marketplace orders, direct storefront orders,
                in-person orders and delivery orders alike. It is a term of this
                agreement, not a promotional rate, and it is not conditional on plan,
                volume, tenure or placement.
              </p>
              <p>We are paid by:</p>
              <ul>
                <li>the monthly subscription for the plan you choose;</li>
                <li>
                  a disclosed spread on card processing, itemised separately from
                  interchange on every payout statement;
                </li>
                <li>
                  optional add-ons you actively purchase — extra SMS credits,
                  hardware, additional terminals, capital advances;
                </li>
                <li>
                  clearly labelled sponsored placement in the marketplace, capped at
                  one card in ten, which no restaurant is required to buy.
                </li>
              </ul>
              <p>
                Introducing any per-order percentage fee would be a material change
                requiring a new agreement you affirmatively accept. We cannot impose
                one by updating this page. If you decline, your existing terms run to
                the end of your paid period and you may export your data and leave.
              </p>
            </>
          ),
        },
        {
          id: "accounts",
          heading: "Accounts and roles",
          body: (
            <>
              <p>
                Restaurant accounts have three roles — owner, manager and shift lead —
                with different permissions. Only owners may publish a menu, connect a
                payment or POS account, or change billing. You are responsible for who
                you give access to and for keeping credentials secret.
              </p>
              <p>
                Diner accounts are identified by a verified phone number. You are
                responsible for activity on your account and for keeping your number
                current, since it is how we reach you about an order.
              </p>
              <p>
                We may suspend an account that is being used for fraud, that puts
                other users at risk, or that is materially in breach of these terms.
                Where the situation allows it, we will tell you first.
              </p>
            </>
          ),
        },
        {
          id: "menus",
          heading: "Menus, prices and what a guest agreed to pay",
          body: (
            <>
              <p>
                Restaurants set their own prices. A published menu is frozen into an
                immutable version, and every order records the version it was priced
                against. Changing a price does not alter an order already placed.
              </p>
              <p>
                Restaurants are responsible for the accuracy of their menu content,
                including item descriptions, prices, tax categories and allergen
                information. The platform will refuse to publish copy that makes
                allergen-safety or health claims, because those claims cannot be
                verified by software and are dangerous when wrong. That check is a
                safeguard, not a substitute for the restaurant&rsquo;s own legal
                obligations.
              </p>
            </>
          ),
        },
        {
          id: "orders",
          heading: "Orders, cancellation and refunds",
          body: (
            <>
              <p>
                An order is an agreement between the diner and the restaurant. We
                provide the software that carries it. A restaurant may decline an
                order before accepting it — because it is closed, out of an item, or
                cannot meet the promised time — and the diner is not charged.
              </p>
              <p>
                Once a restaurant has accepted an order and started cooking, it may no
                longer be cancelled by the diner as of right. Refunds for quality,
                accuracy or lateness are decided by the restaurant, from the same
                order timeline that shows what actually happened and when.
              </p>
              <p>
                Where the failure is ours — the platform lost the ticket, the display
                did not receive it, the tracking page showed a time the system knew
                was wrong — we refund the diner and do not charge it back to the
                restaurant.
              </p>
            </>
          ),
        },
        {
          id: "fees",
          heading: "Subscription fees and billing",
          body: (
            <>
              <p>
                Plans are billed per location. Annual billing is at the published
                price; monthly billing is 20% higher. Fees are charged in advance.
              </p>
              <p>
                You may cancel at any time. Annual plans are refunded pro rata for
                unused whole months; monthly plans run to the end of the current
                period. We do not charge a termination fee and we do not require
                notice.
              </p>
              <p>
                We may change subscription pricing with at least 60 days&rsquo; notice.
                A price change never takes effect during a paid annual term, and it
                never converts into a per-order fee — see section 2.
              </p>
            </>
          ),
        },
        {
          id: "payments",
          heading: "Payments and payouts",
          body: (
            <>
              <p>
                Card processing is 2.6% + 10¢ card-present and 2.9% + 30¢
                card-not-present. Interchange and scheme fees are shown separately
                from our spread on every statement so the figure can be checked.
              </p>
              <p>
                Payouts are made to the restaurant&rsquo;s nominated bank account on
                the next banking day. We may delay a payout where required by law, or
                where there is a live dispute or credible suspicion of fraud, and we
                will say which.
              </p>
              <p>
                Chargebacks are passed through to the restaurant with the evidence
                package we hold. We do not add a chargeback handling fee.
              </p>
            </>
          ),
        },
        {
          id: "marketplace",
          heading: "Marketplace listing and ranking",
          body: (
            <>
              <p>
                Listing on the marketplace is included in every plan at no additional
                cost. A restaurant appears once it has a published menu and is
                accepting orders, and can remove itself from the marketplace at any
                time while continuing to use every other part of the platform.
              </p>
              <p>
                Ranking is by relevance to the search, distance, and delivery times
                derived from live kitchen data. Paid placement, where it exists, is
                labelled as sponsored and is capped at one in every ten cards shown.
                We do not accept payment to demote a competitor and we do not rank by
                how much a restaurant spends with us elsewhere.
              </p>
            </>
          ),
        },
        {
          id: "data",
          heading: "Data ownership",
          body: (
            <>
              <p>
                Customer profiles, order history, menu versions, campaign results and
                analytics generated by a restaurant&rsquo;s activity belong to that
                restaurant. They are exportable as CSV at any time and over the API on
                Growth and above.
              </p>
              <p>
                We do not sell restaurant or diner data. We do not use one
                restaurant&rsquo;s customer list to market another restaurant. Where we
                publish aggregate benchmarks, they are aggregated across enough
                businesses that no individual restaurant can be identified from them.
              </p>
              <p>
                How we handle personal data is set out in the{" "}
                <Link href="/privacy">Privacy Policy</Link>, which forms part of these
                terms.
              </p>
            </>
          ),
        },
        {
          id: "acceptable",
          heading: "Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <ul>
                <li>list food you are not licensed or permitted to sell;</li>
                <li>
                  publish menu copy that is deceptive, or that makes allergen or
                  health claims you cannot substantiate;
                </li>
                <li>
                  use guest contact details obtained through the platform for
                  unrelated marketing, or sell them on;
                </li>
                <li>
                  attempt to access another tenant&rsquo;s data, probe for
                  vulnerabilities without authorisation, or scrape the marketplace;
                </li>
                <li>place orders you do not intend to pay for or collect.</li>
              </ul>
              <p>
                Security researchers acting in good faith should contact us before
                testing; we will not pursue action against research conducted within
                the scope we agree.
              </p>
            </>
          ),
        },
        {
          id: "liability",
          heading: "Warranties and liability",
          body: (
            <>
              <p>
                We provide the platform with reasonable skill and care, but not as a
                guarantee of uninterrupted service. Restaurants are responsible for
                the food they prepare, its safety and its accuracy of description; we
                are not the seller of any meal.
              </p>
              <p>
                To the extent permitted by law, our aggregate liability to a
                restaurant in any twelve-month period is limited to the subscription
                fees that restaurant paid us in that period. Nothing here limits
                liability for death or personal injury caused by negligence, for
                fraud, or for anything else that cannot lawfully be limited.
              </p>
            </>
          ),
        },
        {
          id: "demo",
          heading: "This demonstration build",
          body: (
            <>
              <p>
                <strong>
                  The instance you are reading this on is a demonstration
                  environment.
                </strong>{" "}
                Restaurants, menus, customers, orders, campaign results and analytics
                shown here are generated fixtures. No real money moves: card payments
                are not yet implemented, and orders settle without being charged.
              </p>
              <p>
                Do not enter real card details, real customer data or anything you
                would not want visible to anyone else exploring the build. Accounts
                created here may be reset without notice.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          heading: "Changes and contact",
          body: (
            <>
              <p>
                We may update these terms. For material changes we will give at least
                30 days&rsquo; notice by email and in the dashboard. Continuing to use
                the platform after that is acceptance; a change that introduces a
                per-order fee requires affirmative acceptance instead, per section 2.
              </p>
              <p>
                Questions about these terms:{" "}
                <Link href="/partners/support#contact">contact support</Link>, or write to
                Mobile Dinners, Inc., San Francisco, California.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
