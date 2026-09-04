import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Privacy Policy — Mobile Dinners",
  description:
    "What we collect, why, who sees it, and how a restaurant or a diner gets their data out. Written to be read.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 3, 2026"
      summary="Two kinds of people use Mobile Dinners, and their data is handled differently. Diners' personal data is used to deliver their food and their points. Restaurants' business data belongs to the restaurant. We do not sell either."
      sections={[
        {
          id: "summary",
          heading: "The short version",
          body: (
            <>
              <ul>
                <li>
                  <strong>We do not sell personal data.</strong> Not to advertisers,
                  not to data brokers, not to other restaurants.
                </li>
                <li>
                  <strong>The restaurant you order from gets your details.</strong>{" "}
                  Name, phone, order history and delivery address for that order. That
                  is the point of a direct relationship.
                </li>
                <li>
                  <strong>No other restaurant sees them.</strong> One
                  restaurant&rsquo;s customer list is never used to market another.
                </li>
                <li>
                  <strong>We never store card numbers.</strong> Payments are tokenised
                  by the processor; no card number reaches our database.
                </li>
                <li>
                  <strong>You can get it all out, or have it deleted.</strong> See
                  sections 6 and 7.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "collect",
          heading: "What we collect from diners",
          body: (
            <>
              <p>
                <strong>Because you gave it to us:</strong> your phone number
                (verified by one-time code), your name if you provide one, delivery
                addresses, delivery instructions, and any note you attach to an order.
              </p>
              <p>
                <strong>Because you placed an order:</strong> what you ordered, from
                where, when, the amount, the fulfilment method, tips, and points
                earned or redeemed.
              </p>
              <p>
                <strong>Automatically:</strong> device and browser type, IP address,
                approximate location derived from it, and the pages you visited. We
                use this for security, fraud prevention, debugging and aggregate
                product analytics.
              </p>
              <p>
                <strong>We do not collect:</strong> card numbers, precise background
                location, contacts, or data from other apps on your device.
              </p>
            </>
          ),
        },
        {
          id: "restaurants",
          heading: "What we collect from restaurants",
          body: (
            <>
              <p>
                Business details (name, address, cuisine, hours), menu content and
                pricing, staff accounts, order and payout history, campaign
                performance, and — where connected — data imported from a Square or
                Clover account you authorise.
              </p>
              <p>
                POS access tokens are encrypted at rest with AES-256-GCM. The
                dashboard only ever shows a fingerprint of a token, never the token
                itself, and revoking the connection deletes it.
              </p>
            </>
          ),
        },
        {
          id: "use",
          heading: "How we use it",
          body: (
            <>
              <ul>
                <li>To take, route, cook, deliver and track orders.</li>
                <li>To run the loyalty wallet and calculate points across restaurants.</li>
                <li>
                  To send transactional messages — order confirmations, ready
                  notifications, delivery updates. These are not marketing and cannot
                  be turned off while an order is live.
                </li>
                <li>
                  To send marketing messages from a restaurant you have ordered from,
                  where that restaurant has a lawful basis to contact you. Every one
                  carries an unsubscribe, and quiet hours and frequency caps are
                  enforced by the platform, not by the restaurant&rsquo;s good
                  intentions.
                </li>
                <li>
                  To generate recommendations and upsell suggestions from your own
                  order history.
                </li>
                <li>To detect and prevent fraud, abuse and payment disputes.</li>
                <li>
                  To produce aggregate analytics — never in a form that identifies an
                  individual diner to anyone but the restaurant they ordered from.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "sharing",
          heading: "Who else sees it",
          body: (
            <>
              <p>
                <strong>The restaurant you ordered from.</strong> Your name, phone,
                the order, and — for delivery — the address. They may contact you
                about that order and, subject to consent rules, market to you later.
              </p>
              <p>
                <strong>Your courier, for a live delivery.</strong> First name,
                delivery address and instructions, for the duration of that delivery
                only.
              </p>
              <p>
                <strong>Processors acting on our instructions:</strong> the payment
                processor, SMS and email providers, cloud hosting, and error
                monitoring. Each is contractually bound to use the data only to
                provide that service.
              </p>
              <p>
                <strong>Nobody else</strong> — except where we are legally required to
                disclose, or where it is necessary to investigate fraud or a threat to
                someone&rsquo;s safety. We do not sell data and we do not share it for
                cross-context behavioural advertising.
              </p>
            </>
          ),
        },
        {
          id: "data",
          heading: "Who owns what, and how to export it",
          body: (
            <>
              <p>
                <strong>Restaurants own their business data</strong> — customer
                profiles built from their own orders, order history, menu versions,
                campaign results and analytics. Export it as CSV from the dashboard at
                any time, or over the API on Growth and above. Nothing about leaving
                requires our permission or a phone call.
              </p>
              <p>
                <strong>Diners own their personal data.</strong> Request a copy of
                everything associated with your phone number, in a portable format,
                and we will provide it within 30 days.
              </p>
              <p>
                We are a processor for the personal data a restaurant holds about its
                own guests, and a controller for the platform accounts, the loyalty
                wallet and marketplace activity.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          heading: "Your rights",
          body: (
            <>
              <p>
                Depending on where you live, you have the right to access, correct,
                delete, restrict or object to processing of your personal data, to
                data portability, and to withdraw consent. California residents have
                the rights conferred by the CCPA/CPRA, including the right to know and
                the right to delete; we do not sell or share personal information as
                those terms are defined.
              </p>
              <p>
                Exercise any of these from your account, or through{" "}
                <Link href="/partners/support#contact">support</Link>. We will not degrade your
                service or charge you differently for exercising a right.
              </p>
              <p>
                Deleting your account removes your profile, addresses and points
                balance. Order records are retained where we are required to keep them
                for tax and accounting purposes, and are disassociated from your
                identity as far as that obligation allows.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          heading: "How long we keep it",
          body: (
            <>
              <ul>
                <li>
                  <strong>Order records:</strong> seven years, for tax and accounting.
                </li>
                <li>
                  <strong>Customer profiles:</strong> for as long as the account is
                  open, then 30 days after deletion.
                </li>
                <li>
                  <strong>One-time codes:</strong> ten minutes.
                </li>
                <li>
                  <strong>Session tokens:</strong> stored only as a hash, expiring on
                  sign-out or after the session lifetime.
                </li>
                <li>
                  <strong>Security and access logs:</strong> 90 days.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "security",
          heading: "Security",
          body: (
            <>
              <p>
                Passwords are hashed with scrypt and never stored in a reversible
                form. Session tokens are stored as SHA-256 hashes and compared in
                constant time. Third-party access tokens are sealed with AES-256-GCM.
                Every query is scoped to the tenant on the session — never to an
                identifier supplied in a URL — and asking for another
                restaurant&rsquo;s record returns the same answer as asking for one
                that does not exist.
              </p>
              <p>
                No system is perfect. If we discover a breach affecting your personal
                data, we will notify affected users and the relevant regulator within
                the periods the law requires, and we will say what we know rather than
                what sounds best.
              </p>
            </>
          ),
        },
        {
          id: "children",
          heading: "Children",
          body: (
            <p>
              Mobile Dinners is not directed at children under 13, and we do not
              knowingly collect their personal data. If you believe a child has given
              us personal data, contact us and we will delete it.
            </p>
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
                Its restaurants, customers, orders and analytics are generated
                fixtures. One-time codes are displayed on screen rather than texted,
                because no SMS provider is connected, and no payments are processed.
              </p>
              <p>
                Do not enter real personal data, real customer lists or real card
                details here. Anything created on this build may be reset without
                notice.
              </p>
            </>
          ),
        },
        {
          id: "contact",
          heading: "Changes and contact",
          body: (
            <>
              <p>
                We will post material changes here and give at least 30 days&rsquo;
                notice by email and in the dashboard before they take effect.
              </p>
              <p>
                Privacy questions, requests and complaints:{" "}
                <Link href="/partners/support#contact">contact support</Link>, or write to the
                privacy team at Mobile Dinners, Inc., San Francisco, California. You
                also have the right to complain to your local data protection
                authority.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
