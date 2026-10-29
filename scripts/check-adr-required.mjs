#!/usr/bin/env node
/**
 * check-adr-required.mjs: a pull request that adds a new noun to Genesis links an ADR
 * (docs/adr/TEMPLATE.md, governance "ADR path for new nouns and packages").
 *
 * Today it checks the one case a diff shows reliably: a new package folder (a
 * `packages/<name>/package.json` the base branch doesn't have). Such a pull request passes when
 * it adds an ADR itself (`docs/adr/NNNN-*.md`) or its body links one (`docs/adr/NNNN` or
 * `ADR NNNN`). New glossary terms and new subpath kinds join when the glossary is data (T7).
 *
 *   node scripts/check-adr-required.mjs [--base <ref>]   (PR_BODY from the environment)
 *
 * It compares HEAD with the base branch's tip (two dots), so it works on CI's shallow checkout
 * after fetching the base. Exit 0 clean or nothing to check, 1 when an ADR is missing.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** What the rule needs: the added paths, and whether the pull request names an ADR. */
export function adrProblems(added, body = "") {
  const packages = added.map((f) => /^packages\/([^/]+)\/package\.json$/.exec(f)?.[1]).filter(Boolean);
  if (!packages.length) return [];
  const addsAdr = added.some((f) => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(f));
  const linksAdr = /docs\/adr\/\d{4}|\bADR[ -]?\d{4}\b/i.test(body);
  if (addsAdr || linksAdr) return [];
  return packages.map(
    (p) => `packages/${p} is a new package: add an ADR (docs/adr/TEMPLATE.md) in this pull request, or link the one that accepted it in the description ("ADR 0012").`,
  );
}

/** A batch moving up (staging → main, prestage → staging) carries packages accepted lower down. */
export const isBatchHead = (head = "") => /^(staging|prestage)\//.test(head);

function main(argv) {
  const at = argv.indexOf("--base");
  if (at >= 0 && !argv[at + 1]) {
    console.error("check-adr-required: --base needs a ref.");
    return 1;
  }
  const base = at >= 0 ? argv[at + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null;
  if (!base) {
    console.log("check-adr-required: no base branch (not a pull request); nothing to check.");
    return 0;
  }
  if (isBatchHead(process.env.HEAD_REF)) {
    console.log(`check-adr-required: ${process.env.HEAD_REF} is a batch; its pull requests were checked on the way in.`);
    return 0;
  }
  // Renames are found explicitly, so a moved package folder is a rename, not a new package.
  const added = execFileSync("git", ["diff", "--name-only", "--find-renames", "--diff-filter=A", base, "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const problems = adrProblems(added, process.env.PR_BODY ?? "");
  for (const p of problems) console.error(`✗ ${p}`);
  if (!problems.length) console.log("✔ check-adr-required: every new noun links an ADR.");
  return problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
