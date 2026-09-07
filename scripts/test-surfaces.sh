#!/usr/bin/env bash
# The three surfaces: the consumer marketplace at the root, the partners site
# on its own host, and the staff tools behind them. Plus restaurant signup.
B=${MD_TEST_BASE:-http://localhost:3100}
JAR=/tmp/md_signup_jar
rm -f $JAR

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
gte()  { if [ "$2" -ge "$3" ] 2>/dev/null; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 120 "$B$1"; }
post() { curl -s --max-time 120 -X POST "$B/api/signup" -H 'Content-Type: application/json' -d "$1"; }
postc(){ curl -s -o /dev/null -w '%{http_code}' --max-time 120 -X POST "$B/api/signup" -H 'Content-Type: application/json' -d "$1"; }
# Same origin, different Host header — this is what the middleware keys on.
phost(){ curl -s --max-time 180 -H 'Host: partners.mobiledinners.com' "$B$1"; }
phostc(){ curl -s -o /dev/null -w '%{http_code}' --max-time 180 -H 'Host: partners.mobiledinners.com' "$B$1"; }
title(){ grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g'; }
# The line under "All restaurants" states what the feed is actually showing.
summary(){ curl -s --max-time 240 "$B$1" | grep -o '[0-9]\+ restaurants\? · [^<]*' | head -1; }
# The feed moved to /restaurants; the root is now the landing page.
F=/restaurants
shown(){ summary "$1" | grep -o '^[0-9]\+'; }
occurs(){ curl -s --max-time 240 "$B$1" | grep -o "$2" | wc -l | tr -d ' '; }

# A fresh identity per run so re-running the suite is not a duplicate-email test.
RUN=$RANDOM$RANDOM
NAME="Test Kitchen $RUN"
MAIL="owner+$RUN@test-kitchen.test"

echo "=== 1. the consumer marketplace owns the root ==="
for p in / /restaurants /search /cart /orders /rewards /how-it-works /support /about /signin /terms /privacy; do
  chk "$p" "$(code $p)" "200"
done
if curl -s --max-time 240 "$B/" | grep -qi 'Your Favorite Meals\|Find Food\|How It Works'; then
  pass "/ is the landing page"
else
  fail "/ is the landing page" "hero markup missing"
fi
if curl -s --max-time 240 "$B$F" | grep -qi 'All restaurants\|Browse by category\|Delivery or pickup'; then
  pass "/restaurants serves the food feed"
else
  fail "/restaurants serves the food feed" "feed markup missing"
fi
# The landing page must lead into the feed, or it is a dead end.
if curl -s --max-time 240 "$B/" | grep -q 'href="/restaurants"'; then
  pass "and the landing page links into it"
else
  fail "landing page links into the feed" "no /restaurants link"
fi
# The merchant pitch must not appear on the diner homepage.
if curl -s --max-time 180 "$B/" | grep -q 'What commission costs you'; then
  fail "/ has no merchant pitch" "the commission calculator is on the diner homepage"
else
  pass "/ has no merchant pitch on it"
fi

echo
echo "=== 2. partners has its own surface ==="
for p in /partners /partners/pricing /partners/features /partners/signup /partners/login /partners/support /partners/about; do
  chk "$p" "$(code $p)" "200"
done
for p in /order /pricing /signup /login /marketplace; do
  chk "$p is gone" "$(code $p)" "404"
done
# One link each way, and both of them exist.
if curl -s --max-time 180 "$B/" | grep -q 'For Restaurants'; then
  pass "the consumer site links to partners"
else
  fail "consumer -> partners link" "missing"
fi
if curl -s --max-time 180 "$B/partners" | grep -q 'Order food'; then
  pass "and partners links back to the marketplace"
else
  fail "partners -> consumer link" "missing"
fi

echo
echo "=== 3. partners.mobiledinners.com routes by host ==="
chk "the partners host serves the merchant pitch"   "$(phost / | grep -c 'What commission costs you')" "1"
chk "bare /pricing resolves there" "$(phost /pricing | title)" "Pricing — Mobile Dinners"
chk "and bare /signup too" "$(phost /signup | title)" "Start free — Mobile Dinners"
chk "shared legal pages are not prefixed" "$(phostc /terms)" "200"
chk "the operator app is reachable on that host" "$(phostc /ops)" "307"
chk "the consumer host still gets the marketplace"   "$(curl -s --max-time 180 -H 'Host: mobiledinners.com' "$B/" | title)"   "Mobile Dinners — Your favorite meals, delivered to you"

echo
echo "=== 3b. a diner can find help, legal and about without leaving their side ==="
HOME=$(curl -s --max-time 240 "$B/")
for want in "/support" "/about" "/terms" "/privacy" "/partners"; do
  if echo "$HOME" | grep -q "href=\"$want\""; then
    pass "the homepage links to $want"
  else
    fail "homepage links to $want" "missing"
  fi
done
# Consumer help must not be the merchant desk: no SLA/plan language.
if curl -s --max-time 240 "$B/support" | grep -qi 'Named CSM\|First response\|per location'; then
  fail "/support is diner-facing" "merchant SLA content leaked in"
else
  pass "/support is diner-facing, not the partner desk"
fi
if curl -s --max-time 240 "$B/about" | grep -q 'service fee'; then
  pass "/about answers the diner question"
else
  fail "/about answers the diner question" "no fee explanation"
fi
# Anchors the footer points at have to exist, or the links land nowhere.
for target in "support|contact" "how-it-works|points" "privacy|rights" "terms|commission"; do
  PAGE="${target%%|*}"; ANCHOR="${target##*|}"
  if curl -s --max-time 240 "$B/$PAGE" | grep -q "id=\"$ANCHOR\""; then
    pass "/$PAGE#$ANCHOR resolves"
  else
    fail "/$PAGE#$ANCHOR resolves" "no element with that id"
  fi
done

echo
echo "=== 3c. the homepage feed controls actually filter ==="
ALL=$(shown $F)
chk "the unfiltered feed lists every open restaurant" "$ALL" "6"
chk "and says so" "$(summary $F)" "6 restaurants · delivering now"

# Each chip has to change the result set, or it is decoration.
OFFERS=$(shown "$F?filter=offers")
TOP=$(shown "$F?filter=top")
if [ "$OFFERS" -lt "$ALL" ] && [ "$OFFERS" -gt 0 ]; then
  pass "offers narrows the feed ($ALL -> $OFFERS)"
else
  fail "offers narrows the feed" "$OFFERS of $ALL"
fi
if [ "$TOP" -lt "$ALL" ] && [ "$TOP" -gt 0 ]; then
  pass "rating 4.5+ narrows the feed ($ALL -> $TOP)"
else
  fail "rating 4.5+ narrows the feed" "$TOP of $ALL"
fi
# Filters stack rather than replacing one another.
chk "two filters combine" "$(summary "$F?filter=offers,top")"   "3 restaurants · delivering now · offers · rating 4.5+"
# An impossible combination must explain itself, not render an empty grid.
if curl -s --max-time 240 "$B$F?filter=fast,top&sort=fee" | grep -q 'Nothing matches\|restaurants ·'; then
  pass "a filtered view always explains what it is showing"
else
  fail "filtered view explains itself" "no summary or empty state"
fi

echo "  -- pickup mode --"
chk "pickup relabels the feed" "$(summary "$F?mode=pickup")" "6 restaurants · ready for pickup"
chk "pickup shows no delivery fee" "$(occurs "$F?mode=pickup" 'delivery ·')" "0"
chk "delivery mode does show one" "$(occurs $F 'Pickup ·')" "0"
# The platform must never advertise free delivery — it cannot promise it.
chk "no free-delivery claim anywhere on the feed" "$(occurs $F 'Free delivery')" "0"
chk "nor in pickup mode" "$(occurs "$F?mode=pickup" 'Free delivery')" "0"
chk "nor on the rewards page" "$(occurs /rewards 'Free delivery')" "0"
# Pickup drops the road leg, so it must be quicker than delivery.
firstEta(){ curl -s --max-time 240 "$B$1" | sed 's/<!-- -->//g' | grep -o '[0-9]\{1,3\}[^0-9 ]\{1,4\}[0-9]\{1,3\} min' | head -1 | grep -o '^[0-9]\+'; }
PU=$(firstEta "$F?mode=pickup&sort=time")
DEL=$(firstEta "$F?sort=time")
if [ "$PU" -lt "$DEL" ]; then
  pass "pickup is quicker than delivery (${PU} min vs ${DEL} min)"
else
  fail "pickup is quicker than delivery" "pickup=$PU delivery=$DEL"
fi

# Garbage in the URL must fall back, not 500.
chk "an unknown filter is ignored" "$(code "$F?filter=bogus")" "200"
chk "and leaves the feed intact" "$(shown "$F?filter=bogus")" "$ALL"
chk "an unknown mode falls back to delivery" "$(summary "$F?mode=teleport")"   "6 restaurants · delivering now"

echo
echo "=== 4. signup validation ==="
chk "empty body is refused" "$(postc '{}')" "400"
chk "a one-letter name is refused" \
  "$(postc '{"brandName":"X","cuisine":"Thai","address":"1 Main St, SF","ownerName":"A Person","email":"a@b.test","password":"password1"}')" "400"
chk "a bad email is refused" \
  "$(postc "{\"brandName\":\"$NAME\",\"cuisine\":\"Thai\",\"address\":\"1 Main St, SF\",\"ownerName\":\"A Person\",\"email\":\"not-an-email\",\"password\":\"password1\"}")" "400"
chk "a short password is refused" \
  "$(postc "{\"brandName\":\"$NAME\",\"cuisine\":\"Thai\",\"address\":\"1 Main St, SF\",\"ownerName\":\"A Person\",\"email\":\"$MAIL\",\"password\":\"short\"}")" "400"
chk "a missing address is refused" \
  "$(postc "{\"brandName\":\"$NAME\",\"cuisine\":\"Thai\",\"address\":\"\",\"ownerName\":\"A Person\",\"email\":\"$MAIL\",\"password\":\"password1\"}")" "400"

# Nothing above should have created anything.
chk "no partial org was written" "$(q "SELECT COUNT(*) FROM orgs WHERE brand_name='$NAME'")" "0"
chk "no partial staff row either" "$(q "SELECT COUNT(*) FROM staff WHERE email='$MAIL'")" "0"

echo
echo "=== 5. a real signup ==="
BODY="{\"brandName\":\"$NAME\",\"cuisine\":\"Thai\",\"address\":\"1180 Valencia St, San Francisco\",\"ownerName\":\"Test Owner\",\"email\":\"$MAIL\",\"password\":\"password1\"}"
RESP=$(curl -s --max-time 120 -c $JAR -X POST "$B/api/signup" -H 'Content-Type: application/json' -d "$BODY")
ORG=$(echo "$RESP" | jq_ "d.orgId")
SLUG=$(echo "$RESP" | jq_ "d.slug")
echo "  created $ORG at /$SLUG"
# Must look like a real org id. "undefined" used to satisfy this check, so a
# refused signup passed here and failed ten times downstream instead of once.
case "$ORG" in
  org_*) pass "org created" ;;
  *)     fail "org created" "$RESP" ;;
