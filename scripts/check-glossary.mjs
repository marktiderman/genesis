#!/usr/bin/env node
/**
 * check-glossary.mjs
 *
 * One word per concept. docs/GLOSSARY.md lists each term with the synonyms not to use for it
 * (its "Don't use" column). This reports where a banned synonym appears in a package
 * description (package.json) or a Markdown heading (READMEs and docs/).
 *
 * Warn mode: it prints what it finds and exits 0. `--strict` exits 1 on a finding, for when
 * the glossary is settled and old findings are fixed. With no docs/GLOSSARY.md it says so and
 * exits 0.
 *
 * Only plain synonyms are checked. One with a qualifier in parentheses ("service (as a kind)",
 * "primitive (for UI)", "primitive" for UI atoms) depends on context, so it is left to review;
 * a quoted one on its own is checked as the quoted phrase.
 *
 * Usage: node scripts/check-glossary.mjs [--strict] [--root <dir>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Splits a "Don't use" cell on commas outside parentheses and quotes. */
function splitCell(cell) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of cell) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0 && !quoted) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/\.$/, "").replace(/^and /, "").trim()).filter(Boolean);
}

/** The banned synonyms in a glossary, each with the term to use instead. */
export function bannedTerms(markdown) {
  const banned = [];
  let dontUse = -1;
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) {
      dontUse = -1;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const header = cells.findIndex((c) => /^don['’]t use$/i.test(c));
    if (header >= 0) {
      dontUse = header;
      continue;
    }
    if (dontUse < 0 || /^-+$/.test(cells[0] ?? "")) continue;
    const term = (cells[0] ?? "").replace(/\*\*/g, "").replace(/`/g, "").trim();
    for (const raw of splitCell(cells[dontUse] ?? "")) {
      const quote = raw.match(/^"([^"]+)"$/);
      if (quote) banned.push({ word: quote[1].toLowerCase(), term });
      else if (!raw.includes("(") && !raw.includes("`") && /^[a-z][a-z -]*$/i.test(raw)) banned.push({ word: raw.toLowerCase(), term });
    }
  }
  return banned;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The banned synonyms a piece of text contains, as whole words. */
export function findBanned(text, banned) {
  const lower = text.toLowerCase();
  return banned.filter(({ word }) => new RegExp(`(^|[^a-z0-9-])${escape(word)}($|[^a-z0-9-])`).test(lower));
}

function main(argv) {
  const strict = argv.includes("--strict");
  const rootAt = argv.indexOf("--root");
  const root = rootAt >= 0 ? argv[rootAt + 1] : process.cwd();
  const glossaryFile = join(root, "docs/GLOSSARY.md");
  if (!existsSync(glossaryFile)) {
    console.log("check-glossary: no docs/GLOSSARY.md yet; nothing to check.");
    return 0;
  }
  const banned = bannedTerms(readFileSync(glossaryFile, "utf8"));
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const findings = [];
  for (const file of files) {
    if (file.startsWith(".github/") || file.includes("__fixtures__")) continue;
    if (/(^|\/)package\.json$/.test(file)) {
      const { description } = JSON.parse(readFileSync(join(root, file), "utf8"));
      if (typeof description !== "string") continue;
      for (const b of findBanned(description, banned)) findings.push(`${file} description: "${b.word}" (use ${b.term})`);
    } else if (/\.md$/.test(file) && (file.startsWith("docs/") || /(^|\/)README\.md$/.test(file)) && !/(CHANGELOG|GLOSSARY|MIGRATION)\.md$/.test(file)) {
      readFileSync(join(root, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/^#{1,6} /.test(line)) return;
          for (const b of findBanned(line.replace(/^#+ /, ""), banned)) findings.push(`${file}:${i + 1} heading: "${b.word}" (use ${b.term})`);
        });
    }
  }
  for (const f of findings) console.warn(`! ${f}`);
  console.log(`check-glossary (${strict ? "strict" : "warn mode"}): ${banned.length} banned synonyms, ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
  return strict && findings.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
