#!/usr/bin/env bash
# Menu draft/publish/versioning checks against the running dev server.
B=${MD_TEST_BASE:-http://localhost:3100}
OWNER=/tmp/md_owner; LEAD=/tmp/md_lead2; CUST=/tmp/md_cust
rm -f $OWNER $LEAD $CUST

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_() { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. menu editor requires staff ==="
chk "/ops/menu anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$B/ops/menu")" "307"
chk "/ops/menu as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 40 "$B/ops/menu")" "200"

echo
echo "=== 2. role enforcement on editing ==="
chk "shift lead CANNOT edit an item" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X PATCH "$B/api/menu/items/it_pastor" \
     -H 'Content-Type: application/json' -d '{"priceCents":700}')" "403"
chk "shift lead CANNOT publish" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/menu/publish")" "403"

echo
echo "=== 3. validation ==="
chk "negative price rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X PATCH "$B/api/menu/items/it_pastor" \
     -H 'Content-Type: application/json' -d '{"priceCents":-500}')" "400"
chk "empty name rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X PATCH "$B/api/menu/items/it_pastor" \
     -H 'Content-Type: application/json' -d '{"name":"   "}')" "400"
chk "cross-tenant item rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X PATCH "$B/api/menu/items/it_porkbao" \
     -H 'Content-Type: application/json' -d '{"priceCents":700}')" "404"

echo
echo "=== 4. republishing an unchanged menu is refused ==="
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/publish"
chk "no-op publish returns 409" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/menu/publish")" "409"

echo
echo "=== 5. customer places an order at the current price ==="
CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d '{"phone":"4155550188"}' | jq_ "d.devCode")
curl -s -o /dev/null -c $CUST -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"4155550188\",\"code\":\"$CODE\"}"

ORD=$(curl -s -b $CUST -X POST "$B/api/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: menu-test-$RANDOM" \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_pastor","qty":1,"choiceIds":[],"notes":""}]}')
OID=$(echo "$ORD" | jq_ "d.order.orderId")
V_AT_ORDER=$(echo "$ORD" | jq_ "d.order.menuVersionId")
PAID=$(echo "$ORD" | jq_ "d.order.subtotalCents")
echo "  order ${OID:0:6} · subtotal ${PAID}c · menu ${V_AT_ORDER:0:8}"
if [ "$V_AT_ORDER" != "null" ] && [ "$V_AT_ORDER" != "ERR" ]; then
  pass "order pinned to a menu version"
else
  fail "order pinned to a menu version" "$V_AT_ORDER"
fi

echo
echo "=== 6. raise the price and publish a new version ==="
chk "owner CAN edit price" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X PATCH "$B/api/menu/items/it_pastor" \
     -H 'Content-Type: application/json' -d '{"priceCents":725}')" "200"

NEWV=$(curl -s -b $OWNER -X POST "$B/api/menu/publish" | jq_ "d.version.versionNo")
echo "  published v$NEWV"

echo
echo "=== 7. the placed order is untouched by the price change ==="
STILL=$(curl -s -b $CUST "$B/api/orders/$OID" | jq_ "d.order.subtotalCents")
V_NOW=$(curl -s -b $CUST "$B/api/orders/$OID" | jq_ "d.order.menuVersionId")
chk "order subtotal unchanged after reprice" "$STILL" "$PAID"
chk "order still references its original menu version" "$V_NOW" "$V_AT_ORDER"

NEXT=$(curl -s -b $CUST -X POST "$B/api/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: menu-test-b-$RANDOM" \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_pastor","qty":1,"choiceIds":[],"notes":""}]}')
NEXT_PAID=$(echo "$NEXT" | jq_ "d.order.subtotalCents")
NEXT_V=$(echo "$NEXT" | jq_ "d.order.menuVersionId")
chk "a NEW order pays the new price" "$NEXT_PAID" "725"
if [ "$NEXT_V" != "$V_AT_ORDER" ]; then
  pass "new order pinned to the newer menu version"
else
  fail "new order pinned to the newer menu version" "same as before"
fi

# put it back so the demo data stays tidy
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_pastor" \
  -H 'Content-Type: application/json' -d '{"priceCents":650}'
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/publish"
echo
echo "  (price restored to \$6.50 and republished)"
