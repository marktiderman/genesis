#!/usr/bin/env node
/**
 * check-private-names.mjs
 *
 * Genesis is public. The apps built on it, and their customers, are never named in this repo:
 * not in code, tests, docs, changelogs or generated files. Write "a consumer app" or "the app"
 * instead, and use neutral sample names (Acme, sample-app) in tests and examples.
 *
 * The names are kept here as SHA-256 hashes, so this file doesn't name them either. Every tracked
 * text file is split into words (on punctuation and at camelCase boundaries, lowercased) and each
 * word's hash is compared with the list.
 *
 * Add a name: `printf '%s' name | shasum -a 256`, lowercase, one word, and add the hash below.
 *
 * Usage: node scripts/check-private-names.mjs (exit 1 on a match, with file:line).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKED = new Set([
  "0fc81835634aede1b2298e116e7e8b47002e98b67db50e574074189358f42756",
  "f0da2349cc4699bc288012fb30f6fdea97b96ca098fa54e449d6d80f61661505",
  "74b451b085f0831fe7dbafb1aec0cccc23a066a00a774c126d4f9e1fbf8c26d8",
  "2142487324cdb6d8c5049bc331d48db21152f53ab33d0e4faaaa91ea79ba5f2d",
]);

const SKIP = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|pdf|zip|gz|mp4|mov|wasm)$/i;

const hash = (word) => createHash("sha256").update(word).digest("hex");
const words = (line) =>
  line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter((f) => f && !SKIP.test(f));
const seen = new Map();
let found = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // a deleted or unreadable path
  }
  if (text.includes("\0")) continue; // binary
  text.split("\n").forEach((line, i) => {
    for (const word of words(line)) {
      let blocked = seen.get(word);
      if (blocked === undefined) seen.set(word, (blocked = BLOCKED.has(hash(word))));
      if (blocked) {
        console.error(`${file}:${i + 1}: names an app or customer built on Genesis. Write "a consumer app" or a neutral sample name.`);
        found++;
        break;
      }
    }
  });
}
if (found) {
  console.error(`\ncheck-private-names: ${found} line(s). Genesis is public; see the header of scripts/check-private-names.mjs.`);
  process.exit(1);
}
console.log(`check-private-names: ${files.length} files, clean.`);
