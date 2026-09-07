#!/usr/bin/env bash
# CRM: access control, and the boundary that matters most in this product —
# a restaurant sees its own relationship with a guest and nothing whatsoever
# about that guest's behaviour at any other restaurant.
B=${MD_TEST_BASE:-http://localhost:3100}
OWNER=/tmp/md_crm_owner; BAO=/tmp/md_crm_bao; LEAD=/tmp/md_crm_lead
rm -f $OWNER $BAO $LEAD
mkdir -p .tmp-test

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
q()    { node scripts/db-query.mjs "$1"; }
# The "Orders" stat inside an open profile card.
statOrders() { grep -oE 'Orders</p><p class="num[^"]*">[0-9]+' "$1" | grep -oE '[0-9]+$' | head -1; }
count() { grep -o "$2" "$1" | wc -l | tr -d ' '; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $BAO -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@bao-haus.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. access control ==="
chk "/ops/customers anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/ops/customers")" "307"
chk "/ops/customers as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 120 "$B/ops/customers")" "200"
chk "/ops/customers as shift lead (read access)" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' --max-time 120 "$B/ops/customers")" "200"

echo
echo "=== 2. a profile counts only THIS restaurant's orders ==="
SHARED=$(q "SELECT a.person_id FROM
  (SELECT DISTINCT person_id FROM orders WHERE org_id='org_sunrise' AND state='SETTLED') a
  JOIN (SELECT DISTINCT person_id FROM orders WHERE org_id='org_baohaus' AND state='SETTLED') b
  ON a.person_id = b.person_id LIMIT 1")
SUN_N=$(q "SELECT COUNT(*) FROM orders WHERE org_id='org_sunrise' AND state='SETTLED' AND person_id='$SHARED'")
BAO_N=$(q "SELECT COUNT(*) FROM orders WHERE org_id='org_baohaus' AND state='SETTLED' AND person_id='$SHARED'")
ALL_N=$(q "SELECT COUNT(*) FROM orders WHERE state='SETTLED' AND person_id='$SHARED'")
echo "  guest $SHARED — sunrise=$SUN_N bao=$BAO_N everywhere=$ALL_N"

curl -s -b $OWNER --max-time 120 "$B/ops/customers?person=$SHARED" -o .tmp-test/sun.html
curl -s -b $BAO   --max-time 120 "$B/ops/customers?person=$SHARED" -o .tmp-test/bao.html
SUN_SHOWN=$(statOrders .tmp-test/sun.html)
BAO_SHOWN=$(statOrders .tmp-test/bao.html)
echo "  profile shows — sunrise=$SUN_SHOWN bao=$BAO_SHOWN"

chk "Sunrise profile counts only Sunrise orders" "$SUN_SHOWN" "$SUN_N"
chk "Bao Haus profile counts only Bao Haus orders" "$BAO_SHOWN" "$BAO_N"
if [ "$SUN_SHOWN" != "$ALL_N" ] && [ "$BAO_SHOWN" != "$ALL_N" ]; then
  pass "neither restaurant is shown the cross-brand total ($ALL_N)"
else
  fail "cross-brand total leaked" "sun=$SUN_SHOWN bao=$BAO_SHOWN all=$ALL_N"
fi

echo
echo "=== 3. a guest of one restaurant is invisible to the other ==="
SUNONLY=$(q "SELECT person_id FROM orders WHERE org_id='org_sunrise' AND state='SETTLED'
  AND person_id NOT IN (SELECT person_id FROM orders WHERE org_id='org_baohaus' AND state='SETTLED')
  LIMIT 1")
curl -s -b $OWNER --max-time 120 "$B/ops/customers?person=$SUNONLY" -o .tmp-test/own.html
curl -s -b $BAO   --max-time 120 "$B/ops/customers?person=$SUNONLY" -o .tmp-test/other.html

chk "Sunrise opens their own guest's profile" "$(count .tmp-test/own.html 'Recent orders')" "1"
chk "Bao Haus gets no profile card for that guest" "$(count .tmp-test/other.html 'Recent orders')" "0"
chk "Bao Haus is shown no lifetime value for them" "$(count .tmp-test/other.html 'Margin to you')" "0"

echo
echo "=== 4. segments actually separate ==="
curl -s -b $OWNER --max-time 120 "$B/ops/customers" -o .tmp-test/list.html
SEGS=$(grep -oE '>(Champion|Loyal|Promising|At risk|Lapsed|One-time)<' .tmp-test/list.html | sort -u | wc -l | tr -d ' ')
echo "  distinct segments present: $SEGS"
if [ "$SEGS" -ge 4 ]; then pass "at least 4 segments populated"; else fail "segments populated" "$SEGS"; fi

CHAMPS=$(grep -oE '>Champion<' .tmp-test/list.html | wc -l | tr -d ' ')
if [ "$CHAMPS" -ge 1 ]; then pass "champions identified ($CHAMPS on first page)"; else fail "champions" "0"; fi

echo
echo "=== 5. churn scores are bounded ==="
BAD=$(grep -oE '>[0-9]\.[0-9]{2}<' .tmp-test/list.html | tr -d '><' \
  | awk '$1 < 0 || $1 > 1 { c++ } END { print c+0 }')
TOTAL=$(grep -oE '>[0-9]\.[0-9]{2}<' .tmp-test/list.html | wc -l | tr -d ' ')
echo "  scores checked: $TOTAL"
chk "every churn score is within 0..1" "$BAD" "0"
