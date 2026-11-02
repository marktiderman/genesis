/**
 * Bun's text lockfile (`bun.lock`): JSON with trailing commas. Two things go stale in it after an
 * upgrade, and `bun install` keeps both:
 *
 * - **A nested copy of a Genesis package.** `packages` keys a copy nested under another package as
 *   `<parent>/<name>` (`@marktiderman/genesis-native/@marktiderman/genesis-ui-native`). When a
 *   package used to depend on another Genesis package, the old version stays nested under it even
 *   after the app installs a newer one at the root, so the app runs two copies (two module
 *   instances: a provider from one is invisible to hooks from the other). Dropping the nested entry
 *   makes the next install resolve it again, from the root when the range allows.
 * - **A workspace that's gone.** An overlay `genesis upgrade` deleted (a vendored package now
 *   installed from npm) stays in `workspaces` and as a `name@workspace:<folder>` entry in
 *   `packages`, and `bun install` stops with "Workspace dependency not found".
 *
 * Edits remove whole members from the text, so everything else (order, formatting, hashes) stays
 * byte for byte. The binary `bun.lockb` isn't read.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { satisfies } from "../doctor/semver.js";

export const BUN_LOCK = "bun.lock";

const GENESIS_TAIL = /(?:^|\/)(@marktiderman\/genesis(?:-[a-z0-9-]+)?)$/;
const PLAIN_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;

interface Member {
  key: string;
  /** Index of the key's opening quote. */
  start: number;
  /** Index just past the value. */
  end: number;
  /** Index of the value's first character. */
  value: number;
}

/** Index past whitespace and comments. */
function skipSpace(text: string, i: number): number {
  for (;;) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl + 1;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
    } else return i;
  }
}

/** Index past the string starting at `i` (its opening quote). */
function skipString(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === '"') return j + 1;
  }
  throw new Error("an unterminated string");
}

/** Index past the value starting at `i`. */
function skipValue(text: string, i: number): number {
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === "{" || c === "[") {
    let depth = 0;
    for (let j = i; j < text.length; ) {
      const d = text[j]!;
      if (d === '"') {
        j = skipString(text, j);
        continue;
      }
      if (text.startsWith("//", j) || text.startsWith("/*", j)) {
        j = skipSpace(text, j);
        continue;
      }
      if (d === "{" || d === "[") depth++;
      else if (d === "}" || d === "]") {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    throw new Error("an unclosed object or array");
  }
  let j = i;
  while (j < text.length && !/[\s,}\]]/.test(text[j]!)) j++;
  if (j === i) throw new Error(`an unexpected ${JSON.stringify(c ?? "end")} at ${i}`);
  return j;
}

/** The members of the object whose `{` is at `open`. */
function members(text: string, open: number): Member[] {
  const out: Member[] = [];
  let i = skipSpace(text, open + 1);
  while (text[i] !== "}") {
    if (text[i] !== '"') throw new Error(`a key expected at ${i}`);
    const keyEnd = skipString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd)) as string;
    let j = skipSpace(text, keyEnd);
    if (text[j] !== ":") throw new Error(`":" expected at ${j}`);
    const value = skipSpace(text, j + 1);
    const end = skipValue(text, value);
    out.push({ key, start: i, end, value });
    j = skipSpace(text, end);
    if (text[j] === ",") j = skipSpace(text, j + 1);
    i = j;
    if (i >= text.length) throw new Error("an unclosed object");
  }
  return out;
}

/** The top-level member `name` whose value is an object, or null. */
function section(text: string, name: string): Member | null {
  const open = skipSpace(text, 0);
  if (text[open] !== "{") throw new Error("not an object");
  const m = members(text, open).find((x) => x.key === name);
  return m && text[m.value] === "{" ? m : null;
}

