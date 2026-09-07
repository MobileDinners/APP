import { NextResponse } from "next/server";
import { getRestaurantById } from "@/lib/orders";
import { deliveryQuote } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * What delivery will cost, before the order exists.
 *
 * The checkout page has to show the fee it is actually going to charge. It
 * used to show the restaurant's flat rate next to a seeded random distance,
 * while the orders route quoted a real one — so the moment a geocoding key was
 * configured, checkout would display one number and charge another. That is
 * the kind of gap that produces a chargeback and an angry restaurant owner,
 * and it is worth an extra request to close.
 *
 * Deliberately unauthenticated: it reveals nothing but a public price for a
 * public restaurant, and requiring a session would mean a diner cannot see the
 * cost until after they have signed in — which is the wrong way round when
 * the whole point is to show the price before anyone commits.
 */
export async function POST(req: Request) {
  let body: { orgId?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const org = getRestaurantById(String(body.orgId ?? ""));
  if (!org) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  const address = String(body.address ?? "").trim();
  if (address.length < 4) {
    // No address yet is not an error — the page asks as soon as it loads, and
    // the flat rate is the honest answer until somebody types one.
    return NextResponse.json({
      feeCents: org.deliveryFeeCents,
      miles: null,
      estimated: true,
      outOfRange: false,
      reason: "Enter a delivery address for an exact fee",
    });
  }

  const quote = await deliveryQuote({
    restaurant: {
      lat: org.lat,
      lng: org.lng,
      address: org.address,
      deliveryFeeCents: org.deliveryFeeCents,
    },
    address,
  });

  return NextResponse.json(quote);
}
