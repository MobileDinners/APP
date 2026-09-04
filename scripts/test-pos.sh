#!/usr/bin/env bash
# POS coexist mode: connection security, and the conflict-resolution table that
# decides who wins when the till and this system disagree about an item.
#
# Square and Clover cannot be exercised without merchant credentials, so the
# sandbox provider stands in for a real till. The mapping, conflict and order
# injection logic under test is the same code path all three providers use.
B=http://localhost:3100
OWNER=/tmp/md_pos_owner; LEAD=/tmp/md_pos_lead; CUST=/tmp/md_pos_cust
rm -f $OWNER $LEAD $CUST
mkdir -p .tmp-test

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
jq_()  { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0));$1}catch(e){'ERR'}"; }
q()    { node scripts/db-query.mjs "$1"; }

curl -s -o /dev/null -c $OWNER -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}'
curl -s -o /dev/null -c $LEAD -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
  -d '{"email":"lead@sunrise-taqueria.test","password":"dinner1234"}'

echo "=== 1. access control ==="
chk "/ops/pos anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/ops/pos")" "307"
chk "/ops/pos as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 120 "$B/ops/pos")" "200"
chk "shift lead CANNOT connect a till" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/pos/connect" \
     -H 'Content-Type: application/json' -d '{"provider":"sandbox"}')" "403"
chk "unknown provider rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/pos/connect" \
     -H 'Content-Type: application/json' -d '{"provider":"toast"}')" "400"
chk "sync with nothing connected is refused" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X DELETE "$B/api/pos/sync" > /dev/null; \
     curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/pos/sync")" "409"

echo
echo "=== 2. OAuth providers are advertised honestly ==="
PROVS=$(curl -s -b $OWNER "$B/api/pos/connect" | jq_ "d.providers.map(p=>p.id+':'+p.configured).join(' ')")
echo "  $PROVS"
if echo "$PROVS" | grep -q "square:"; then pass "Square offered"; else fail "Square listed" "$PROVS"; fi
if echo "$PROVS" | grep -q "clover:"; then pass "Clover offered"; else fail "Clover listed" "$PROVS"; fi
if echo "$PROVS" | grep -q "square:false"; then
  pass "Square correctly shown as unconfigured (no credentials on this server)"
else
  pass "Square is configured on this server"
fi

echo
echo "=== 3. connect the sandbox till ==="
CONN=$(curl -s -b $OWNER -X POST "$B/api/pos/connect" -H 'Content-Type: application/json' \
  -d '{"provider":"sandbox"}')
chk "connected" "$(echo "$CONN" | jq_ "d.connected")" "true"
SEEDED=$(q "SELECT COUNT(*) FROM pos_sandbox_catalog WHERE org_id='org_sunrise'")
echo "  till seeded with $SEEDED items"
if [ "$SEEDED" -ge 5 ]; then pass "the fake till has a catalogue"; else fail "till seeded" "$SEEDED"; fi

echo
echo "=== 4. access tokens are encrypted at rest ==="
TOK=$(q "SELECT access_token FROM pos_connections WHERE org_id='org_sunrise'")
echo "  stored: ${TOK:0:24}…"
if echo "$TOK" | grep -q '^v1\.'; then pass "token is sealed, not plaintext"; else fail "token sealed" "$TOK"; fi
if echo "$TOK" | grep -q 'sandbox-'; then fail "plaintext token leaked into the database" "$TOK"; else pass "raw token does not appear in the database"; fi

echo
echo "=== 5. first sync maps every item ==="
R1=$(curl -s -b $OWNER -X POST "$B/api/pos/sync")
echo "  created=$(echo "$R1" | jq_ "d.result.created") updated=$(echo "$R1" | jq_ "d.result.updated") unchanged=$(echo "$R1" | jq_ "d.result.unchanged")"
MAPPED=$(q "SELECT COUNT(*) FROM pos_item_map WHERE org_id='org_sunrise'")
chk "every till item is mapped to one of ours" "$MAPPED" "$SEEDED"
chk "a re-sync of an unchanged till changes nothing" \
  "$(curl -s -b $OWNER -X POST "$B/api/pos/sync" | jq_ "d.result.updated")" "0"

echo
echo "=== 6. the POS wins on price ==="
EXT=$(q "SELECT external_id FROM pos_item_map WHERE org_id='org_sunrise' AND item_id='it_pastor'")
BEFORE=$(q "SELECT price_cents FROM items WHERE item_id='it_pastor'")
node -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('./data/mobile-dinners.db');
db.prepare('UPDATE pos_sandbox_catalog SET price_cents=? WHERE org_id=? AND external_id=?')
  .run(775,'org_sunrise','$EXT');
"
R2=$(curl -s -b $OWNER -X POST "$B/api/pos/sync")
AFTER=$(q "SELECT price_cents FROM items WHERE item_id='it_pastor'")
echo "  till says 775c; ours was ${BEFORE}c, now ${AFTER}c"
chk "a price change on the till overwrites ours" "$AFTER" "775"
VER=$(echo "$R2" | jq_ "d.result.publishedVersion")
if [ "$VER" != "ERR" ] && [ -n "$VER" ]; then pass "a menu version was published from the sync (v$VER)"; else fail "menu published" "$VER"; fi

