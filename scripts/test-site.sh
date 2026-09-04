#!/usr/bin/env bash
# Website builder: the publish gate, the claims filter behind it, and the
# live menu binding that means there is never a second copy of the menu.
B=http://localhost:3100
OWNER=/tmp/md_site_owner; LEAD=/tmp/md_site_lead
rm -f $OWNER $LEAD
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
chk "/ops/site anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/ops/site")" "307"
chk "/ops/site as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 120 "$B/ops/site")" "200"
chk "shift lead CANNOT edit the site" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X PATCH "$B/api/site" \
     -H 'Content-Type: application/json' -d '{"regenerate":true}')" "403"
chk "shift lead CANNOT publish the site" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/site")" "403"

echo
echo "=== 2. a draft is generated from the restaurant's own data ==="
GEN=$(curl -s -b $OWNER -X PATCH "$B/api/site" -H 'Content-Type: application/json' \
  -d '{"regenerate":true}')
SECTIONS=$(echo "$GEN" | jq_ "d.site.draft.sections.length")
TITLE=$(echo "$GEN" | jq_ "d.site.draft.metaTitle")
echo "  sections=$SECTIONS  title=\"$TITLE\""
if [ "$SECTIONS" -ge 5 ]; then pass "a full page model is generated"; else fail "page model" "$SECTIONS"; fi
if echo "$TITLE" | grep -q "Sunrise Taqueria"; then pass "copy uses the real brand name"; else fail "brand in title" "$TITLE"; fi
chk "generated copy passes its own claims filter" "$(echo "$GEN" | jq_ "d.claims.blocked")" "0"

echo
echo "=== 3. the claims filter blocks what it must ==="
inject() {
  curl -s -b $OWNER -X PATCH "$B/api/site" -H 'Content-Type: application/json' \
    -d "$(node -e "
      const m = JSON.parse(process.argv[1]).site.draft;
      m.sections = m.sections.map(s => s.kind === 'about' ? { ...s, body: process.argv[2] } : s);
      process.stdout.write(JSON.stringify({ draft: m }));
    " "$GEN" "$1")"
}

for phrase in "Our tacos are gluten-free and safe for celiacs." \
              "This bowl is low-calorie and boosts your immunity." \
              "Every dish here cures disease."; do
  R=$(inject "$phrase")
  BLK=$(echo "$R" | jq_ "d.claims.blocked")
  WHAT=$(echo "$R" | jq_ "d.claims.findings.filter(f=>f.severity==='block').map(f=>f.matched).join(', ')")
  printf "  %-52s blocked=%s  [%s]\n" "\"${phrase:0:48}\"" "$BLK" "$WHAT"
  if [ "$BLK" -ge 1 ]; then pass "blocked"; else fail "should have been blocked" "$phrase"; fi

  chk "  publishing is refused while blocked" \
    "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/site")" "409"
done

echo
echo "=== 4. origin and superlative claims warn but do not block ==="
R=$(inject "Locally sourced, organic ingredients. Voted best in town.")
echo "  blocked=$(echo "$R" | jq_ "d.claims.blocked")  warnings=$(echo "$R" | jq_ "d.claims.warnings")"
chk "not blocked" "$(echo "$R" | jq_ "d.claims.blocked")" "0"
if [ "$(echo "$R" | jq_ "d.claims.warnings")" -ge 2 ]; then
  pass "flagged for the operator to own deliberately"
else
  fail "warnings raised" "$(echo "$R" | jq_ "d.claims.warnings")"
fi

echo
echo "=== 5. clean copy publishes, and the page goes live ==="
inject "We grill al pastor on a trompo every day and grind our masa each morning." > /dev/null
PUB=$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/site")
chk "publish succeeds once the copy is clean" "$PUB" "200"
chk "public page is reachable" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$B/site/sunrise-taqueria")" "200"

PAGE=$(curl -s --max-time 90 "$B/site/sunrise-taqueria")
if printf '%s' "$PAGE" | grep -q '"@type":"Restaurant"'; then pass "Restaurant structured data emitted"; else fail "schema.org Restaurant" "missing"; fi
if printf '%s' "$PAGE" | grep -q '"@type":"Menu"'; then pass "Menu structured data emitted"; else fail "schema.org Menu" "missing"; fi
if printf '%s' "$PAGE" | grep -q 'Al Pastor Tacos'; then pass "menu renders on the public page"; else fail "menu on page" "missing"; fi

