#!/usr/bin/env bash
# Menu optimizer: guardrails, role checks, and the property that matters —
# accepting a suggestion edits the DRAFT and never the live menu.
B=http://localhost:3100
OWNER=/tmp/md_opt_owner; LEAD=/tmp/md_opt_lead
rm -f $OWNER $LEAD

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. access control ==="
chk "/ops/optimizer anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 "$B/ops/optimizer")" "307"
chk "/ops/optimizer as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 60 "$B/ops/optimizer")" "200"
chk "shift lead CANNOT accept a proposal" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/optimizer/decision" \
     -H 'Content-Type: application/json' -d '{"itemId":"it_street","verdict":"accepted"}')" "403"
chk "unknown item is refused" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/optimizer/decision" \
     -H 'Content-Type: application/json' -d '{"itemId":"it_does_not_exist","verdict":"accepted"}')" "409"

echo
echo "=== 2. guardrails hold across the suggestion set ==="
HTML=$(curl -s -b $OWNER --max-time 60 "$B/ops/optimizer")
COUNT=$(printf '%s' "$HTML" | grep -o 'Apply to draft' | wc -l | tr -d ' ')
echo "  suggestions offered: $COUNT"
if [ "$COUNT" -le 5 ]; then pass "at most 5 suggestions per cycle"; else fail "at most 5 suggestions" "$COUNT"; fi

OVER=$(printf '%s' "$HTML" | grep -oE '[+-][0-9]+(\.[0-9])?%' | tr -d '+%' \
       | awk '{ v = $1 < 0 ? -$1 : $1 } v > 8 { c++ } END { print c+0 }')
chk "no suggestion moves price more than 8%" "$OVER" "0"

echo
echo "=== 3. accepting edits the draft, not the live menu ==="
BEFORE_LIVE=$(curl -s -b $OWNER --max-time 40 "$B/ops/menu" | grep -o 'live v[0-9]*' | head -1)
PRICE_BEFORE=$(q "SELECT price_cents FROM items WHERE item_id = 'it_street'")

RESP=$(curl -s -b $OWNER -X POST "$B/api/optimizer/decision" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_street","verdict":"accepted"}')
PROPOSED=$(echo "$RESP" | jq_ "d.proposal.proposedPriceCents")
PRICE_AFTER=$(q "SELECT price_cents FROM items WHERE item_id = 'it_street'")

echo "  draft price ${PRICE_BEFORE}c -> ${PRICE_AFTER}c (proposed ${PROPOSED}c)"
chk "accept applied the proposed price to the draft" "$PRICE_AFTER" "$PROPOSED"

AFTER_LIVE=$(curl -s -b $OWNER --max-time 40 "$B/ops/menu" | grep -o 'live v[0-9]*' | head -1)
chk "live menu version did NOT change" "$AFTER_LIVE" "$BEFORE_LIVE"

echo
echo "=== 4. the decision was logged for evaluation ==="
LOGGED=$(q "SELECT COUNT(*) FROM ai_decisions WHERE item_id = 'it_street' AND verdict = 'accepted'")
if [ "$LOGGED" -ge 1 ]; then pass "ai_decisions row written ($LOGGED)"; else fail "decision logged" "$LOGGED"; fi

DISMISS=$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/optimizer/decision" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_horchata","verdict":"dismissed"}')
if [ "$DISMISS" = "200" ] || [ "$DISMISS" = "409" ]; then
  pass "dismiss is accepted or already stale ($DISMISS)"
else
  fail "dismiss handled" "$DISMISS"
fi

echo
echo "=== 5. restore the draft ==="
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_street" \
  -H 'Content-Type: application/json' -d "{\"priceCents\":$PRICE_BEFORE}"
echo "  draft price restored to ${PRICE_BEFORE}c"
