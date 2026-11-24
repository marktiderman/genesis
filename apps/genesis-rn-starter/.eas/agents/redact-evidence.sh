#!/usr/bin/env bash
# Copies agent-output/evidence to agent-output/upload with the job's secret values replaced by
# [redacted] in every text file. The job uploads agent-output/upload only, so it fails closed:
# when this script fails, or never runs, nothing is uploaded.
#
#   bash /tmp/agentic-ci-tools/redact-evidence.sh
#
# The secrets: every variable of the job whose name has TOKEN, KEY, SECRET or PASSWORD in it
# (the agent's key, EXPO_TOKEN_SIMULATOR, GITHUB_TOKEN and your own) and the session's controller
# credentials (/tmp/session.json's remoteConfig, the values .env.eas-simulator held: simulator:stop
# empties that file before this runs), each value of 8 characters or more. Images and video (png, jpg, mp4, mov, webm), the session's own recording on
# expo.dev included, are copied as they are: nothing reads text out of them, so keep secrets off
# the screen (test logins only).
#
# Genesis template (templates/eas/agents/redact-evidence.sh).
set -euo pipefail

rm -rf agent-output/upload agent-output/.upload-tmp
[ -d agent-output/evidence ] || exit 0
node -e '
const fs = require("fs"), path = require("path");
const values = new Set();
for (const [name, value] of Object.entries(process.env)) {
  if (/TOKEN|KEY|SECRET|PASSWORD/i.test(name) && typeof value === "string") values.add(value);
}
const addStrings = (v) => {
  if (typeof v === "string") values.add(v);
  else if (v && typeof v === "object") Object.values(v).forEach(addStrings);
};
try { addStrings(JSON.parse(fs.readFileSync("/tmp/session.json", "utf8")).remoteConfig); } catch {}
const secrets = [...values].filter((v) => v.length >= 8).sort((a, b) => b.length - a.length);
const from = "agent-output/evidence", to = "agent-output/.upload-tmp";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const file of walk(from)) {
  const out = path.join(to, path.relative(from, file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (/\.(png|jpe?g|mp4|mov|webm)$/i.test(file)) { fs.copyFileSync(file, out); continue; }
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const v of secrets) if (text.includes(v)) { text = text.split(v).join("[redacted]"); changed = true; }
  fs.writeFileSync(out, text);
  if (changed) console.log(`Redacted a secret in ${file}`);
}
'
mv agent-output/.upload-tmp agent-output/upload