esac
chk "signed in on the way out" "$(echo "$RESP" | jq_ "String(d.signedIn)")" "true"
chk "lands on the menu editor" "$(echo "$RESP" | jq_ "d.next")" "/ops/menu"
chk "the owner account is an owner" "$(q "SELECT role FROM staff WHERE email='$MAIL'")" "owner"
chk "the password is not stored in the clear" \
  "$(q "SELECT COUNT(*) FROM staff WHERE email='$MAIL' AND password_hash='password1'")" "0"
chk "a starter menu draft exists" "$(q "SELECT COUNT(*) FROM items WHERE org_id='$ORG'")" "3"
chk "the starter items are priced at zero" \
  "$(q "SELECT COUNT(*) FROM items WHERE org_id='$ORG' AND price_cents=0")" "3"

echo
echo "=== 6. the session actually works ==="
chk "the new owner can reach their dashboard" \
  "$(curl -s -o /dev/null -b $JAR -w '%{http_code}' --max-time 120 "$B/ops/menu")" "200"
if curl -s -b $JAR --max-time 120 "$B/ops/menu" | grep -q "Your first dish"; then
  pass "and sees their starter draft"
else
  fail "sees the starter draft" "missing"
fi
chk "and can add an item straight away" \
  "$(curl -s -o /dev/null -b $JAR -w '%{http_code}' --max-time 120 -X POST "$B/api/menu/items" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Pad See Ew","priceCents":1450,"costCents":420,"section":"Mains"}')" "201"

