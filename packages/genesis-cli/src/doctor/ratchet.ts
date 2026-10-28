/**
 * The ratchet: with `--base <ref>`, a ratcheted rule's findings in files that
 * haven't changed since the merge base drop to `info`, so new and changed code
 * meets the rule while old code waits its turn. A rule ratchets when it is
 * declared `newOnly` (package rules, app patterns) or the app sets
 * `doctor.ratchet` (`true`, or a list of rule ids). Without `--base` nothing
 * changes. Explicit `allow` entries stay the recorded ratchet: they still
 * remove findings, ratcheted or not.
 */
import { spawnSync } from "node:child_process";
import type { DoctorConfig, Finding } from "./types.js";

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
  const committed = git(root, ["diff", "--name-only", "--relative", `${mergeBase}`, "--"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  if (committed === null || untracked === null) return null;
  return new Set([...committed.split("\n"), ...untracked.split("\n")].map((l) => l.trim()).filter(Boolean));
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
