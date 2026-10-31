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
  "0d1c9373ac1681ac4525443ac86217b2eb12deec2a90a2e47fad1eaec224e91a",
  "50a949349c63896899821981b0cee30e3f0b61a37cb55a852aeb360f61cfba19",
  "8ca2101047362ac367ca21fcad6e438bc3bb0cc870b6edbecdd8e50068dc3808",
  "752115f45427e30c230603d78fa1bf560bfea9cc378e954dfd1f571540ddc184",
]);

const SKIP = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|pdf|zip|gz|mp4|mov|wasm)$/i;

const hash = (word) => createHash("sha256").update(word).digest("hex");
// Splits at camelCase (fooBar) and acronym-to-PascalCase (FOOBar) boundaries before lowercasing.
const words = (line) =>
  line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const seen = new Map();
const isBlocked = (word) => {
  let blocked = seen.get(word);
  if (blocked === undefined) seen.set(word, (blocked = BLOCKED.has(hash(word))));
  return blocked;
};
let found = 0;

// Every tracked path first, binaries included: a folder or file can name an app too.
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const path of paths) {
  if (words(path).some(isBlocked)) {
    console.error(`${path}: the path names an app or customer built on Genesis. Rename it.`);
    found++;
  }
}

const files = paths.filter((f) => !SKIP.test(f));
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // a deleted or unreadable path
  }
  if (text.includes("\0")) continue; // binary
  text.split("\n").forEach((line, i) => {
    // A lockfile's base64 integrity hash splits into chance words at its capitals.
    if (/\bintegrity:/.test(line)) return;
    for (const word of words(line)) {
      if (isBlocked(word)) {
        console.error(`${file}:${i + 1}: names an app or customer built on Genesis. Write "a consumer app" or a neutral sample name.`);
        found++;
        break;
      }
    }
  });
}
// `--commits <base>`: also the messages of the commits after <base> (a PR's), which a merge keeps for good.
const at = process.argv.indexOf("--commits");
if (at !== -1) {
  const base = process.argv[at + 1];
  if (!base) throw new Error("--commits needs a base, e.g. --commits origin/main");
  const log = execFileSync("git", ["log", "--format=%h%x00%B%x01", `${base}..HEAD`], { encoding: "utf8" });
  for (const entry of log.split("\x01")) {
    const [sha, message = ""] = entry.trim().split("\0");
    if (sha && words(message).some(isBlocked)) {
      console.error(`commit ${sha}: its message names an app or customer built on Genesis. Reword it before it reaches main.`);
      found++;
    }
  }
}

if (found) {
  console.error(`\ncheck-private-names: ${found} line(s). Genesis is public; see the header of scripts/check-private-names.mjs.`);
  process.exit(1);
}
console.log(`check-private-names: ${files.length} files, clean.`);
