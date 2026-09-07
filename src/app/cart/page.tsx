import { getWallet, listRestaurants } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { CheckoutClient } from "@/components/CheckoutClient";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await getSession();
  const person = session?.kind === "person" ? session : null;

  // Building a cart and seeing the total stays anonymous. Identity is collected
  // inside checkout, at the moment of paying, per spec section 5.2 — a login
  // wall in front of a price is the most expensive screen in the funnel.
  return (
    <CheckoutClient
      wallet={person ? getWallet(person.personId) : null}
      // includeHidden: a cart built before the restaurant went dark must still
      // render. createOrder gives the real refusal at checkout.
      restaurants={listRestaurants({ includeHidden: true })}
    />
  );
}
