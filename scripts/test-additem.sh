#!/usr/bin/env bash
# Adding and removing menu items from the restaurant sign-in.
B=http://localhost:3100
OWNER=/tmp/md_add_owner; LEAD=/tmp/md_add_lead
rm -f $OWNER $LEAD

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }
add()  { curl -s -b $OWNER -X POST "$B/api/menu/items" -H 'Content-Type: application/json' -d "$1"; }
addc() { curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/menu/items" -H 'Content-Type: application/json' -d "$1"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

# Clean any leftovers from a previous run.
node -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('./data/mobile-dinners.db');
db.prepare(\"DELETE FROM items WHERE org_id='org_sunrise' AND name LIKE 'Test %'\").run();
" >/dev/null

echo "=== 1. access control ==="
chk "anonymous cannot add an item" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/menu/items" \
     -H 'Content-Type: application/json' -d '{"name":"X","priceCents":100,"section":"S"}')" "401"
chk "shift lead cannot add an item" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/menu/items" \
     -H 'Content-Type: application/json' -d '{"name":"X","priceCents":100,"section":"S"}')" "403"

echo
echo "=== 2. validation ==="
chk "no name is refused" "$(addc '{"name":"  ","priceCents":900,"section":"Tacos"}')" "400"
chk "no section is refused" "$(addc '{"name":"Test Nameless","priceCents":900,"section":""}')" "400"
chk "negative price is refused" "$(addc '{"name":"Test Neg","priceCents":-5,"section":"Tacos"}')" "400"
chk "cost above price is refused" \
  "$(addc '{"name":"Test Upside Down","priceCents":500,"costCents":900,"section":"Tacos"}')" "400"
chk "unknown station is refused" \
  "$(addc '{"name":"Test Station","priceCents":500,"section":"Tacos","station":"sous-vide"}')" "400"

echo
echo "=== 3. duplicate names are refused ==="
chk "an existing name clashes" \
  "$(addc '{"name":"Al Pastor Tacos","priceCents":650,"section":"Tacos"}')" "409"
chk "and so does the same name in different case" \
  "$(addc '{"name":"al pastor TACOS","priceCents":650,"section":"Tacos"}')" "409"

echo
echo "=== 4. the claims filter applies to item copy too ==="
BLOCKED=$(add '{"name":"Test Bowl","description":"Gluten-free and safe for celiacs.","priceCents":1200,"costCents":400,"section":"Bowls"}')
CODE=$(addc '{"name":"Test Bowl 2","description":"Gluten-free and safe for celiacs.","priceCents":1200,"costCents":400,"section":"Bowls"}')
echo "  $(echo "$BLOCKED" | jq_ "d.error")"
chk "an allergen claim in a description is refused" "$CODE" "422"

echo
echo "=== 5. adding a valid item ==="
NEW=$(add '{"name":"Test Birria Ramen","description":"Braised beef broth, hand-pulled noodles.","priceCents":1650,"costCents":480,"prepSeconds":420,"section":"Bowls","station":"assembly","imageKw":"ramen"}')
ID=$(echo "$NEW" | jq_ "d.itemId")
echo "  created $ID"
if [ "$ID" != "ERR" ] && [ -n "$ID" ]; then pass "item created"; else fail "item created" "$NEW"; fi
chk "stored at the right price" "$(q "SELECT price_cents FROM items WHERE item_id='$ID'")" "1650"
chk "with its food cost" "$(q "SELECT cost_cents FROM items WHERE item_id='$ID'")" "480"
chk "and it is available" "$(q "SELECT is_available FROM items WHERE item_id='$ID'")" "1"

echo
echo "=== 6. a new item is a DRAFT change, not live ==="
LIVE_BEFORE=$(curl -s -b $OWNER --max-time 60 "$B/ops/menu" | grep -o 'live v[0-9]*' | head -1)
ONSITE=$(curl -s --max-time 90 "$B/r/sunrise-taqueria" | grep -c 'Test Birria Ramen')
chk "it does not appear on the storefront yet" "$ONSITE" "0"
if curl -s -b $OWNER --max-time 60 "$B/ops/menu" | grep -q 'Test Birria Ramen'; then
  pass "but the operator sees it in the draft"
else
  fail "draft shows the item" "missing"
fi

# Signed in as a real customer, so this reaches the item check rather than
# stopping at authentication — otherwise the 401 would prove nothing.
CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json'   -d '{"phone":"4155550199"}' | jq_ "d.devCode")
curl -s -o /dev/null -c /tmp/md_add_cust -X POST "$B/api/auth/otp/verify"   -H 'Content-Type: application/json' -d "{\"phone\":\"4155550199\",\"code\":\"$CODE\"}"
ORDERABLE=$(curl -s -o /dev/null -b /tmp/md_add_cust -w '%{http_code}' -X POST "$B/api/orders"   -H 'Content-Type: application/json' -H "Idempotency-Key: add-$RANDOM"   -d "{\"orgId\":\"org_sunrise\",\"fulfillment\":\"pickup\",\"lines\":[{\"itemId\":\"$ID\",\"qty\":1,\"choiceIds\":[],\"notes\":\"\"}]}")
chk "a signed-in guest still cannot order it before publishing" "$ORDERABLE" "404"

echo
echo "=== 7. publishing puts it on sale ==="
V=$(curl -s -b $OWNER -X POST "$B/api/menu/publish" | jq_ "d.version.versionNo")
echo "  published v$V"
AFTER=$(curl -s --max-time 90 "$B/r/sunrise-taqueria" | grep -c 'Test Birria Ramen')
if [ "$AFTER" -ge 1 ]; then pass "now on the storefront"; else fail "on storefront" "$AFTER"; fi

NOWORDER=$(curl -s -b /tmp/md_add_cust -X POST "$B/api/orders"   -H 'Content-Type: application/json' -H "Idempotency-Key: add2-$RANDOM"   -d "{\"orgId\":\"org_sunrise\",\"fulfillment\":\"pickup\",\"lines\":[{\"itemId\":\"$ID\",\"qty\":1,\"choiceIds\":[],\"notes\":\"\"}]}"   | jq_ "d.order.subtotalCents")
chk "and a guest can now order it at the published price" "$NOWORDER" "1650"

echo
echo "=== 8. removing an item ==="
chk "shift lead cannot remove" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X DELETE "$B/api/menu/items/$ID")" "403"
# $ID has just been ordered in step 7, so it is protected now. Add a fresh
# item to prove the delete path works.
SPARE=$(add '{"name":"Test Spare Item","priceCents":500,"costCents":150,"section":"Sides"}' | jq_ "d.itemId")
chk "an unordered item can be removed" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X DELETE "$B/api/menu/items/$SPARE")" "200"
chk "and it is gone from the draft" "$(q "SELECT COUNT(*) FROM items WHERE item_id='$SPARE'")" "0"
chk "the item ordered in step 7 is now protected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X DELETE "$B/api/menu/items/$ID")" "409"

echo
echo "=== 9. an item with order history cannot be deleted ==="
RESP=$(curl -s -b $OWNER -X DELETE "$B/api/menu/items/it_pastor")
CODE=$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X DELETE "$B/api/menu/items/it_pastor")
echo "  $(echo "$RESP" | jq_ "d.error")"
chk "refused so receipts stay intact" "$CODE" "409"
chk "and the item is still there" "$(q "SELECT COUNT(*) FROM items WHERE item_id='it_pastor'")" "1"

chk "cross-tenant delete is refused" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X DELETE "$B/api/menu/items/it_porkbao")" "404"

curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/publish"
echo
echo "  (menu republished)"

# Leave the menu as we found it: the test item was ordered, so it can only be
# hidden, not deleted.
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/availability"   -H 'Content-Type: application/json' -d "{\"itemId\":\"$ID\",\"isAvailable\":false}"
echo "  (test item marked sold out; it has order history and cannot be deleted)"
