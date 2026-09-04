#!/usr/bin/env bash
# End-to-end auth checks against the running dev server.
B=http://localhost:3100
J=/tmp/md_cookies
rm -f $J /tmp/md_staff /tmp/md_bao

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }

echo "=== 1. staff surfaces are closed to anonymous visitors ==="
for p in /ops /kds; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$B$p")
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 30 "$B$p")
  chk "$p redirects anonymous -> $(basename "$loc")" "$code" "307"
done

echo
echo "=== 2. mutating APIs reject anonymous callers ==="
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orders" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: anon-1' \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","lines":[{"itemId":"it_chips","qty":1,"choiceIds":[],"notes":""}]}')
chk "POST /api/orders anonymous" "$code" "401"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_chips","isAvailable":false}')
chk "POST /api/menu/availability anonymous" "$code" "401"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/kitchen/bump" \
  -H 'Content-Type: application/json' -d '{"orderId":"whatever","lineNo":1}')
chk "POST /api/kitchen/bump anonymous" "$code" "401"

echo
echo "=== 3. staff sign-in ==="
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' -d '{"email":"owner@sunrise-taqueria.test","password":"wrong"}')
chk "wrong password rejected" "$code" "401"

code=$(curl -s -o /dev/null -w '%{http_code}' -c /tmp/md_staff -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}')
chk "correct password accepted" "$code" "200"

code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/md_staff --max-time 30 "$B/ops")
chk "/ops with staff cookie" "$code" "200"

echo
# A fresh number each run. The OTP limiter allows 3 sends a minute per number,
# so a fixed one makes the suite fail when it is run twice in quick succession
# — the limiter doing its job, but a useless test failure.
PHONE="415555$(printf '%04d' $((RANDOM % 10000)))"
echo "=== 4. customer phone + OTP (using $PHONE) ==="
CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\"}" | node -pe "JSON.parse(require('fs').readFileSync(0)).devCode")
echo "  issued code: $CODE"

bad=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"code\":\"000000\"}")
chk "wrong OTP rejected" "$bad" "401"

ok=$(curl -s -o /dev/null -w '%{http_code}' -c $J -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")
chk "correct OTP accepted" "$ok" "200"

replay=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")
chk "OTP cannot be reused" "$replay" "401"

echo
echo "=== 5. customer can order; sees only their own ==="
ORDER=$(curl -s -b $J -X POST "$B/api/orders" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: authtest-1' \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_pastor","qty":1,"choiceIds":[],"notes":""}]}')
OID=$(echo "$ORDER" | node -pe "JSON.parse(require('fs').readFileSync(0)).order?.orderId ?? 'ERR'")
if [ "$OID" != "ERR" ]; then pass "customer placed order ${OID:0:6}"; else fail "customer order" "$ORDER"; fi

echo
echo "=== 6. cross-tenant isolation ==="
curl -s -o /dev/null -c /tmp/md_bao -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' -d '{"email":"owner@bao-haus.test","password":"dinner1234"}'

code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/md_bao -X POST "$B/api/orders/$OID/transitions" \
  -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
chk "Bao Haus staff CANNOT advance a Sunrise order" "$code" "404"

code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/md_bao -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_pastor","isAvailable":false}')
chk "Bao Haus staff CANNOT 86 a Sunrise item" "$code" "404"

code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/md_staff -X POST "$B/api/orders/$OID/transitions" \
  -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
chk "Sunrise staff CAN advance their own order" "$code" "200"

echo
echo "=== 7. role checks ==="
curl -s -o /dev/null -c /tmp/md_lead -X POST "$B/api/auth/staff/login" \
  -H 'Content-Type: application/json' -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'
code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/md_lead -X POST "$B/api/orders/$OID/transitions" \
  -H 'Content-Type: application/json' -d '{"to":"CANCELLED"}')
chk "shift lead CANNOT cancel a paid order" "$code" "403"

echo
mkdir -p .tmp-test
echo "=== 8. staff order lists are disjoint across tenants ==="
curl -s -b /tmp/md_staff "$B/api/orders" > .tmp-test/sun.json
curl -s -b /tmp/md_bao   "$B/api/orders" > .tmp-test/bao.json
OVERLAP=$(node -e "
const fs = require('node:fs');
const ids = (f) => new Set(JSON.parse(fs.readFileSync(f,'utf8')).orders.map(o => o.orderId));
const a = ids('.tmp-test/sun.json'), b = ids('.tmp-test/bao.json');
const shared = [...a].filter(id => b.has(id));
console.log(JSON.stringify({ sun: a.size, bao: b.size, shared: shared.length }));
")
echo "  $OVERLAP"
SHARED=$(printf '%s' "$OVERLAP" | node -pe "JSON.parse(require('fs').readFileSync(0)).shared")
chk "no order appears in both restaurants' lists" "$SHARED" "0"

# And prove the scoping is real by checking the org of every row.
WRONG=$(node -e "
const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync('.tmp-test/bao.json','utf8')).orders;
console.log(rows.filter(o => o.orgId !== 'org_baohaus').length);
")
chk "every order Bao Haus sees belongs to Bao Haus" "$WRONG" "0"
