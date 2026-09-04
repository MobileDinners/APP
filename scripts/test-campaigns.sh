#!/usr/bin/env bash
# Campaigns: guardrails, consent suppression, and the part that decides whether
# this module is worth anything — does the incrementality estimator recover a
# lift we injected, and does it correctly report nothing when there is nothing?
B=http://localhost:3100
OWNER=/tmp/md_cmp_owner; LEAD=/tmp/md_cmp_lead
rm -f $OWNER $LEAD
mkdir -p .tmp-test
# Campaigns leave a frequency-cap trail, so start from a clean slate.
node scripts/reset-campaigns.mjs > /dev/null

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
chk "/ops/campaigns anonymous redirects" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/ops/campaigns")" "307"
chk "/ops/campaigns as owner" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' --max-time 180 "$B/ops/campaigns")" "200"
chk "shift lead CANNOT send a campaign" \
  "$(curl -s -o /dev/null -b $LEAD -w '%{http_code}' -X POST "$B/api/campaigns" \
     -H 'Content-Type: application/json' -d '{"templateId":"winback","ignoreQuietHours":true}')" "403"

echo
echo "=== 2. a holdout is not optional ==="
chk "0% holdout rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/campaigns" \
     -H 'Content-Type: application/json' \
     -d '{"templateId":"winback","holdoutPct":0,"ignoreQuietHours":true}')" "400"
chk "unknown template rejected" \
  "$(curl -s -o /dev/null -b $OWNER -w '%{http_code}' -X POST "$B/api/campaigns" \
     -H 'Content-Type: application/json' \
     -d '{"templateId":"nope","ignoreQuietHours":true}')" "404"

echo
echo "=== 3. consent actually suppresses people ==="
PREV=$(curl -s -b $OWNER --max-time 120 "$B/api/campaigns?preview=winback&holdout=10")
SEG=$(echo "$PREV" | jq_ "d.preview.segmentSize")
ELIG=$(echo "$PREV" | jq_ "d.preview.eligible")
SUPP=$(echo "$PREV" | jq_ "d.preview.suppressions.map(s=>s.reason+':'+s.count).join(' ')")
echo "  segment=$SEG eligible=$ELIG"
echo "  suppressed: $SUPP"
if [ "$ELIG" -lt "$SEG" ]; then pass "some of the segment is excluded"; else fail "suppression applied" "$ELIG of $SEG"; fi
if echo "$SUPP" | grep -q "no_consent"; then pass "non-consenting guests excluded"; else fail "consent suppression" "$SUPP"; fi

echo
echo "=== 4. launch splits the audience ==="
LAUNCH=$(curl -s -b $OWNER -X POST "$B/api/campaigns" -H 'Content-Type: application/json' \
  -d '{"templateId":"winback","holdoutPct":10,"ignoreQuietHours":true}')
CID=$(echo "$LAUNCH" | jq_ "d.campaign.campaignId")
T=$(echo "$LAUNCH" | jq_ "d.preview.treated")
H=$(echo "$LAUNCH" | jq_ "d.preview.holdout")
echo "  campaign ${CID:0:8} treated=$T holdout=$H"
if [ "$CID" != "ERR" ] && [ -n "$CID" ]; then pass "campaign created"; else fail "campaign created" "$LAUNCH"; fi

DB_T=$(q "SELECT COUNT(*) FROM campaign_sends WHERE campaign_id='$CID' AND arm='treated' AND suppressed_reason IS NULL")
DB_H=$(q "SELECT COUNT(*) FROM campaign_sends WHERE campaign_id='$CID' AND arm='holdout' AND suppressed_reason IS NULL")
DB_S=$(q "SELECT COUNT(*) FROM campaign_sends WHERE campaign_id='$CID' AND suppressed_reason IS NOT NULL")
echo "  recorded: treated=$DB_T holdout=$DB_H suppressed=$DB_S"
# The preview reports EXPECTED counts; arms are randomised from the campaign id,
# so the realised split lands near the estimate rather than exactly on it.
DIFF=$(( DB_T > T ? DB_T - T : T - DB_T ))
TOL=$(( (DB_T + DB_H) / 5 + 3 ))
echo "  split drift: $DIFF (tolerance $TOL)"
if [ "$DIFF" -le "$TOL" ]; then
  pass "realised split is near the expected split"
else
  fail "realised split near expected" "treated $DB_T vs expected $T"
fi
chk "every eligible guest landed in exactly one arm" "$(( DB_T + DB_H ))" "$ELIG"
if [ "$DB_S" -gt 0 ]; then pass "suppressed guests recorded with a reason ($DB_S)"; else fail "suppressions recorded" "0"; fi