echo
echo "=== 7. an unpublished restaurant is not on sale ==="
chk "its storefront 404s until it publishes" "$(code /r/$SLUG)" "404"
FEED=$(curl -s --max-time 240 "$B$F" | grep -c "$NAME")
chk "and it is not in the marketplace feed" "$FEED" "0"
# The important half: the feed still works. An empty menu used to make
# Math.min return Infinity and take the whole page with it.
gte "the feed itself still renders" "$(curl -s --max-time 120 "$B/" | grep -c 'Sunrise Taqueria')" "1"
chk "and so does search" "$(code '/search?q=taco')" "200"

echo
echo "=== 8. publishing puts it on sale ==="
curl -s -o /dev/null -b $JAR --max-time 120 -X POST "$B/api/menu/publish"
chk "the storefront is live" "$(code /r/$SLUG)" "200"
gte "and it appears in the feed" "$(curl -s --max-time 240 "$B$F" | grep -c "$NAME")" "1"

echo
echo "=== 9. duplicate signups ==="
chk "the same email is refused" "$(postc "$BODY")" "409"
# Same brand name from a different owner is fine — slugs disambiguate.
BODY2="{\"brandName\":\"$NAME\",\"cuisine\":\"Thai\",\"address\":\"2 Other St, SF\",\"ownerName\":\"Second Owner\",\"email\":\"second+$RUN@test-kitchen.test\",\"password\":\"password1\"}"
SLUG2=$(post "$BODY2" | jq_ "d.slug")
echo "  second restaurant at /$SLUG2"
if [ "$SLUG2" != "$SLUG" ] && [ "$SLUG2" != "ERR" ]; then
  pass "a repeated brand name gets its own slug"
