#!/usr/bin/env bash
# Runs every suite and reports one tally. Exits non-zero if anything failed.
set -o pipefail
OUT=$(mktemp)
for s in auth menu additem optimizer crm campaigns upsell site content admin customer pos payments delivery surfaces; do
  bash "scripts/test-$s.sh"
done | tee "$OUT"

P=$(grep -c "PASS" "$OUT")
F=$(grep -c "FAIL" "$OUT")
echo
echo "----------------------------------------"
printf "  %s passed, %s failed
" "$P" "$F"
echo "----------------------------------------"
rm -f "$OUT"
[ "$F" -eq 0 ]
