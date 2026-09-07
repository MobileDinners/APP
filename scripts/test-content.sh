#!/usr/bin/env bash
# Editable header and footer copy — /ops/content and /api/site-content.
#
# The header and footer render on every page of the site, which makes the link
# list the single most valuable place to plant a hostile URL. Most of what is
# below is therefore about what the endpoint REFUSES, not what it accepts.
#
#   MD_TEST_BASE=http://localhost:3102 npm run test:content
B=${MD_TEST_BASE:-http://localhost:3100}
A=/tmp/md_content_admin
O=/tmp/md_content_other
rm -f $A $O

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
put()  { curl -s -o /dev/null -w '%{http_code}' --max-time 30 -b $A -X PUT \
           -H 'Content-Type: application/json' -d "$1" "$B/api/site-content"; }

# A valid payload, used as the base for the rejection cases below.
REST='"footerColumns":[],"footerTagline":"In-store prices.","footerNote":"Note.","companyName":"Mobile Dinners, Inc."'
OK_NAV='[{"href":"/","label":"Home"}]'

echo "=== 1. anonymous callers get nothing ==="
chk "GET /api/site-content anonymous" "$(code "$B/api/site-content")" "401"
chk "PUT /api/site-content anonymous" \
    "$(code -X PUT -H 'Content-Type: application/json' -d '{}' "$B/api/site-content")" "401"
chk "DELETE /api/site-content anonymous" \
    "$(code -X DELETE "$B/api/site-content")" "401"

echo
echo "=== 2. sign in ==="
chk "admin signs in" \
  "$(code -c $A -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
      -d '{"email":"owner@sunrise-taqueria.test","password":"dinner1234"}')" "200"
chk "a second restaurant's owner signs in" \
  "$(code -c $O -X POST "$B/api/auth/staff/login" -H 'Content-Type: application/json' \
      -d '{"email":"owner@bao-haus.test","password":"dinner1234"}')" "200"
chk "admin can open the editor" "$(code -b $A "$B/ops/content")" "200"

# The allowlist lives in the SERVER's environment, not this shell's — exporting
# it here proves nothing on its own. Start the server with it AND set the same
# value for the run, so the suite knows to assert:
#   MD_ADMIN_EMAILS="owner@sunrise-taqueria.test" npm run dev
#   MD_ADMIN_EMAILS="owner@sunrise-taqueria.test" npm run test:content
# Unset, any staff may edit outside production, which is what keeps the feature
# usable on a laptop without ceremony.
echo
echo "=== 3. the platform-admin allowlist ==="
if [ -z "${MD_ADMIN_EMAILS:-}" ]; then
  printf "  \033[33mSKIP\033[0m MD_ADMIN_EMAILS not set for this run\n"
elif [ "$(code -b $O "$B/ops/content")" = "200" ]; then
  # Set here but the server admits everyone, so the server does not have it.
  # Say that plainly rather than reporting three false failures.
  printf "  \033[33mSKIP\033[0m the server was not started with MD_ADMIN_EMAILS\n"
else
  chk "an unlisted owner cannot open the editor" "$(code -b $O "$B/ops/content")" "404"
  chk "an unlisted owner cannot read the content" "$(code -b $O "$B/api/site-content")" "404"
  chk "an unlisted owner cannot write the content" \
      "$(code -b $O -X PUT -H 'Content-Type: application/json' -d '{}' "$B/api/site-content")" "404"
fi

echo
echo "=== 4. links may not leave the site ==="
# This is the one that matters. A footer link inherits the brand, the domain
# and the padlock, so an editor account must not be able to aim one off-site.
chk "https:// link refused"  "$(put "{\"headerNav\":[{\"href\":\"https://evil.example\",\"label\":\"Home\"}],$REST}")" "400"
chk "protocol-relative refused" "$(put "{\"headerNav\":[{\"href\":\"//evil.example\",\"label\":\"Home\"}],$REST}")" "400"
chk "javascript: refused"    "$(put "{\"headerNav\":[{\"href\":\"javascript:alert(1)\",\"label\":\"X\"}],$REST}")" "400"