echo
echo "=== 7. our description survives a sync ==="
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_pastor" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Two tacos, pineapple, onion, cilantro, salsa roja."}'
curl -s -o /dev/null -b $OWNER -X POST "$B/api/pos/sync"
DESC=$(q "SELECT description FROM items WHERE item_id='it_pastor'")
echo "  description after sync: \"${DESC:0:44}…\""
if [ -n "$DESC" ]; then pass "the till did not blank our web copy"; else fail "description kept" "empty"; fi

echo
echo "=== 8. food cost is ours and the till cannot touch it ==="
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_pastor" \
  -H 'Content-Type: application/json' -d '{"costCents":210}'
curl -s -o /dev/null -b $OWNER -X POST "$B/api/pos/sync"
chk "cost survived the sync" "$(q "SELECT cost_cents FROM items WHERE item_id='it_pastor'")" "210"

echo
echo "=== 9. a wholesale replacement is flagged, not applied ==="
SAFE=$(q "SELECT price_cents FROM items WHERE item_id='it_carnebowl'")
EXT2=$(q "SELECT external_id FROM pos_item_map WHERE org_id='org_sunrise' AND item_id='it_carnebowl'")
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_carnebowl" \
  -H 'Content-Type: application/json' -d '{"description":""}'
node -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('./data/mobile-dinners.db');
db.prepare('UPDATE pos_sandbox_catalog SET name=?, price_cents=?, description=?, hidden=1 WHERE org_id=? AND external_id=?')
  .run('Completely Different Dish', 9999, 'A different description', 'org_sunrise', '$EXT2');
"
R3=$(curl -s -b $OWNER -X POST "$B/api/pos/sync")
FLAGGED=$(echo "$R3" | jq_ "d.result.flagged")
NOWPRICE=$(q "SELECT price_cents FROM items WHERE item_id='it_carnebowl'")
NOWNAME=$(q "SELECT name FROM items WHERE item_id='it_carnebowl'")
echo "  flagged=$FLAGGED  price still ${NOWPRICE}c (was ${SAFE}c)  name still \"$NOWNAME\""
if [ "$FLAGGED" -ge 1 ]; then pass "the item was flagged for review"; else fail "flagged" "$FLAGGED"; fi
chk "its price was NOT silently overwritten" "$NOWPRICE" "$SAFE"

echo
echo "=== 10. a new item on the till appears here ==="
node -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('./data/mobile-dinners.db');
db.prepare('INSERT OR REPLACE INTO pos_sandbox_catalog (org_id, external_id, name, description, price_cents, hidden, category) VALUES (?,?,?,?,?,0,?)')
  .run('org_sunrise','SBX-NEW-1','Tres Leches','Soaked sponge cake',650,'Desserts');
"
R4=$(curl -s -b $OWNER -X POST "$B/api/pos/sync")
chk "one item created" "$(echo "$R4" | jq_ "d.result.created")" "1"
chk "and it is on our menu at the till's price" \
  "$(q "SELECT price_cents FROM items WHERE name='Tres Leches'")" "650"

echo
echo "=== 11. marketplace orders are pushed to the till ==="
CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d '{"phone":"4155550142"}' | jq_ "d.devCode")
curl -s -o /dev/null -c $CUST -X POST "$B/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"4155550142\",\"code\":\"$CODE\"}"
OID=$(curl -s -b $CUST -X POST "$B/api/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: pos-test-$RANDOM" \
  -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_chips","qty":2,"choiceIds":[],"notes":"extra napkins"}]}' \
  | jq_ "d.order.orderId")
sleep 2
PUSHED=$(q "SELECT status FROM pos_order_push WHERE order_id='$OID'")
EXTORD=$(q "SELECT external_order_id FROM pos_order_push WHERE order_id='$OID'")
echo "  order ${OID:0:6} -> till order ${EXTORD:-none} ($PUSHED)"
chk "the ticket reached the till" "$PUSHED" "pushed"
ONTILL=$(q "SELECT COUNT(*) FROM pos_sandbox_orders WHERE reference='$OID'")
chk "and the till has exactly one copy of it" "$ONTILL" "1"

echo
echo "=== 12. disconnecting leaves our menu intact ==="
ITEMS_BEFORE=$(q "SELECT COUNT(*) FROM items WHERE org_id='org_sunrise'")
curl -s -o /dev/null -b $OWNER -X DELETE "$B/api/pos/sync"
chk "connection removed" "$(q "SELECT COUNT(*) FROM pos_connections WHERE org_id='org_sunrise'")" "0"
chk "item mapping removed" "$(q "SELECT COUNT(*) FROM pos_item_map WHERE org_id='org_sunrise'")" "0"
chk "menu items untouched" "$(q "SELECT COUNT(*) FROM items WHERE org_id='org_sunrise'")" "$ITEMS_BEFORE"
