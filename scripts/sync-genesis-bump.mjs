// The genesis-upgrade workflow and `genesis upgrade` share one bump: the workflow embeds
// packages/genesis-cli/src/upgrade/bump-core.mjs verbatim between its genesis-bump-core markers.
// `node scripts/sync-genesis-bump.mjs` rewrites the embedded copy; `--check` exits 1 when it drifted
// (scripts/__tests__/genesis-bump-sync.test.mjs runs the check in CI).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CORE = path.join(root, "packages/genesis-cli/src/upgrade/bump-core.mjs");
export const WORKFLOW = path.join(root, ".github/workflows/genesis-upgrade.yml");
const START = "// <genesis-bump-core>";
const END = "// </genesis-bump-core>";
const INDENT = "    ";

/** The workflow text with the core embedded between the markers. */
export function embed(workflow, core) {
  const s = workflow.indexOf(`${INDENT}${START}`);
  const e = workflow.indexOf(`${INDENT}${END}`);
  if (s < 0 || e < s) throw new Error(`${WORKFLOW} has no ${START} … ${END} block`);
  const startLine = workflow.indexOf("\n", s) + 1;
  const body = core
    .trimEnd()
    .split("\n")
    .map((l) => (l ? `${INDENT}${l}` : ""))
    .join("\n");
  return `${workflow.slice(0, startLine)}${body}\n${workflow.slice(e)}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const next = embed(workflow, readFileSync(CORE, "utf8"));
  if (process.argv.includes("--check")) {
    if (next !== workflow) {
      console.error("✗ .github/workflows/genesis-upgrade.yml's bump is out of date. Run node scripts/sync-genesis-bump.mjs.");
      process.exit(1);
    }
    console.log("✔ The workflow embeds the current bump-core.mjs.");
  } else if (next !== workflow) {
    writeFileSync(WORKFLOW, next);
    console.log("~ .github/workflows/genesis-upgrade.yml");
  } else console.log("✔ Up to date.");
}
