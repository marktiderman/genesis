#!/usr/bin/env bash
# Runs the verdict program from .github/workflows/review-gate.yml (the jq between
# `VERDICT_JQ=$(cat <<'JQ'` and `JQ`) against review histories, the way the gate does:
# every review on the head → "time<TAB>verdict", sorted, the last one wins.
# Usage: bash scripts/review-gate-verdict.test.sh   (needs jq)
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
workflow="$root/.github/workflows/review-gate.yml"
program=$(awk '/VERDICT_JQ=\$\(cat <<'"'"'JQ'"'"'/{on=1; next} on && /^[[:space:]]*JQ[[:space:]]*$/{exit} on{print}' "$workflow")
if [ -z "$program" ]; then
  echo "Could not find the VERDICT_JQ program in $workflow" >&2
  exit 1
fi

HEAD_SHA=aaaa
pass=0
fail=0

# review <time> <state> <body> [author_association] [commit] [user type]
review() {
  jq -n --arg t "$1" --arg s "$2" --arg b "$3" --arg a "${4:-OWNER}" --arg c "${5:-$HEAD_SHA}" --arg u "${6:-User}" \
    '{submitted_at: $t, state: $s, body: $b, author_association: $a, commit_id: $c, user: {type: $u}}'
}

# expect <name> <expected verdict, "none" for no verdict> <review JSON objects…>
# The reviews are split over two pages, the way `gh api --paginate` prints them.
expect() {
  local name=$1 want=$2
  shift 2
  local all page1 page2 got
  all=$(printf '%s\n' "$@" | jq -s '.')
  page1=$(jq -c '.[:1]' <<< "$all")
  page2=$(jq -c '.[1:]' <<< "$all")
  got=$(printf '%s\n%s\n' "$page1" "$page2" | jq -r --arg head "$HEAD_SHA" "$program" | sort | tail -n 1 | cut -f 2)
  got=${got:-none}
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $name: wanted $want, got $got"
  fi
}

A=2026-11-01T10:00:00Z
B=2026-11-01T11:00:00Z

# Approves.
expect "plain approve" approve "$(review $A COMMENTED 'Verdict: approve')"
expect "bold heading approve" approve "$(review $A COMMENTED '## **Verdict: approve**')"
expect "approve after a heading" approve "$(review $A COMMENTED $'# Adversarial review\n\nVerdict: approve.')"
expect "approve as a list item" approve "$(review $A COMMENTED '- Verdict: approve')"
expect "approve mentioning earlier changes requested" approve "$(review $A COMMENTED $'Verdict: approve\n\nThe changes requested in round 2 are fixed.')"
expect "APPROVED state" approve "$(review $A APPROVED 'Looks good')"
expect "approve after an earlier changes" approve "$(review $A COMMENTED 'Verdict: changes requested')" "$(review $B COMMENTED 'Verdict: approve')"

# A later "changes requested" overrides an earlier approve, however it is written.
for body in \
  'Verdict: changes requested' \
  $'# Adversarial review\n\nVerdict: changes requested' \
  $'<!-- r -->\nVerdict: changes requested' \
  '- Verdict: changes requested' \
  '+ Verdict: changes requested' \
  '1. Verdict: changes requested' \
  '> **Verdict:** changes requested' \
  'Changes requested: see below' \
  $'Thanks.\n\nI have changes requested on the parser.'; do
  expect "later: $body" changes "$(review $A COMMENTED 'Verdict: approve')" "$(review $B COMMENTED "$body")"
done
expect "CHANGES_REQUESTED state" changes "$(review $A COMMENTED 'Verdict: approve')" "$(review $B CHANGES_REQUESTED 'nits')"
expect "approve and changes lines in one review" changes "$(review $A COMMENTED $'Verdict: approve\nVerdict: changes requested')"

# Unreadable verdicts never approve.
for body in 'Verdict: approve=false' 'Verdict: approved' 'Verdict: approve, but see below' 'Verdict - approve' 'Verdict: request changes'; do
  expect "unreadable: $body" unreadable "$(review $A COMMENTED "$body")"
done

# Ties fail closed.
expect "same-time tie" changes "$(review $A COMMENTED 'Verdict: approve')" "$(review $A COMMENTED 'Verdict: changes requested')"

# Ignored reviews.
expect "plain comment" none "$(review $A COMMENTED 'A question about line 3')"
expect "another head" none "$(review $A COMMENTED 'Verdict: approve' OWNER bbbb)"
expect "a bot" none "$(review $A COMMENTED 'Verdict: approve' OWNER "$HEAD_SHA" Bot)"
expect "dismissed" none "$(review $A DISMISSED 'Verdict: approve')"
expect "outsider approve" none "$(review $A COMMENTED 'Verdict: approve' NONE)"
expect "outsider changes after approve" approve "$(review $A COMMENTED 'Verdict: approve')" "$(review $B COMMENTED 'Verdict: changes requested' CONTRIBUTOR)"
expect "collaborator counts" changes "$(review $A COMMENTED 'Verdict: approve')" "$(review $B COMMENTED 'Verdict: changes requested' COLLABORATOR)"
expect "no reviews" none

echo "review-gate verdict: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
