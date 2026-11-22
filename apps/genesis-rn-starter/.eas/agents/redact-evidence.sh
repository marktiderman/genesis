#!/usr/bin/env bash
# Removes the job's secret values from every text file in agent-output/evidence before it's
# uploaded: whatever the agent wrote or logged, no token leaves the job in the artifact.
#
#   bash .eas/agents/redact-evidence.sh
#
# The names are the ones Agentic CI's EAS environment holds; add any other secret yours has.
#
# Genesis template (templates/eas/agents/redact-evidence.sh).
set -uo pipefail

[ -d agent-output/evidence ] || exit 0
node -e '
const fs = require("fs"), path = require("path");
const names = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "EXPO_TOKEN_SIMULATOR", "EXPO_TOKEN", "GITHUB_TOKEN"];
const values = names.map((n) => process.env[n]).filter((v) => typeof v === "string" && v.length >= 8);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const file of walk("agent-output/evidence")) {
  if (/\.(png|jpe?g|mp4|mov|webm)$/i.test(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const v of values) if (text.includes(v)) { text = text.split(v).join("[redacted]"); changed = true; }
  if (changed) { fs.writeFileSync(file, text); console.log(`Redacted a secret in ${file}`); }
}
'