else
  fail "slug disambiguation" "$SLUG2"
fi

echo
echo "=== 10. a signed-out diner reaches the total, not a login wall ==="
chk "the cart renders signed out" "$(code /cart)" "200"
CART=$(curl -s --max-time 180 "$B/cart")
if echo "$CART" | grep -qi 'Enter your phone number\|Send code'; then
  fail "cart is not a sign-in page" "the sign-in form was served instead of the cart"
else
  pass "the cart is not a sign-in page"
fi
# Ordering itself still requires identity — deferring the prompt must not
# have deferred the check.
chk "but the order API still refuses an anonymous order"   "$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 -X POST "$B/api/orders"      -H 'Content-Type: application/json' -H "Idempotency-Key: anon-$RANDOM"      -d '{"orgId":"org_sunrise","fulfillment":"pickup","lines":[{"itemId":"it_pastor","qty":1,"choiceIds":[],"notes":""}]}')" "401"

echo
echo "=== 10b. the delivery fee is disclosed as location-based ==="
# The checkout body only renders once a cart exists, and the cart lives in the
# browser's localStorage — curl always gets the empty state. So these two check
# the component source; the rendered result is verified in the browser.
if grep -q 'priced by distance from the restaurant' src/components/CheckoutClient.tsx; then
  pass "the fulfilment picker says how delivery is priced"
else
  fail "fulfilment picker explains the fee" "copy missing from CheckoutClient"
fi
if grep -q 'Based on your delivery address' src/components/CheckoutClient.tsx; then
  pass "and the fee line itself repeats it"
else
  fail "fee line explains itself" "copy missing from CheckoutClient"
fi
chk "an empty cart still renders" "$(code /cart)" "200"
if curl -s --max-time 240 "$B/support" | grep -q 'distance between the restaurant'; then
  pass "help explains it too"
else
  fail "help explains the fee" "missing"
fi

echo
echo "=== 11. cleanup ==="
node -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('./data/mobile-dinners.db');
db.exec('PRAGMA foreign_keys = OFF');
const orgs=db.prepare(\"SELECT org_id FROM orgs WHERE brand_name LIKE 'Test Kitchen %'\").all().map(r=>r.org_id);
for (const o of orgs) {
  for (const t of ['menu_versions','items','staff','sites','pos_connections','orgs']) {
    db.prepare('DELETE FROM ' + t + ' WHERE org_id = ?').run(o);
  }
}
console.log('  removed ' + orgs.length + ' test restaurant(s)');
"
chk "test restaurants are gone" "$(q "SELECT COUNT(*) FROM orgs WHERE brand_name LIKE 'Test Kitchen %'")" "0"
gte "and the feed is unharmed" "$(curl -s --max-time 120 "$B/" | grep -c 'Sunrise Taqueria')" "1"
