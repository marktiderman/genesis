#!/usr/bin/env node
/**
 * check-export-prefixes.mjs: new exports follow the prefix rules (docs/FRAMEWORK.md, rule 7).
 * Reads only the export lines a pull request adds under packages/*\/src (tests aside), so
 * existing names stay; an added `build*`, `new*` or `make*` function or value fails, with the
 * prefix to use instead.
 *
 *   node scripts/check-export-prefixes.mjs --base <ref>
 *
 * Exit 0 clean or nothing to compare, 1 on a new export with a retired prefix.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const RETIRED = { build: "define* (a declaration) or to*/resolve* (a pure result)", new: "create* (an instance)", make: "create* (an instance) or define* (a declaration)" };
const EXPORT = /^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+((build|new|make)[A-Z][\w$]*)/;

/** Problems in a unified diff with zero context (`git diff -U0`). */
export function prefixProblems(diff) {
  const added = [];
  const removed = new Set();
  let file = null;
  for (const line of diff.split("\n")) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (!file || !/^packages\/[^/]+\/src\//.test(file) || /__tests__|\.test\.|\.stories\./.test(file)) continue;
    const m = EXPORT.exec(line.slice(1));
    if (!m) continue;
    if (line.startsWith("-")) removed.add(m[1]);
    else if (line.startsWith("+")) added.push({ file, name: m[1], prefix: m[2] });
  }
  // A changed or moved line of an existing export shows as removed and added: only a name that
  // wasn't there before is new.
  return added
    .filter((a) => !removed.has(a.name))
    .map((a) => `${a.file}: new export ${a.name} uses the retired prefix ${a.prefix}*; use ${RETIRED[a.prefix]} (docs/FRAMEWORK.md, rule 7)`);
}

function main(argv) {
  const at = argv.indexOf("--base");
  const base = at >= 0 ? argv[at + 1] : null;
  if (!base) {
    console.log("check-export-prefixes: no --base; nothing to compare.");
    return 0;
  }
  // `packages/*/src/*`: a pathspec glob matches the whole path, so `packages/*/src` alone matches no file.
  const diff = execFileSync("git", ["diff", "-U0", "--find-renames", base, "HEAD", "--", "packages/*/src/*"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const problems = prefixProblems(diff);
  for (const p of problems) console.error(`✗ ${p}`);
  if (!problems.length) console.log("✔ check-export-prefixes: new exports follow the prefix rules.");
  return problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
