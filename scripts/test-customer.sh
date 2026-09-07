#!/usr/bin/env bash
# Customer accounts — email and password alongside phone and code.
#
# The case that matters most is the MERGE: a diner who ordered by phone last
# week and registers properly today must be one customer with one order
# history, not two with none. Getting that wrong silently strips somebody's
# points and receipts, and nobody notices until they complain.
#
#   MD_TEST_BASE=http://localhost:3103 npm run test:customer
B=${MD_TEST_BASE:-http://localhost:3100}
S=$(date +%s)$RANDOM
A=/tmp/md_cust_a
M1=/tmp/md_cust_m1
M2=/tmp/md_cust_m2
rm -f $A $M1 $M2

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$1" "$2"; }
chk()  { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$@"; }
post() { curl -s -o /dev/null -w '%{http_code}' --max-time 45 -X POST "$B/api/auth/customer" -H 'Content-Type: application/json' -d "$1"; }

echo "=== 1. registration validates ==="
chk "a short password is refused" \
  "$(post "{\"name\":\"Short\",\"email\":\"s$S@example.com\",\"password\":\"abc\"}")" "400"
chk "a malformed email is refused" \
  "$(post "{\"name\":\"Bad\",\"email\":\"notanemail\",\"password\":\"GoodPassword1\"}")" "400"
chk "a missing name is refused" \
  "$(post "{\"name\":\"\",\"email\":\"n$S@example.com\",\"password\":\"GoodPassword1\"}")" "400"

echo
echo "=== 2. register, and be signed in immediately ==="
chk "registration succeeds" \
  "$(curl -s -o /dev/null -w '%{http_code}' -c $A --max-time 45 -X POST "$B/api/auth/customer" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"Ada Diner\",\"email\":\"ada$S@example.com\",\"password\":\"GoodPassword1\"}")" "201"
chk "the session is live straight away" "$(code -b $A "$B/api/auth/me")" "200"
chk "the account page renders" "$(code -b $A "$B/account")" "200"
chk "a second signup on the same email is refused" \
  "$(post "{\"name\":\"Copy\",\"email\":\"ada$S@example.com\",\"password\":\"AnotherPass1\"}")" "409"

echo
echo "=== 3. sign in with email and password ==="
put() { curl -s -o /dev/null -w '%{http_code}' --max-time 45 -X PUT "$B/api/auth/customer" -H 'Content-Type: application/json' -d "$1"; }
chk "a wrong password is refused" \
  "$(put "{\"email\":\"ada$S@example.com\",\"password\":\"wrong\"}")" "401"
chk "an unknown email is refused the same way" \
  "$(put "{\"email\":\"nobody$S@example.com\",\"password\":\"GoodPassword1\"}")" "401"
chk "the right password signs in" \
  "$(put "{\"email\":\"ada$S@example.com\",\"password\":\"GoodPassword1\"}")" "200"

echo
echo "=== 4. an anonymous visitor gets nothing ==="
chk "/account redirects when signed out" "$(code "$B/account")" "307"

echo
echo "=== 5. registering merges onto an existing phone account ==="
PH="+1415555$(printf '%04d' $((RANDOM % 10000)))"
CODE=$(curl -s --max-time 45 -X POST "$B/api/auth/otp/request" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PH\"}" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).devCode ?? ''}catch(e){''}")
if [ -z "$CODE" ]; then
  printf "  \033[33mSKIP\033[0m no devCode (production build) — cannot set up the phone account\n"
else
  curl -s -o /dev/null -c $M1 --max-time 45 -X POST "$B/api/auth/otp/verify" \
    -H 'Content-Type: application/json' -d "{\"phone\":\"$PH\",\"code\":\"$CODE\"}"
  PID1=$(curl -s -b $M1 --max-time 45 "$B/api/auth/me" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).session.personId}catch(e){'x'}")
  curl -s -o /dev/null -b $M1 --max-time 45 -X POST "$B/api/orders" -H 'Content-Type: application/json' \
    -H "Idempotency-Key: cust-merge-$S" \
    -d '{"orgId":"org_sunrise","fulfillment":"pickup","lines":[{"itemId":"it_chips","qty":1,"choiceIds":[],"notes":""}]}'
  N1=$(curl -s -b $M1 --max-time 45 "$B/api/orders" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).orders.length}catch(e){-1}")

  curl -s -o /dev/null -c $M2 --max-time 45 -X POST "$B/api/auth/customer" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Merged\",\"email\":\"merge$S@example.com\",\"password\":\"MergeTest2026\",\"phone\":\"$PH\"}"
  PID2=$(curl -s -b $M2 --max-time 45 "$B/api/auth/me" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).session.personId}catch(e){'y'}")
  N2=$(curl -s -b $M2 --max-time 45 "$B/api/orders" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).orders.length}catch(e){-2}")

  chk "it is the same person, not a second account" "$PID2" "$PID1"
  chk "their order history survives" "$N2" "$N1"
  chk "registering again on that phone is refused" \
    "$(post "{\"name\":\"Again\",\"email\":\"again$S@example.com\",\"password\":\"MergeTest2026\",\"phone\":\"$PH\"}")" "409"
fi

rm -f $A $M1 $M2