/** The JSON value of a bun.lock fragment (trailing commas allowed). */
function parseLoose(fragment: string): unknown {
  let out = "";
  for (let i = 0; i < fragment.length; ) {
    const c = fragment[i]!;
    if (c === '"') {
      const end = skipString(fragment, i);
      out += fragment.slice(i, end);
      i = end;
    } else if (c === ",") {
      const next = skipSpace(fragment, i + 1);
      if (fragment[next] !== "}" && fragment[next] !== "]") out += c;
      i++;
    } else if (fragment.startsWith("//", i) || fragment.startsWith("/*", i)) {
      i = skipSpace(fragment, i);
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out);
}

/** A `packages` entry's resolution (`name@version`, `name@workspace:folder`) split, or null. */
function resolution(value: unknown): { name: string; spec: string } | null {
  const first = Array.isArray(value) ? value[0] : null;
  if (typeof first !== "string") return null;
  const at = first.lastIndexOf("@");
  if (at <= 0) return null;
  return { name: first.slice(0, at), spec: first.slice(at + 1) };
}

/** A nested copy of a Genesis package whose version isn't the one the root has (or will have). */
export interface StaleNestedEntry {
  /** The `packages` key (`<parent>/<name>`). */
  key: string;
  name: string;
  /** The package it's nested under (its key in `packages`). */
  parent: string;
  version: string;
  /** The version at the root (or the one the upgrade moves the root to). */
  root: string;
  /** The parent's range for it, which `root` satisfies. */
  range: string;
}

/**
 * Nested Genesis copies in `text` (a bun.lock) that differ from the root's: the root entry's
 * version, or `want(name)` when given (the version an upgrade is moving the root to), when that
 * version satisfies the parent's range. A copy with no root entry is the only one, and one whose
 * parent's range the root can't meet is nested on purpose: neither is stale.
 */
export function staleNestedEntries(text: string, want: (name: string) => string | null | undefined = () => null): StaleNestedEntry[] {
  const packages = section(text, "packages");
  if (!packages) return [];
  const list = members(text, packages.value);
  const value = (m: Member) => parseLoose(text.slice(m.value, m.end));
  const byKey = new Map(list.map((m) => [m.key, m]));
  const out: StaleNestedEntry[] = [];
  for (const m of list) {
    const tail = GENESIS_TAIL.exec(m.key);
    if (!tail || tail[1] === m.key) continue;
    const name = tail[1]!;
    const nested = resolution(value(m));
    if (!nested || nested.name !== name || !PLAIN_VERSION.test(nested.spec)) continue;
    const rootEntry = byKey.get(name);
    const rootRes = rootEntry ? resolution(value(rootEntry)) : null;
    const target = want(name) ?? (rootRes && PLAIN_VERSION.test(rootRes.spec) ? rootRes.spec : null);
    if (!rootEntry || !target || target === nested.spec) continue;
    // Only when the root's version would do for the parent: a range it can't meet nests on purpose.
    const parent = m.key.slice(0, m.key.length - name.length - 1);
    const parentEntry = byKey.get(parent);
    const meta = parentEntry ? (value(parentEntry) as unknown[])[2] : undefined;
    const declared = meta && typeof meta === "object" ? (meta as Record<string, Record<string, unknown> | undefined>) : {};
    const range = ["dependencies", "peerDependencies", "optionalDependencies"].map((s) => declared[s]?.[name]).find((r): r is string => typeof r === "string");
    if (!range || satisfies(target, range) !== true) continue;
    out.push({ key: m.key, name, parent, version: nested.spec, root: target, range });
  }
  return out;
}

/** The `workspaces` keys and `packages` keys (with what's nested under them) for a workspace folder. */
export function workspaceEntries(text: string, folder: string): { workspaces: string[]; packages: string[] } {
  const rel = folder.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const ws = section(text, "workspaces");
  const workspaces = ws ? members(text, ws.value).filter((m) => m.key === rel).map((m) => m.key) : [];
  const pk = section(text, "packages");
  const packages: string[] = [];
  if (pk) {
    const list = members(text, pk.value);
    const names = list.filter((m) => resolution(parseLoose(text.slice(m.value, m.end)))?.spec === `workspace:${rel}`).map((m) => m.key);
    for (const m of list) if (names.some((n) => m.key === n || m.key.startsWith(`${n}/`))) packages.push(m.key);
  }
  return { workspaces, packages };
}

/** Removes the members named in `workspaces` and `packages` (and what's nested under a removed package), keeping the rest of the text as it is. */
export function removeBunLockEntries(text: string, remove: { workspaces?: readonly string[]; packages?: readonly string[] }): string {
  const spans: Array<[number, number]> = [];
  const drop = (name: "workspaces" | "packages", keys: readonly string[] | undefined, nested: boolean) => {
    if (!keys?.length) return;
    const s = section(text, name);
    if (!s) return;
    const list = members(text, s.value);
    list.forEach((m, k) => {
      if (!keys.some((key) => m.key === key || (nested && m.key.startsWith(`${key}/`)))) return;
      // The whole line: its indentation, the member, its comma, the newline.
      let start = m.start;
      while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
      let end = skipSpace(text, m.end);
      if (text[end] === ",") {
        end++;
        // Up to the end of the line, when only whitespace is left on it.
        let eol = end;
        while (eol < text.length && (text[eol] === " " || text[eol] === "\t")) eol++;
        if (text[eol] === "\n") end = eol + 1;
        else if (text.startsWith("\r\n", eol)) end = eol + 2;
      } else if (k > 0) {
        // The last member with no trailing comma: take the comma before it instead.
        start = list[k - 1]!.end;
        end = m.end;
      } else {
        // The only member, with no comma: the line goes.
        end = m.end;
        if (text[end] === "\n") end++;
      }
      spans.push([start, end]);
    });
  };
  drop("workspaces", remove.workspaces, false);
  drop("packages", remove.packages, true);
  if (!spans.length) return text;
  spans.sort((a, b) => a[0] - b[0]);
  let out = "";
  let at = 0;
  for (const [a, b] of spans) {
    if (a > at) out += text.slice(at, a);
    at = Math.max(at, b);
  }
  return out + text.slice(at);
}

/** The bun.lock in `dir`, or null (none, or only the binary bun.lockb). */
export function readBunLock(dir: string): string | null {
  const file = path.join(dir, BUN_LOCK);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}
