/**
 * The ratchet: with `--base <ref>`, a ratcheted rule's findings in files that
 * haven't changed since the merge base drop to `info`, so new and changed code
 * meets the rule while old code waits its turn. A rule ratchets when it is
 * declared `newOnly` (package rules, app patterns) or the app sets
 * `doctor.ratchet` (`true`, or a list of rule ids). Without `--base` nothing
 * changes. Explicit `allow` entries stay the recorded ratchet: they still
 * remove findings, ratcheted or not, and under `--base` the list only shrinks
 * (`allow-grew`).
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { doctorBlock } from "./config.js";
import type { AllowEntry, DoctorConfig, FindingInput, Finding } from "./types.js";

function git(root: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

/**
 * App-relative paths changed since the merge base with `base`: committed on
 * this branch, staged, unstaged or untracked. Null when git can't tell (not a
 * repository, or the ref isn't there).
 */
export function changedSince(root: string, base: string): Set<string> | null {
  const mergeBase = git(root, ["merge-base", base, "HEAD"])?.trim();
  if (!mergeBase) return null;
  // -z: NUL-separated and never quoted, so a path with non-ASCII characters reads as itself.
  const committed = git(root, ["diff", "-z", "--name-only", "--relative", `${mergeBase}`, "--"]);
  const untracked = git(root, ["ls-files", "-z", "--others", "--exclude-standard"]);
  if (committed === null || untracked === null) return null;
  return new Set([...committed.split("\0"), ...untracked.split("\0")].filter(Boolean));
}

/**
 * The `allow` entries of a config file as it was at the merge base with `base`. Empty when the file
 * didn't exist there (adopting the doctor records the first list); null when git can't tell, or the
 * file there isn't JSON.
 */
export function allowAtBase(file: string, base: string, explicit: boolean): AllowEntry[] | null {
  const dir = path.dirname(file);
  const mergeBase = git(dir, ["merge-base", base, "HEAD"])?.trim();
  if (!mergeBase) return null;
  const at = `${mergeBase}:./${path.basename(file)}`;
  if (git(dir, ["cat-file", "-e", at]) === null) return [];
  const text = git(dir, ["show", at]);
  if (text === null) return null;
  try {
    const allow = (doctorBlock(JSON.parse(text), file, explicit) as { allow?: unknown } | undefined)?.allow;
    return Array.isArray(allow) ? (allow as AllowEntry[]) : [];
  } catch {
    return null;
  }
}

const allowKey = (a: Pick<AllowEntry, "rule" | "file" | "match">) => `${a.rule}\0${a.file ?? ""}\0${a.match ?? ""}`;

/** `allow-grew`: an `allow` entry (rule, file and match; a new reason is fine) the base config didn't have. */
export function allowGrew(allow: readonly AllowEntry[], before: readonly AllowEntry[], base: string): FindingInput[] {
  const had = new Set(before.map(allowKey));
  return allow
    .filter((a) => !had.has(allowKey(a)))
    .map((a) => ({
      rule: "allow-grew",
      file: a.file ?? "genesis config",
      subject: a.rule,
      message: `allow gained an entry for ${a.rule}${a.match ? ` (${a.match})` : ""} since ${base}; the list only shrinks, so fix what it hides instead`,
    }));
}

/** Whether a finding's file (or folder) changed: the path itself, or anything under it. */
function touched(file: string, changed: ReadonlySet<string>): boolean {
  if (changed.has(file)) return true;
  const prefix = file.endsWith("/") ? file : `${file}/`;
  for (const c of changed) if (c.startsWith(prefix)) return true;
  return false;
}

/**
 * Drop ratcheted findings in unchanged files to `info`. `newOnly` holds the
 * ids declared newOnly; `config.ratchet` adds more. Findings about something
 * other than a file in the app (a package, the config) are left alone, since
 * `scanned` says which paths are files.
 */
export function applyRatchet(
  findings: Finding[],
  options: { config: DoctorConfig; newOnly: ReadonlySet<string>; changed: ReadonlySet<string>; base: string; isAppPath: (file: string) => boolean },
): Finding[] {
  const { config, newOnly, changed, base, isAppPath } = options;
  const ratcheted = (rule: string) => config.ratchet === true || newOnly.has(rule) || (Array.isArray(config.ratchet) && config.ratchet.includes(rule));
  return findings.map((f) => {
    if (f.level === "info" || !ratcheted(f.rule) || !isAppPath(f.file) || touched(f.file, changed)) return f;
    return { ...f, level: "info", message: `${f.message} (ratcheted: unchanged since ${base})` };
  });
}
