#!/usr/bin/env node
/**
 * check-industry-words.mjs
 *
 * The site builder's core never names an industry: its engine, sections, schemas, defaults,
 * examples, docs and tests read naturally for any business. Industry wording lives only in
 * template content (`packages/sites/src/templates/`). The word list, the folders it covers and
 * the exemptions are in scripts/industry-words.mjs.
 *
 * Every tracked text file under SCOPE (less EXEMPT) is split into words, on punctuation and at
 * camelCase boundaries, lowercased, and each word (and its singular, for "-s" and "-es") is
 * compared with the list. Paths are checked too. A line ending in `industry-words: allow` is
 * skipped; give the reason after it.
 *
 * Usage: node scripts/check-industry-words.mjs (exit 1 on a match, with file:line and the word).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXEMPT, SCOPE, WORDS } from "./industry-words.mjs";

const BLOCKED = new Map(Object.entries(WORDS).flatMap(([industry, words]) => words.map((w) => [w, industry])));
// SVG is text and can carry words (a title, an id), so it is read like any other file.
const SKIP = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|mp4|mov|wasm)$/i;
const ALLOW = /industry-words: allow\b/;

const words = (line) =>
  line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** The industry a word names, or undefined: the word itself, or its singular. */
const industryOf = (word) =>
  BLOCKED.get(word) ??
  (word.endsWith("es") ? BLOCKED.get(word.slice(0, -2)) : undefined) ??
  (word.endsWith("s") ? BLOCKED.get(word.slice(0, -1)) : undefined);

const exempt = (path) => Object.keys(EXEMPT).some((e) => (e.endsWith("/") ? path.startsWith(e) : path === e));
// Paths are from the repo root, wherever this runs from.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const paths = execFileSync("git", ["ls-files", "-z", "--", ...SCOPE], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((p) => p && !exempt(p));

let found = 0;
const report = (where, word) => {
  console.error(`${where}: "${word}" names an industry (${industryOf(word)}). Use neutral wording, or move it into a template under packages/sites/src/templates/.`);
  found++;
};

for (const path of paths) {
  const hit = words(path).find(industryOf);
  if (hit) report(path, hit);
  if (SKIP.test(path)) continue;
  let text;
  try {
    text = readFileSync(join(root, path), "utf8");
  } catch {
    continue; // deleted in the working tree
  }
  if (text.includes("\0")) continue;
  text.split("\n").forEach((line, i) => {
    if (ALLOW.test(line)) return;
    const word = words(line).find(industryOf);
    if (word) report(`${path}:${i + 1}`, word);
  });
}

if (found) {
  console.error(`\ncheck-industry-words: ${found} match(es). The word list and exemptions are in scripts/industry-words.mjs.`);
  process.exit(1);
}
console.log(`check-industry-words: ${paths.length} files, clean.`);
