#!/usr/bin/env bash
# Stripe Connect wiring, and the money split that decides who gets paid what.
B=http://localhost:3100
OWNER=/tmp/md_pay_owner; LEAD=/tmp/md_pay_lead
rm -f $OWNER $LEAD

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 240 "$@"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. the split arithmetic ==="
node scripts/split-check.cjs

echo
echo "=== 2. connecting a payout account is owner-only ==="
chk "anonymous cannot start onboarding" "$(code -X POST "$B/api/payments/connect")" "401"
chk "a shift lead cannot start onboarding" "$(code -b $LEAD -X POST "$B/api/payments/connect")" "403"
chk "an owner can" "$(code -b $OWNER -X POST "$B/api/payments/connect")" "200"

echo
echo "=== 3. the account is stored against that restaurant only ==="
ACCT=$(curl -s -b $OWNER --max-time 120 "$B/api/payments/connect" | jq_ "d.accountId")
echo "  account: $ACCT"
if [ "$ACCT" != "ERR" ] && [ -n "$ACCT" ] && [ "$ACCT" != "null" ]; then
  pass "an account id is recorded"
else
  fail "account id recorded" "$ACCT"
fi
chk "scoped to the signed-in org" \
  "$(q "SELECT COUNT(*) FROM orgs WHERE org_id='org_sunrise' AND stripe_account_id IS NOT NULL")" "1"
chk "no other restaurant was touched" \
  "$(q "SELECT COUNT(*) FROM orgs WHERE org_id!='org_sunrise' AND stripe_account_id IS NOT NULL")" "0"
chk "and the deployment reports it has no live processor" \
  "$(curl -s -b $OWNER --max-time 120 "$B/api/payments/connect" | jq_ "d.mode")" "none"

echo
echo "=== 4. webhooks refuse anything they cannot verify ==="
# Without STRIPE_WEBHOOK_SECRET the endpoint is closed entirely, which is the
# correct posture: an unverifiable payment event must never move money.
chk "an unsigned event is refused" \
  "$(code -X POST "$B/api/payments/webhook" -H 'Content-Type: application/json' \
     -d '{"id":"evt_test_1","type":"payment_intent.succeeded"}')" "503"
chk "a forged signature is refused" \
  "$(code -X POST "$B/api/payments/webhook" -H 'Content-Type: application/json' \
     -H 'stripe-signature: t=1,v1=deadbeef' \
     -d '{"id":"evt_test_2","type":"payment_intent.succeeded"}')" "503"
chk "and neither was recorded" "$(q "SELECT COUNT(*) FROM payment_events")" "0"

echo
echo "=== 5. the operator screen ==="
chk "an owner reaches it" "$(code -b $OWNER "$B/ops/payments")" "200"
chk "a shift lead sees it read-only" "$(code -b $LEAD "$B/ops/payments")" "200"
if curl -s -b $LEAD --max-time 240 "$B/ops/payments" | grep -q 'Only an owner can connect'; then
  pass "and is told they cannot change it"
else
  fail "shift lead sees the restriction" "missing"
fi
chk "anonymous is sent to sign in" "$(code "$B/ops/payments")" "307"
if curl -s -b $OWNER --max-time 240 "$B/ops/payments" | grep -q 'no money moves'; then
  pass "the sandbox says plainly that no money moves"
else
  fail "sandbox warning shown" "missing"
fi

echo
echo "=== 6. an order records who gets paid what ==="
CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d '{"phone":"4155550177"}' | jq_ "d.devCode")
curl -s -o /dev/null -c /tmp/md_pay_cust -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"4155550177\",\"code\":\"$CODE\"}"
ORDER=$(curl -s -b /tmp/md_pay_cust --max-time 120 -X POST "$B/api/orders" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: pay-$RANDOM" \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","lines":[{"itemId":"it_pastor","qty":2,"choiceIds":[],"notes":""}]}' \
  | jq_ "d.order.orderId")
echo "  order: $ORDER"
SPLIT=$(q "SELECT payload FROM order_events WHERE order_id='$ORDER' AND event_type='payment.authorized'")
echo "  $SPLIT"
chk "commission is zero, in the ledger" \
  "$(echo "$SPLIT" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).commission_cents}catch(e){'ERR'}")" "0"
REST=$(echo "$SPLIT" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).to_restaurant_cents}catch(e){0}")
TOTAL=$(echo "$SPLIT" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).amount_cents}catch(e){0}")
if [ "$REST" -gt 0 ] && [ "$REST" -lt "$TOTAL" ]; then
  pass "the restaurant's share is recorded ($REST of $TOTAL)"
else
  fail "restaurant share recorded" "$REST of $TOTAL"
fi

echo
echo "=== 7. cleanup ==="
node scripts/payments-cleanup.cjs
chk "the sandbox account is cleared" \
  "$(q "SELECT COUNT(*) FROM orgs WHERE stripe_account_id IS NOT NULL")" "0"
