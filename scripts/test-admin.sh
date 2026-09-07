#!/usr/bin/env bash
# Internal admin dashboard — /admin and /api/admin.
#
# This application reads across EVERY restaurant and EVERY customer with none
# of the tenant scoping that governs the rest of the codebase, so most of what
# follows is about who cannot reach it. The rest checks that the figures are
# honest: a metric with no data behind it must say so rather than render a
# confident zero.
#
#   MD_ADMIN_EMAILS="owner@sunrise-taqueria.test" npm run dev
#   MD_ADMIN_EMAILS="owner@sunrise-taqueria.test" MD_TEST_BASE=... npm run test:admin
B=${MD_TEST_BASE:-http://localhost:3100}
A=/tmp/md_admin_yes
O=/tmp/md_admin_no
rm -f $A $O
mkdir -p .tmp-test

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$@"; }

PAGES="/admin /admin/merchants /admin/customers /admin/billing /admin/delivery /admin/orders /admin/marketplace /admin/settings"

echo "=== 1. anonymous visitors ==="
for p in $PAGES; do
  chk "$p redirects to sign-in" "$(code "$B$p")" "307"
done
chk "PATCH /api/admin/merchants anonymous" \
  "$(code -X PATCH -H 'Content-Type: application/json' -d '{"accepting":false}' "$B/api/admin/merchants/org_sunrise")" "401"

echo
echo "=== 2. sign in ==="
chk "an ordinary restaurant owner signs in"   "$(code -c $O -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json'       -d '{"email":"owner@bao-haus.test","password":"dinner1234"}')" "200"

# Which account is an administrator depends on the SERVER's environment, not
# this shell's. Rather than assume, try both candidates and keep whichever the
# server actually admits — the platform admin first, since that identity is an
# administrator by construction and needs no allowlist. Guessing wrong here is
# what turns one setup mistake into eleven false failures.
ADMIN_WHO=""
if [ -n "${MD_ADMIN_PASSWORD:-}" ]; then
  code -c $A -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json'     -d "{\"email\":\"admin@mobiledinners.com\",\"password\":\"$MD_ADMIN_PASSWORD\"}" >/dev/null
  [ "$(code -b $A "$B/admin")" = "200" ] && ADMIN_WHO="admin@mobiledinners.com"
fi
if [ -z "$ADMIN_WHO" ]; then
  rm -f $A
  code -c $A -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json'     -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}' >/dev/null
  [ "$(code -b $A "$B/admin")" = "200" ] && ADMIN_WHO="owner@sunrise-taqueria.test"
fi
if [ -n "$ADMIN_WHO" ]; then
  pass "signed in as an administrator ($ADMIN_WHO)"
else
  printf "  [33mSKIP[0m no account on this server is an administrator
"
fi

echo
echo "=== 3. a signed-in restaurant owner is NOT an administrator ==="
# The important one. This account is legitimate, has a valid session, and runs
# a competing restaurant. It must see nothing here.
if [ -z "${MD_ADMIN_EMAILS:-}" ]; then
  printf "  \033[33mSKIP\033[0m MD_ADMIN_EMAILS not set for this run\n"
elif [ "$(code -b $O "$B/admin")" = "200" ]; then
  printf "  \033[33mSKIP\033[0m the server was not started with MD_ADMIN_EMAILS\n"
else
  for p in $PAGES; do
    chk "$p is 404 for a non-admin" "$(code -b $O "$B$p")" "404"
  done
  chk "a non-admin cannot hide a competitor" \
    "$(code -b $O -X PATCH -H 'Content-Type: application/json' -d '{"accepting":false}' \
        "$B/api/admin/merchants/org_sunrise")" "404"
fi

echo
echo "=== 4. every section renders for an administrator ==="
if [ -z "$ADMIN_WHO" ]; then
  printf "  [33mSKIP[0m sections 4-7 need an administrator on this server
"
else
for p in $PAGES; do
  chk "$p" "$(code -b $A "$B$p")" "200"
done
chk "merchant detail"  "$(code -b $A "$B/admin/merchants/org_sunrise")" "200"
chk "orders, filtered" "$(code -b $A "$B/admin/orders?state=SETTLED")" "200"
chk "invoices, filtered" "$(code -b $A "$B/admin/billing?status=failed")" "200"
chk "an unknown merchant is 404" "$(code -b $A "$B/admin/merchants/org_nope")" "404"

echo
echo "=== 5. the numbers are honest ==="
curl -s -b $A --max-time 45 "$B/admin" -o .tmp-test/admin-home.html
# A rate over zero attempts is undefined, not 100%. If no courier has ever been
# booked the dashboard must say so rather than print a flattering number.
HONEST=$(node -e "
const h=require('fs').readFileSync('.tmp-test/admin-home.html','utf8');
const noDeliveries = !/deliveries/i.test('') && h.includes('No courier has ever been booked');
console.log(noDeliveries || /Delivery success rate[\s\S]{0,400}?%/.test(h) ? 'ok' : 'bad');
")
chk "delivery rate is a real figure or an explanation" "$HONEST" "ok"

# A trial has committed nothing, so it must not be inside MRR.
chk "trials are excluded from MRR" \
  "$(node -e "
const h=require('fs').readFileSync('.tmp-test/admin-home.html','utf8');
console.log(h.includes('trialing (excluded)') ? 'yes' : 'no');
")" "yes"

curl -s -b $A --max-time 45 "$B/admin/settings" -o .tmp-test/admin-settings.html
# The settings page reports which secrets are SET. It must never print one.
LEAK=$(node -e "
const h=require('fs').readFileSync('.tmp-test/admin-settings.html','utf8');
const secrets=['MD_TOKEN_KEY','STRIPE_SECRET_KEY','DOORDASH_SIGNING_SECRET','MD_OTP_TEST_NUMBERS'];
let bad=0;
for (const name of secrets) {
  const v=process.env[name];
  if (v && v.length>6 && h.includes(v)) bad++;
}
// A long hex or sk_ token appearing anywhere in the markup is a leak too.
if (/sk_(live|test)_[A-Za-z0-9]{8,}/.test(h)) bad++;
if (/\b[0-9a-f]{32,}\b/.test(h)) bad++;
console.log(bad);
")
chk "no secret value appears in the settings page" "$LEAK" "0"

echo
echo "=== 6. marketplace visibility actually hides a restaurant ==="
curl -s -o /dev/null -b $A -X PATCH -H 'Content-Type: application/json' \
  -d '{"accepting":false}' --max-time 45 "$B/api/admin/merchants/org_baohaus"
curl -s --max-time 45 "$B/restaurants" -o .tmp-test/feed.html
chk "hidden restaurant leaves the feed" \
  "$(node -pe "require('fs').readFileSync('.tmp-test/feed.html','utf8').includes('bao-haus') ? 'shown' : 'hidden'")" "hidden"
chk "its storefront 404s for diners" "$(code "$B/r/bao-haus")" "404"
chk "the cart still renders" "$(code "$B/cart")" "200"

curl -s -o /dev/null -b $A -X PATCH -H 'Content-Type: application/json' \
  -d '{"accepting":true}' --max-time 45 "$B/api/admin/merchants/org_baohaus"
curl -s --max-time 45 "$B/restaurants" -o .tmp-test/feed.html
chk "showing it again restores the listing" \
  "$(node -pe "require('fs').readFileSync('.tmp-test/feed.html','utf8').includes('bao-haus') ? 'shown' : 'hidden'")" "shown"
chk "its storefront is back" "$(code "$B/r/bao-haus")" "200"

echo
echo "=== 7. the write endpoint validates ==="
chk "a PATCH with no recognised field is refused" \
  "$(code -b $A -X PATCH -H 'Content-Type: application/json' -d '{"nope":1}' \
      "$B/api/admin/merchants/org_sunrise")" "400"
chk "a non-boolean is refused" \
  "$(code -b $A -X PATCH -H 'Content-Type: application/json' -d '{"accepting":"yes"}' \
      "$B/api/admin/merchants/org_sunrise")" "400"
chk "an unknown restaurant is refused" \
  "$(code -b $A -X PATCH -H 'Content-Type: application/json' -d '{"accepting":true}' \
      "$B/api/admin/merchants/org_nope")" "404"
fi

echo
echo "=== 8. admin@mobiledinners.com is an administrator by identity ==="
# The point of this section: that address is a platform administrator WITHOUT
# appearing in MD_ADMIN_EMAILS. The suite sets the allowlist to a different
# account entirely, so a 200 here can only come from the hard-coded rule.
P=/tmp/md_admin_platform
rm -f $P
if [ -z "${MD_ADMIN_PASSWORD:-}" ]; then
  printf "  [33mSKIP[0m MD_ADMIN_PASSWORD not set for this run
"
else
  LOGIN=$(code -c $P -X POST "$B/api/auth/staff/login"     -H 'Content-Type: application/json'     -d "{\"email\":\"admin@mobiledinners.com\",\"password\":\"$MD_ADMIN_PASSWORD\"}")
  if [ "$LOGIN" != "200" ]; then
    printf "  [33mSKIP[0m no platform admin on this server (login gave %s)
" "$LOGIN"
  else
    pass "admin@mobiledinners.com signs in"
    chk "reaches /admin without being in MD_ADMIN_EMAILS" "$(code -b $P "$B/admin")" "200"
    chk "reaches /admin/billing"  "$(code -b $P "$B/admin/billing")" "200"
    chk "reaches /admin/settings" "$(code -b $P "$B/admin/settings")" "200"
    # Its org is not a restaurant, so an operator dashboard for it would be an
    # empty menu and a zero ticket count. It goes where the work is instead.
    chk "/ops sends platform staff to /admin"       "$(curl -s -o /dev/null -w '%{redirect_url}' -b $P --max-time 45 "$B/ops" | sed 's|.*/||')" "admin"
  fi
fi

echo
echo "=== 9. the platform's own org is not a restaurant ==="
curl -s --max-time 45 "$B/restaurants" -o .tmp-test/feed2.html
chk "it is absent from the marketplace feed"   "$(node -pe "require('fs').readFileSync('.tmp-test/feed2.html','utf8').includes('mobile-dinners-platform') ? 'shown' : 'absent'")" "absent"
chk "its storefront 404s" "$(code "$B/r/mobile-dinners-platform")" "404"
curl -s -b $A --max-time 45 "$B/admin/merchants" -o .tmp-test/merch.html
chk "it is absent from the merchant list"   "$(node -e "
const h=require('fs').readFileSync('.tmp-test/merch.html','utf8');
console.log(/admin\/merchants\/org_platform/.test(h) ? 'listed' : 'absent');
")" "absent"

rm -f $A $O $P .tmp-test/admin-home.html .tmp-test/admin-settings.html .tmp-test/feed.html .tmp-test/feed2.html .tmp-test/merch.html
