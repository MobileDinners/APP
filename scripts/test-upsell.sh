#!/usr/bin/env bash
# Upsell engine: the hard filters that stop it suggesting something harmful,
# and the telemetry that makes "upsells raised the ticket" a checkable claim.
B=${MD_TEST_BASE:-http://localhost:3100}
OWNER=/tmp/md_up_owner; CUST=/tmp/md_up_cust
rm -f $OWNER $CUST
mkdir -p .tmp-test

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }
slate() { curl -s --max-time 90 "$B/api/upsell?orgId=org_sunrise&items=$1"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. access control ==="
chk "/ops/upsell anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/ops/upsell")" "307"
chk "/ops/upsell as staff" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 120 "$B/ops/upsell")" "200"

echo
echo "=== 2. suggestions are relevant, not just frequent ==="
S=$(slate "it_veggieburrito")
N=$(echo "$S" | jq_ "d.suggestions.length")
MINLIFT=$(echo "$S" | jq_ "Math.min(...d.suggestions.map(s=>s.lift))")
MINSUP=$(echo "$S" | jq_ "Math.min(...d.suggestions.map(s=>s.support))")
echo "  suggestions=$N  min lift=$MINLIFT  min support=$MINSUP"
if [ "$N" -ge 1 ]; then pass "a cart with history gets suggestions"; else fail "suggestions returned" "$N"; fi
if [ "$(node -pe "Number('$MINLIFT') > 1")" = "true" ]; then
  pass "every suggestion has lift above 1 (an add-on, not a substitute)"
else
  fail "lift above 1" "$MINLIFT"
fi
if [ "$MINSUP" -ge 8 ]; then pass "every suggestion meets the support floor"; else fail "support floor" "$MINSUP"; fi

echo
echo "=== 3. never suggests what is already in the cart ==="
DUP=$(slate "it_veggieburrito,it_horchata" | jq_ "d.suggestions.filter(s=>['it_veggieburrito','it_horchata'].includes(s.itemId)).length")
chk "cart items are excluded from their own slate" "$DUP" "0"

echo
echo "=== 4. sold-out items are never suggested ==="
BEFORE=$(slate "it_veggieburrito" | jq_ "d.suggestions.some(s=>s.itemId==='it_horchata')")
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_horchata","isAvailable":false}'
AFTER=$(slate "it_veggieburrito" | jq_ "d.suggestions.some(s=>s.itemId==='it_horchata')")
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_horchata","isAvailable":true}'
echo "  suggested before 86: $BEFORE, after 86: $AFTER"
chk "an 86'd item drops out of the slate" "$AFTER" "false"
chk "and it was there beforehand (so the test means something)" "$BEFORE" "true"

echo
echo "=== 5. category saturation ==="
DRINKS=$(slate "it_veggieburrito,it_horchata,it_agua" | jq_ "
  d.suggestions.filter(s=>['it_horchata','it_agua','it_milktea'].includes(s.itemId)).length")
chk "no third drink pushed at a cart with two" "$DRINKS" "0"

echo
echo "=== 6. prep-time guard ==="
# Chips & Queso is a 90-second item; nothing slow should be attached to it.
SLOW=$(slate "it_chips" | jq_ "
  const c = d.suggestions.map(s=>s.prepSeconds);
  c.length ? Math.max(...c) : 0")
echo "  slowest suggestion onto a 90s cart: ${SLOW}s (ceiling 210s)"
if [ "$SLOW" -le 210 ]; then
  pass "nothing suggested that would blow the promised time"
else
  fail "prep guard" "${SLOW}s"
fi

echo
echo "=== 7. impressions and accepts are recorded ==="
I0=$(q "SELECT COUNT(*) FROM upsell_events WHERE action='impression'")
slate "it_veggieburrito" > /dev/null
I1=$(q "SELECT COUNT(*) FROM upsell_events WHERE action='impression'")
if [ "$I1" -gt "$I0" ]; then pass "impressions logged server-side ($I0 -> $I1)"; else fail "impressions logged" "$I0 -> $I1"; fi

A0=$(q "SELECT COUNT(*) FROM upsell_events WHERE action='accepted'")
curl -s -o /dev/null -X POST "$B/api/upsell" -H 'Content-Type: application/json' \
  -d '{"orgId":"org_sunrise","itemId":"it_horchata"}'
A1=$(q "SELECT COUNT(*) FROM upsell_events WHERE action='accepted'")
if [ "$A1" -gt "$A0" ]; then pass "accepts logged ($A0 -> $A1)"; else fail "accepts logged" "$A0 -> $A1"; fi

chk "an accept for another restaurant's item is refused" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/upsell" \
     -H 'Content-Type: application/json' -d '{"orgId":"org_sunrise","itemId":"it_porkbao"}')" "404"

echo
echo "=== 8. the arm is stable, and orders record it ==="
A=$(slate "it_veggieburrito" | jq_ "d.arm")
BB=$(slate "it_veggieburrito" | jq_ "d.arm")
chk "same cart returns the same arm twice" "$A" "$BB"

CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d '{"phone":"4155550142"}' | jq_ "d.devCode")
curl -s -o /dev/null -c $CUST -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"4155550142\",\"code\":\"$CODE\"}"
ORD=$(curl -s -b $CUST -X POST "$B/api/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: upsell-test-$RANDOM" \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_veggieburrito","qty":1,"choiceIds":[],"notes":""}]}')
OID=$(echo "$ORD" | jq_ "d.order.orderId")
ARM=$(q "SELECT upsell_arm FROM orders WHERE order_id='$OID'")
echo "  order ${OID:0:6} recorded arm: $ARM"
if [ "$ARM" = "treated" ] || [ "$ARM" = "holdout" ]; then
  pass "every order records which arm the guest was in"
else
  fail "order records an arm" "$ARM"
fi

echo
echo "=== 9. ops page reports attach rate ==="
PAGE=$(curl -s -b $OWNER --max-time 120 "$B/ops/upsell")
if printf '%s' "$PAGE" | grep -q "Attach rate"; then pass "attach rate shown"; else fail "attach rate shown" "missing"; fi
if printf '%s' "$PAGE" | grep -q "What actually goes together"; then pass "affinity table shown"; else fail "affinity table" "missing"; fi
