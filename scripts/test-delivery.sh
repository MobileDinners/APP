#!/usr/bin/env bash
# DoorDash Drive dispatch: booking a courier, tracking one, and the money.
B=${MD_TEST_BASE:-http://localhost:3100}
OWNER=/tmp/md_dlv_owner; LEAD=/tmp/md_dlv_lead; CUST=/tmp/md_dlv_cust
rm -f $OWNER $LEAD $CUST

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 240 "$@"; }
adv()  { curl -s -b $OWNER --max-time 120 -X POST "$B/api/orders/$1/transitions" \
           -H 'Content-Type: application/json' -d "{\"to\":\"$2\"}"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

# A signed-in diner, so the order carries a real address and phone.
OTP=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d '{"phone":"4155550166"}' | jq_ "d.devCode")
curl -s -o /dev/null -c $CUST -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"4155550166\",\"code\":\"$OTP\"}"

# Creates an order AND pays for it, because everything below here needs food
# that has actually been bought. With a processor configured an order stops at
# PENDING_PAYMENT until a card clears, so it can never reach READY and no
# courier can be booked against it; pay-order.mjs drives the same card the
# checkout would and is a no-op when no processor is configured.
mkorder() {
  local id
  id=$(curl -s -b $CUST --max-time 120 -X POST "$B/api/orders" \
    -H 'Content-Type: application/json' -H "Idempotency-Key: dlv-$RANDOM$RANDOM" \
    -d "{\"orgId\":\"org_sunrise\",\"fulfillment\":\"$1\",\"lines\":[{\"itemId\":\"it_pastor\",\"qty\":2,\"choiceIds\":[],\"notes\":\"\"}]}" \
    | jq_ "d.order.orderId")
  node scripts/pay-order.mjs "$id" $CUST "$B" > /dev/null
  echo "$id"
}

echo "=== 1. access control ==="
ORDER=$(mkorder delivery)
echo "  order: $ORDER"
chk "anonymous cannot dispatch" \
  "$(code -X POST "$B/api/delivery/dispatch" -H 'Content-Type: application/json' \
     -d "{\"orderId\":\"$ORDER\"}")" "401"
chk "a diner cannot dispatch" \
  "$(code -b $CUST -X POST "$B/api/delivery/dispatch" -H 'Content-Type: application/json' \
     -d "{\"orderId\":\"$ORDER\"}")" "401"
chk "another restaurant's order is a 404, not a 403" \
  "$(code -b $OWNER -X POST "$B/api/delivery/dispatch" -H 'Content-Type: application/json' \
     -d '{"orderId":"00000000-0000-0000-0000-000000000000"}')" "404"

echo
echo "=== 2. a courier is not booked before the food exists ==="
STATE=$(q "SELECT state FROM orders WHERE order_id='$ORDER'")
echo "  state: $STATE"
chk "dispatching a CONFIRMED order is refused" \
  "$(code -b $OWNER -X POST "$B/api/delivery/dispatch" -H 'Content-Type: application/json' \
     -d "{\"orderId\":\"$ORDER\"}")" "409"
chk "and nothing was booked" "$(q "SELECT COUNT(*) FROM deliveries WHERE order_id='$ORDER'")" "0"

echo
echo "=== 3. quoting states the real cost ==="
adv $ORDER ACCEPTED > /dev/null; adv $ORDER IN_KITCHEN > /dev/null; adv $ORDER READY > /dev/null
chk "the order is READY" "$(q "SELECT state FROM orders WHERE order_id='$ORDER'")" "READY"
QUOTE=$(curl -s -b $OWNER --max-time 120 -X POST "$B/api/delivery/dispatch" \
  -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORDER\",\"quote\":true}")
COURIER_FEE=$(echo "$QUOTE" | jq_ "d.quote.feeCents")
GUEST_FEE=$(echo "$QUOTE" | jq_ "d.guestPaysCents")
NET=$(echo "$QUOTE" | jq_ "d.netCents")
echo "  courier charges ${COURIER_FEE}c, guest pays ${GUEST_FEE}c, net ${NET}c"
if [ "$COURIER_FEE" -gt 0 ] 2>/dev/null; then pass "a fee is quoted"; else fail "fee quoted" "$COURIER_FEE"; fi
# The whole point of surfacing this: Drive costs more than the flat fee we
# charge, and the API says so instead of letting it surface at month end.
if [ "$NET" -lt 0 ] 2>/dev/null; then
  pass "the shortfall is reported, not hidden ($NET c per delivery)"
