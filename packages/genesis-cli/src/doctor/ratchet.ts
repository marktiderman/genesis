/**
 * The ratchet: with `--base <ref>`, a ratcheted rule's findings in files that
 * haven't changed since the merge base drop to `info`, so new and changed code
 * meets the rule while old code waits its turn. A rule ratchets when it is
 * declared `newOnly` (package rules, app patterns) or the app sets
 * `doctor.ratchet` (`true`, or a list of rule ids). Without `--base` nothing
 * changes. Explicit `allow` entries stay the recorded ratchet: they still
 * remove findings, ratcheted or not, and under `--base` the list only shrinks
 * (`allow-grew`); `rules` and `packageRules` only tighten (`rules-weakened`).
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { doctorBlock, META_RULES } from "./config.js";
import type { AllowEntry, DoctorConfig, FindingInput, Finding, Level, PackageRuleSetting, RuleSetting } from "./types.js";

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

/** What the ratchet compares of a config file at the merge base. */
export interface BaseConfig {
  allow: AllowEntry[];
  rules: Record<string, RuleSetting>;
  packageRules: Record<string, PackageRuleSetting>;
}

const objectOr = <T>(v: unknown): T => (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {}) as T;

/**
 * The `allow`, `rules` and `packageRules` of a config file as it was at the merge base with `base`.
 * Empty when the file didn't exist there (adopting the doctor records the first list); null when git
 * can't tell, or the file there isn't JSON.
 */
export function configAtBase(file: string, base: string, explicit: boolean): BaseConfig | null {
  const dir = path.dirname(file);
  const mergeBase = git(dir, ["merge-base", base, "HEAD"])?.trim();
  if (!mergeBase) return null;
  const at = `${mergeBase}:./${path.basename(file)}`;
  if (git(dir, ["cat-file", "-e", at]) === null) return { allow: [], rules: {}, packageRules: {} };
  const text = git(dir, ["show", at]);
  if (text === null) return null;
  try {
    const block = objectOr<{ allow?: unknown; rules?: unknown; packageRules?: unknown }>(doctorBlock(JSON.parse(text), file, explicit));
    return {
      allow: Array.isArray(block.allow) ? (block.allow as AllowEntry[]) : [],
      rules: objectOr(block.rules),
      packageRules: objectOr(block.packageRules),
    };
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

const RANK: Record<RuleSetting, number> = { off: 0, info: 1, warn: 2, error: 3 };

/** A package rule's own globs, which a `packageRules` setting replaces. */
export interface RuleScope {
  files: readonly string[];
  exclude: readonly string[];
}

/**
 * `rules-weakened`: a rule `rules` or `packageRules` sets lower than it ran at the merge base, or a
 * package rule whose files the config narrowed since (a new `exclude` glob, or `files` that don't
 * cover the base's). `defaults` gives a rule's level when nothing sets it; when that's unknown, only
 * a new "off" or "info" counts.
 */
export function rulesWeakened(
  config: DoctorConfig,
  before: BaseConfig,
  base: string,
  defaults: (rule: string) => Level | undefined,
  scope: (rule: string) => RuleScope | undefined,
): FindingInput[] {
  const out: FindingInput[] = [];
  const levelIn = (c: Pick<DoctorConfig, "rules" | "packageRules">, rule: string) => c.rules?.[rule] ?? c.packageRules?.[rule]?.level;
  // The base's ids too: removing an entry that raised a rule lowers it back to its default.
  const ids = new Set([...Object.keys(config.rules ?? {}), ...Object.keys(config.packageRules ?? {}), ...Object.keys(before.rules), ...Object.keys(before.packageRules)]);
  for (const rule of ids) {
    const set = levelIn(config, rule) ?? defaults(rule);
    if (set === undefined) continue;
    const was = levelIn(before, rule) ?? defaults(rule);
    if (was === undefined ? set === "off" || set === "info" : RANK[set] < RANK[was]) {
      out.push({ rule: "rules-weakened", file: "genesis config", subject: rule, message: `${rule} ${levelIn(config, rule) === undefined ? "is back to its own level" : "is set to"} "${set}"${was ? `, lower than "${was}"` : ""} since ${base}; rules only tighten, so fix what it finds instead` });
    }
  }
  for (const [rule, setting] of Object.entries(config.packageRules ?? {})) {
    const own = scope(rule);
    if (!own) continue;
    const was = before.packageRules[rule];
    const files = setting.files ?? own.files;
    const wasFiles = new Set(was?.files ?? own.files);
    const wasExclude = new Set(was?.exclude ?? own.exclude);
    const narrowed = [...wasFiles].some((g) => !files.includes(g)) || (setting.exclude ?? own.exclude).some((g) => !wasExclude.has(g));
    if (narrowed) {
      out.push({ rule: "rules-weakened", file: "genesis config", subject: rule, message: `packageRules narrows the files ${rule} checks since ${base}; rules only tighten, so fix what it finds instead` });
    }
  }
  return out;
}

/** Whether a finding's file (or folder) changed: the path itself, or anything under it. */
function touched(file: string, changed: ReadonlySet<string>): boolean {
  if (changed.has(file)) return true;
  const prefix = file.endsWith("/") ? file : `${file}/`;
  for (const c of changed) if (c.startsWith(prefix)) return true;
  return false;
}

/**
 * Rules about the config, the packages or generated files rather than the app's code: never
 * lowered, whatever `ratchet` says. Their findings name a file (an `allow` entry's, a contract,
 * AGENTS.md) that an unchanged branch hasn't touched, so ratcheting them would hide them.
 */
const NEVER_RATCHETED = new Set([
  ...META_RULES,
  "stale-exception",
  "package-rule-override",
  "package-rules-invalid",
  "package-doctor-declaration",
  "plugin-error",
  "build",
  "agent-guide-stale",
  "contracts-stale",
]);

/**
 * Drop ratcheted findings in unchanged files to `info`. `newOnly` holds the
 * ids declared newOnly; `config.ratchet` adds more. Findings about something
 * other than a file in the app (a package, the config) are left alone, since
 * `isAppPath` says which paths are files, and so are the rules in NEVER_RATCHETED.
 */
export function applyRatchet(
  findings: Finding[],
  options: { config: DoctorConfig; newOnly: ReadonlySet<string>; changed: ReadonlySet<string>; base: string; isAppPath: (file: string) => boolean },
): Finding[] {
  const { config, newOnly, changed, base, isAppPath } = options;
  const ratcheted = (rule: string) => !NEVER_RATCHETED.has(rule) && (config.ratchet === true || newOnly.has(rule) || (Array.isArray(config.ratchet) && config.ratchet.includes(rule)));
  return findings.map((f) => {
    if (f.level === "info" || !ratcheted(f.rule) || !isAppPath(f.file) || touched(f.file, changed)) return f;
    return { ...f, level: "info", message: `${f.message} (ratcheted: unchanged since ${base})` };
  });
}