echo
echo "=== 5. shape and bounds ==="
chk "empty header refused"   "$(put "{\"headerNav\":[],$REST}")" "400"
chk "blank label refused"    "$(put "{\"headerNav\":[{\"href\":\"/\",\"label\":\"   \"}],$REST}")" "400"
chk "over-long label refused" \
    "$(put "{\"headerNav\":[{\"href\":\"/\",\"label\":\"$(printf 'x%.0s' $(seq 1 60))\"}],$REST}")" "400"
chk "too many header links refused" \
    "$(put "{\"headerNav\":[$(for i in $(seq 1 9); do printf '{"href":"/","label":"L%d"},' "$i"; done | sed 's/,$//')],$REST}")" "400"
chk "blank company name refused" \
    "$(put "{\"headerNav\":$OK_NAV,\"footerColumns\":[],\"footerTagline\":\"t\",\"footerNote\":\"n\",\"companyName\":\"\"}")" "400"

echo
echo "=== 6. the claims filter still applies ==="
chk "allergen claim blocks the save" \
    "$(put "{\"headerNav\":$OK_NAV,\"footerColumns\":[],\"footerTagline\":\"Everything here is gluten-free.\",\"footerNote\":\"n\",\"companyName\":\"MD\"}")" "422"
chk "health claim blocks the save" \
    "$(put "{\"headerNav\":$OK_NAV,\"footerColumns\":[],\"footerTagline\":\"Our food boosts your immune system.\",\"footerNote\":\"n\",\"companyName\":\"MD\"}")" "422"

# A delivery promise is a warning, not a block: a funded promotion is a real
# thing to run. It has to be visible, though, not drift into the footer.
WARN=$(curl -s --max-time 30 -b $A -X PUT -H 'Content-Type: application/json' \
  -d "{\"headerNav\":$OK_NAV,\"footerColumns\":[],\"footerTagline\":\"Free delivery on every order.\",\"footerNote\":\"n\",\"companyName\":\"MD\"}" \
  "$B/api/site-content" | node -pe "JSON.parse(require('fs').readFileSync(0)).claims.filter(c=>c.severity==='warn').length")
chk "a free-delivery promise saves but warns" "$WARN" "1"

echo
echo "=== 7. a save reaches the live site ==="
mkdir -p .tmp-test
curl -s -o /dev/null --max-time 30 -b $A -X PUT -H 'Content-Type: application/json' -d '{
  "headerNav":[{"href":"/","label":"Home"},{"href":"/restaurants","label":"Restaurants"},{"href":"/support","label":"Support Desk"}],
  "footerColumns":[{"heading":"Order","links":[{"href":"/restaurants","label":"All restaurants"}]}],
  "footerTagline":"Edited by the content suite.",
  "footerNote":"Suite note.",
  "companyName":"Suite Test Co."}' "$B/api/site-content"

curl -s --max-time 30 "$B/" -o .tmp-test/content-home.html
HITS=$(node -e "
const h=require('fs').readFileSync('.tmp-test/content-home.html','utf8');
console.log([
  />Support Desk</.test(h),
  h.includes('Edited by the content suite.'),
  h.includes('Suite Test Co.'),
  // About Us is a nav label and nothing else on this page, so its absence
  // proves the nav was replaced. How It Works would not, because the homepage
  // has a section by that name unrelated to the header.
  !/>About Us</.test(h),
].filter(Boolean).length);
")
chk "the edit renders in the header and footer" "$HITS" "4"

echo
echo "=== 8. reset restores the copy that ships in the repo ==="
chk "DELETE clears the override" "$(code -b $A -X DELETE "$B/api/site-content")" "200"
curl -s --max-time 30 "$B/" -o .tmp-test/content-home.html
BACK=$(node -e "
const h=require('fs').readFileSync('.tmp-test/content-home.html','utf8');
console.log([
  />How It Works</.test(h),
  h.includes('one points wallet that works at'),
  h.includes('Mobile Dinners, Inc.'),
  !/>Support Desk</.test(h),
].filter(Boolean).length);
")
chk "defaults are back on the live page" "$BACK" "4"

rm -f $A $O .tmp-test/content-home.html