echo
echo "=== 6. the menu is LIVE-bound, not copied into the page ==="
BEFORE=$(printf '%s' "$PAGE" | grep -o 'Al Pastor Tacos' | wc -l | tr -d ' ')
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_pastor","isAvailable":false}'
AFTER=$(curl -s --max-time 90 "$B/site/sunrise-taqueria" | grep -o 'Al Pastor Tacos' | wc -l | tr -d ' ')
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/availability" \
  -H 'Content-Type: application/json' -d '{"itemId":"it_pastor","isAvailable":true}'
echo "  occurrences before 86: $BEFORE, after: $AFTER (site was never republished)"
if [ "$BEFORE" -ge 1 ] && [ "$AFTER" -eq 0 ]; then
  pass "an 86'd item vanishes from the live site with no republish"
else
  fail "live menu binding" "before=$BEFORE after=$AFTER"
fi

# A DRAFT price edit must NOT reach guests. Only publishing does that.
DRAFT_ONLY=$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X PATCH "$B/api/menu/items/it_pastor"   -H 'Content-Type: application/json' -d '{"priceCents":999}')
LEAKED=$(curl -s --max-time 90 "$B/site/sunrise-taqueria" | grep -c '9\.99')
chk "an unpublished price does NOT appear on the public site" "$LEAKED" "0"

CODE=$(curl -s -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json'   -d '{"phone":"4155550142"}' | jq_ "d.devCode")
curl -s -o /dev/null -c /tmp/md_site_cust -X POST "$B/api/auth/otp/verify"   -H 'Content-Type: application/json' -d "{\"phone\":\"4155550142\",\"code\":\"$CODE\"}"
CHARGED=$(curl -s -b /tmp/md_site_cust -X POST "$B/api/orders" -H 'Content-Type: application/json'   -H "Idempotency-Key: site-price-$RANDOM"   -d '{"orgId":"org_sunrise","fulfillment":"pickup","tipCents":0,"pointsToRedeem":0,"lines":[{"itemId":"it_pastor","qty":1,"choiceIds":[],"notes":""}]}'   | jq_ "d.order.subtotalCents")
echo "  draft says 999c; guest was charged ${CHARGED}c"
chk "a guest is charged the PUBLISHED price, not the draft" "$CHARGED" "650"

# Publishing the menu is what moves the price for everyone.
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/publish"
NOWLIVE=$(curl -s --max-time 90 "$B/site/sunrise-taqueria" | grep -c '9\.99')
if [ "$NOWLIVE" -ge 1 ]; then
  pass "publishing the menu moves the price on the site with no site republish"
else
  fail "published price reaches the site" "$NOWLIVE"
fi

curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/menu/items/it_pastor"   -H 'Content-Type: application/json' -d '{"priceCents":650}'
curl -s -o /dev/null -b $OWNER -X POST "$B/api/menu/publish"
echo "  (price restored to 650c and republished)"

echo
echo "=== 7. drafts stay private until published ==="
curl -s -o /dev/null -b $OWNER -X PATCH "$B/api/site" -H 'Content-Type: application/json' \
  -d "$(node -e "
    const m = JSON.parse(process.argv[1]).site.draft;
    m.sections = m.sections.map(s => s.kind === 'hero' ? { ...s, headline: 'UNPUBLISHED DRAFT HEADLINE' } : s);
    process.stdout.write(JSON.stringify({ draft: m }));
  " "$GEN")"
LEAK=$(curl -s --max-time 90 "$B/site/sunrise-taqueria" | grep -c 'UNPUBLISHED DRAFT HEADLINE')
chk "an unpublished edit never appears on the public page" "$LEAK" "0"

echo
echo "=== 8. SEO is a checklist with fixes, not a score ==="
SEO=$(curl -s -b $OWNER "$B/api/site" | jq_ "d.seo.length")
FIXES=$(curl -s -b $OWNER "$B/api/site" | jq_ "d.seo.filter(c=>!c.ok && c.fix).length")
echo "  checks=$SEO  actionable fixes=$FIXES"
if [ "$SEO" -ge 8 ]; then pass "a real checklist is produced"; else fail "checklist" "$SEO"; fi
NOSCORE=$(curl -s -b $OWNER "$B/api/site" | jq_ "JSON.stringify(d.seo).includes('score')")
chk "no score is reported anywhere" "$NOSCORE" "false"