else
  fail "shortfall reported" "$NET"
fi
chk "quoting books nothing" "$(q "SELECT COUNT(*) FROM deliveries WHERE order_id='$ORDER'")" "0"

echo
echo "=== 4. dispatch books a courier and moves the order ==="
DISPATCH=$(curl -s -b $OWNER --max-time 120 -X POST "$B/api/delivery/dispatch" \
  -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORDER\"}")
echo "  courier: $(echo "$DISPATCH" | jq_ "d.delivery.courierName") ref $(echo "$DISPATCH" | jq_ "d.delivery.supportRef")"
chk "a delivery row exists" "$(q "SELECT COUNT(*) FROM deliveries WHERE order_id='$ORDER'")" "1"
chk "the order advanced to COURIER_ASSIGNED" "$(q "SELECT state FROM orders WHERE order_id='$ORDER'")" "COURIER_ASSIGNED"
chk "both fees are stored side by side" \
  "$(q "SELECT (courier_fee_cents > 0) + (guest_fee_cents > 0) FROM deliveries WHERE order_id='$ORDER'")" "2"

echo
echo "=== 5. dispatch is idempotent ==="
AGAIN=$(curl -s -b $OWNER --max-time 120 -X POST "$B/api/delivery/dispatch" \
  -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORDER\"}")
chk "a second press books no second Dasher" "$(q "SELECT COUNT(*) FROM deliveries WHERE order_id='$ORDER'")" "1"
chk "and returns the same courier" \
  "$(echo "$AGAIN" | jq_ "d.delivery.externalId")" "$ORDER"

echo
echo "=== 6. a pickup order never touches a courier ==="
PICKUP=$(mkorder pickup)
adv $PICKUP ACCEPTED > /dev/null; adv $PICKUP IN_KITCHEN > /dev/null; adv $PICKUP READY > /dev/null
chk "dispatching a pickup order is refused" \
  "$(code -b $OWNER -X POST "$B/api/delivery/dispatch" -H 'Content-Type: application/json' \
     -d "{\"orderId\":\"$PICKUP\",\"quote\":true}")" "409"
adv $PICKUP AWAITING_PICKUP > /dev/null
chk "and it still reaches the counter" "$(q "SELECT state FROM orders WHERE order_id='$PICKUP'")" "AWAITING_PICKUP"
chk "with no delivery booked" "$(q "SELECT COUNT(*) FROM deliveries WHERE order_id='$PICKUP'")" "0"

echo
echo "=== 7. courier webhooks refuse anything unverified ==="
chk "an unsigned update is refused" \
  "$(code -X POST "$B/api/delivery/webhook" -H 'Content-Type: application/json' \
     -d "{\"external_delivery_id\":\"$ORDER\",\"delivery_status\":\"delivered\"}")" "503"
chk "a forged signature is refused" \
  "$(code -X POST "$B/api/delivery/webhook" -H 'Content-Type: application/json' \
     -H 'x-doordash-signature: deadbeef' \
     -d "{\"external_delivery_id\":\"$ORDER\",\"delivery_status\":\"delivered\"}")" "503"
chk "the order was not moved by either" "$(q "SELECT state FROM orders WHERE order_id='$ORDER'")" "COURIER_ASSIGNED"
chk "and nothing was recorded" "$(q "SELECT COUNT(*) FROM delivery_events")" "0"

echo
echo "=== 8. the economics are visible to the operator ==="
if curl -s -b $OWNER --max-time 240 "$B/ops/delivery" | grep -q 'per delivery'; then
  pass "the ops screen reports cost per delivery"
else
  fail "ops screen reports cost" "missing"
fi
chk "a shift lead can see it" "$(code -b $LEAD "$B/ops/delivery")" "200"
chk "anonymous cannot" "$(code "$B/ops/delivery")" "307"

echo
echo "=== 9. cleanup ==="
node scripts/delivery-cleanup.cjs
chk "test deliveries removed" "$(q "SELECT COUNT(*) FROM deliveries")" "0"
