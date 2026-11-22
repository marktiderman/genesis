#!/usr/bin/env bash
# Runs the app's own Maestro flows on the Expo Simulators session that start-session.sh started,
# through agent-device (`test --maestro`; Expo Simulators doesn't run the Maestro CLI).
#
#   bash .eas/agents/run-maestro.sh <ios|android>
#
# The flows are the paths listed in .eas/agents/maestro-flows.txt, one per line, from the app's
# folder (# starts a comment); none listed, nothing runs. agent-device runs a subset of Maestro
# YAML: a flow using a command it lacks fails with that command's name (`npx agent-device help
# maestro` lists them). A flow's ${VAR}s come from AD_VAR_<VAR> in the job's environment (plain
# values only: never a secret). Each result goes to agent-output/evidence/maestro.md, which the agent reads.
#
# Genesis template (templates/eas/agents/run-maestro.sh).
set -uo pipefail

list=.eas/agents/maestro-flows.txt
[ -f "$list" ] || exit 0
out=agent-output/evidence/maestro.md
mkdir -p agent-output/evidence
printf '# Maestro flows\n\n' > "$out"
failed=0
while IFS= read -r flow || [ -n "$flow" ]; do
  flow="${flow%%#*}"
  flow="$(printf '%s' "$flow" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -n "$flow" ] || continue
  name="$(basename "$flow" .yaml)"
  log="agent-output/evidence/maestro-$name.log"
  if npx --yes eas-cli@27.11.0 simulator:exec npx --yes agent-device@0.21.41 test --maestro "$flow" --platform "$1" > "$log" 2>&1; then
    printf -- '- PASS %s\n' "$flow" >> "$out"
  else
    printf -- '- FAIL %s (see %s)\n' "$flow" "$(basename "$log")" >> "$out"
    failed=1
  fi
done < "$list"

if [ -f agent-output/device.md ]; then
  printf '\nThe Maestro flows already ran on this device: their results are in agent-output/evidence/maestro.md. Read it, and say in the verdict which failed.\n' >> agent-output/device.md
fi
exit "$failed"