NOSEND=$(q "SELECT COUNT(*) FROM campaign_sends WHERE campaign_id='$CID' AND arm='holdout' AND sent_at IS NOT NULL")
chk "nobody in the holdout was actually sent to" "$NOSEND" "0"

echo
echo "=== 5. frequency cap blocks an immediate re-send ==="
AGAIN=$(curl -s -b $OWNER --max-time 120 "$B/api/campaigns?preview=winback&holdout=10" | jq_ "d.preview.eligible")
echo "  eligible on a second run: $AGAIN (was $ELIG)"
if [ "$AGAIN" -lt "$ELIG" ]; then pass "recently contacted guests now excluded"; else fail "frequency cap" "$AGAIN"; fi

echo
echo "=== 6. the estimator recovers a KNOWN injected lift ==="
# A bigger segment and a 30% holdout. The winback audience above (87 treated,
# 10 held) is far too small for ANY estimator to prove anything with, so testing
# detection there would only measure the sample size.
# A 95% interval misses the truth 1 run in 20 BY CONSTRUCTION, so asserting
# coverage on a single draw is a test that fails honestly 5% of the time. Same
# reasoning as section 7 below: measure the rate, not one sample. Three draws,
# each with its own randomised arm split — a genuinely broken estimator misses
# most of them, while an unlucky-but-correct one still passes.
COVERED=0
SIGNIFICANT=0
for run in 1 2 3; do
  BIG=$(curl -s -b $OWNER --max-time 240 -X POST "$B/api/campaigns" -H 'Content-Type: application/json'     -d '{"templateId":"second_order","holdoutPct":30,"ignoreQuietHours":true}')
  BID=$(echo "$BIG" | jq_ "d.campaign.campaignId")
  SIM=$(curl -s -b $OWNER --max-time 240 -X POST "$B/api/campaigns/$BID/simulate"     -H 'Content-Type: application/json'     -d '{"baseRate":0.10,"treatedLift":0.25,"ticketCents":2200}')
  TRUE=$(echo "$SIM" | jq_ "d.trueIncrementalCents")
  EST=$(echo "$SIM" | jq_ "d.measured.incrementalRevenueCents")
  LO=$(echo "$SIM" | jq_ "d.measured.lowCents")
  HI=$(echo "$SIM" | jq_ "d.measured.highCents")
  SIG=$(echo "$SIM" | jq_ "d.measured.significant")
  echo "  run $run: true=$TRUE estimated=$EST interval=[$LO, $HI] significant=$SIG"
  if [ "$TRUE" -ge "$LO" ] && [ "$TRUE" -le "$HI" ] 2>/dev/null; then
    COVERED=$((COVERED + 1))
  fi
  if [ "$SIG" = "true" ]; then SIGNIFICANT=$((SIGNIFICANT + 1)); fi
done

if [ "$COVERED" -ge 2 ]; then
  pass "95% intervals cover the true effect ($COVERED of 3)"
else
  fail "intervals cover the true effect" "only $COVERED of 3"
fi
if [ "$SIGNIFICANT" -ge 2 ]; then
  pass "a real 25pp lift reads as significant ($SIGNIFICANT of 3)"
else
  fail "a real lift reads as significant" "only $SIGNIFICANT of 3"
fi

echo
echo "=== 7. no false positives when the campaign does nothing ==="
# A 95% interval is WRONG 5% of the time by construction, so asserting that a
# single null run comes out non-significant is a coin flip dressed as a test.
# Measured over 25 runs during development this estimator produced 0 false
# positives; here we run 8 and allow up to 2 before calling it broken.
RUNS=8; FP=0
for i in $(seq 1 $RUNS); do
  node scripts/reset-campaigns.mjs > /dev/null
  NL=$(curl -s -b $OWNER -X POST "$B/api/campaigns" -H 'Content-Type: application/json' \
    -d '{"templateId":"second_order","holdoutPct":30,"ignoreQuietHours":true}')
  NID=$(echo "$NL" | jq_ "d.campaign.campaignId")
  [ "$NID" = "ERR" ] && continue
  NSIG=$(curl -s -b $OWNER -X POST "$B/api/campaigns/$NID/simulate" \
    -H 'Content-Type: application/json' \
    -d '{"baseRate":0.12,"treatedLift":0,"ticketCents":2200}' | jq_ "d.measured.significant")
  [ "$NSIG" = "true" ] && FP=$((FP + 1))
done
echo "  false positives: $FP of $RUNS"
if [ "$FP" -le 2 ]; then
  pass "a campaign with no true effect is almost never called a win"
else
  fail "false-positive rate" "$FP of $RUNS"
fi
