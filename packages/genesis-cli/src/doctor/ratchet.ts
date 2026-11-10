/**
 * The ratchet: with `--base <ref>`, a ratcheted rule's findings drop to `info`
 * unless they are new: in a file the merge base didn't have, or in a file that
 * now has more of that rule's findings than it had at the merge base. Editing a
 * file with old debt doesn't make the debt due; adding to it does. A rule
 * ratchets when it is declared `newOnly` (package rules, app patterns) or the
 * app sets `doctor.ratchet` (`true`, or a list of rule ids). Without `--base`
 * nothing changes. Explicit `allow` entries stay the recorded ratchet: they
 * still remove findings, ratcheted or not, and under `--base` the list only
 * shrinks (`allow-grew`); `rules` and `packageRules` only tighten
 * (`rules-weakened`). Declared extensions (`extend`) are neither: a new one is
 * reported as `info` (`extension-added`) so the pull request's review sees it.
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { doctorBlock, isPackageDeclaration, META_RULES } from "./config.js";
import { withText } from "./scan.js";
import type { SourceFile } from "./types.js";
import type { AllowEntry, DoctorConfig, ExtensionEntry, FindingInput, Finding, PackageRuleSetting, RuleSetting } from "./types.js";

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
  const mergeBase = mergeBaseOf(root, base);
  if (!mergeBase) return null;
  // -z: NUL-separated and never quoted, so a path with non-ASCII characters reads as itself.
  const committed = git(root, ["diff", "-z", "--name-only", "--relative", `${mergeBase}`, "--"]);
  const untracked = git(root, ["ls-files", "-z", "--others", "--exclude-standard"]);
  if (committed === null || untracked === null) return null;
  return new Set([...committed.split("\0"), ...untracked.split("\0")].filter(Boolean));
}

/**
 * Where each renamed, moved or copied file came from since the merge base with `base`: new path →
 * the path it had there (git's rename and copy detection, `-M -C`), so a move keeps its counts and
 * a split shares its origin's. Empty when git can't tell.
 */
export function originsSince(root: string, base: string): Map<string, string> {
  const out = new Map<string, string>();
  const mergeBase = mergeBaseOf(root, base);
  if (!mergeBase) return out;
  const diff = git(root, ["diff", "-z", "-M", "-C", "--name-status", "--relative", mergeBase, "--"]);
  if (diff === null) return out;
  const parts = diff.split("\0");
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++] ?? "";
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = parts[i++]!;
      const to = parts[i++]!;
      out.set(to, from);
    } else i++;
  }
  return out;
}

/** The merge base of `base` and HEAD, or null when git can't tell. */
export function mergeBaseOf(root: string, base: string): string | null {
  return git(root, ["merge-base", base, "HEAD"])?.trim() || null;
}

/** What the ratchet compares of a config file at the merge base. */
export interface BaseConfig {
  allow: AllowEntry[];
  extend: ExtensionEntry[];
  rules: Record<string, RuleSetting>;
  packageRules: Record<string, PackageRuleSetting>;
}

const objectOr = <T>(v: unknown): T => (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {}) as T;

/** A file as it was at `rev`, read from `dir`; undefined when it didn't exist there, null when git can't tell. */
export function showAt(dir: string, rev: string, file: string): string | null | undefined {
  const at = `${rev}:./${file}`;
  if (git(dir, ["cat-file", "-e", at]) === null) return undefined;
  return git(dir, ["show", at]);
}

/**
 * The doctor settings in effect at the merge base with `base`, found the way loadConfig finds them:
 * the explicit file, else genesis.config.json's `doctor`, else package.json's `genesis.doctor` (an
 * app's, not a package declaration). "absent" when there were none (adopting the doctor, or a config
 * new since the base: nothing to compare); null when git can't tell, or the file there isn't JSON.
 */
export function configAtBase(root: string, base: string, explicitFile?: string): BaseConfig | "absent" | null {
  const mergeBase = mergeBaseOf(root, base);
  if (!mergeBase) return null;
  const candidates = explicitFile
    ? [{ dir: path.dirname(explicitFile), file: path.basename(explicitFile), explicit: true }]
    : [
        { dir: root, file: "genesis.config.json", explicit: false },
        { dir: root, file: "package.json", explicit: false },
      ];
  for (const c of candidates) {
    const text = showAt(c.dir, mergeBase, c.file);
    if (text === null) return null;
    if (text === undefined) continue;
    let block: unknown;
    try {
      block = doctorBlock(JSON.parse(text), c.file, c.explicit);
    } catch {
      return null;
    }
    // genesis.config.json wins when it exists, as in loadConfig, even without a doctor block.
    if (block === undefined || (c.file === "package.json" && !c.explicit && isPackageDeclaration(block))) {
      if (c.file === "genesis.config.json") return "absent";
      continue;
    }
    const b = objectOr<{ allow?: unknown; extend?: unknown; rules?: unknown; packageRules?: unknown }>(block);
    return {
      allow: Array.isArray(b.allow) ? (b.allow as AllowEntry[]) : [],
      extend: Array.isArray(b.extend) ? (b.extend as ExtensionEntry[]) : [],
      rules: objectOr(b.rules),
      packageRules: objectOr(b.packageRules),
    };
  }
  return "absent";
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

/**
 * `extension-added` (warn): an extension the base config didn't have. Extensions don't count
 * against `allow-grew`; this one is what the pull request's review must read and accept.
 */
export function extensionsAdded(extend: readonly ExtensionEntry[], before: readonly ExtensionEntry[], base: string): FindingInput[] {
  const had = new Set(before.map((e) => `${e.rule}\0${e.file}\0${e.buildsOn}`));
  return extend
    .filter((e) => !had.has(`${e.rule}\0${e.file}\0${e.buildsOn}`))
    .map((e) => ({
      rule: "extension-added",
      level: "warn",
      file: e.file,
      subject: e.rule,
      message: `extends ${e.rule} since ${base}, building on ${e.buildsOn}: "${e.reason}"${e.upstream ? ` (upstream: ${e.upstream})` : ""}; the pull request's review accepts it, and it covers only the findings the file has now`,
    }));
}

const RANK: Record<RuleSetting, number> = { off: 0, info: 1, warn: 2, error: 3 };

/**
 * `rules-weakened`, comparing the app's config with the base's only (never with a rule's own
 * level, which a package upgrade may change): a rule the base config set and this config sets
 * lower, a rule newly set to "off", and an `exclude` glob a `packageRules` entry gained. A new
 * entry at any other level, or one for a renamed rule, isn't compared.
 */
export function rulesWeakened(config: DoctorConfig, before: BaseConfig, base: string): FindingInput[] {
  const out: FindingInput[] = [];
  const levelIn = (c: Pick<DoctorConfig, "rules" | "packageRules">, rule: string) => c.rules?.[rule] ?? c.packageRules?.[rule]?.level;
  const ids = new Set([...Object.keys(config.rules ?? {}), ...Object.keys(config.packageRules ?? {})]);
  for (const rule of ids) {
    const set = levelIn(config, rule);
    if (set === undefined) continue;
    const was = levelIn(before, rule);
    if (was === undefined ? set === "off" : RANK[set] < RANK[was]) {
      out.push({ rule: "rules-weakened", file: "genesis config", subject: rule, message: `${rule} is set to "${set}"${was ? `, lower than "${was}"` : ""} since ${base}; rules only tighten, so fix what it finds instead` });
    }
  }
  for (const [rule, setting] of Object.entries(config.packageRules ?? {})) {
    const had = new Set(before.packageRules[rule]?.exclude ?? []);
    const added = (setting.exclude ?? []).filter((g) => !had.has(g));
    if (added.length) {
      out.push({ rule: "rules-weakened", file: "genesis config", subject: rule, message: `packageRules excludes ${added.join(", ")} from ${rule} since ${base}; rules only tighten, so fix what it finds instead` });
    }
  }
  return out;
}

/** Whether a finding's file (or folder) changed: the path itself, or anything under it. */
export function touched(file: string, changed: ReadonlySet<string>): boolean {
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
  "stale-extension",
  "extension-added",
]);

/** Whether a rule ratchets: declared `newOnly`, or listed in `doctor.ratchet`, and not a rule about the config. */
export function isRatcheted(rule: string, config: DoctorConfig, newOnly: ReadonlySet<string>): boolean {
  return !NEVER_RATCHETED.has(rule) && (config.ratchet === true || newOnly.has(rule) || (Array.isArray(config.ratchet) && config.ratchet.includes(rule)));
}

/** The key `baseCounts` is keyed by: a file and a rule. */
export const countKey = (file: string, rule: string) => `${file}\0${rule}`;

/** How many findings each file has of each rule. */
export function countFindings(findings: readonly Pick<Finding, "file" | "rule">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(countKey(f.file, f.rule), (counts.get(countKey(f.file, f.rule)) ?? 0) + 1);
  return counts;
}

/**
 * Lower ratcheted findings to `info`. In a file unchanged since the merge base, always. In a
 * changed file, when `baseCounts` (the findings per file and rule at the merge base) is given and
 * the file existed there (`existedAtBase`), unless the file now has more findings of that rule than
 * it had: a count that grew, or a new file, keeps its level. Counts are per rule and file, so
 * fixing one finding and adding another of the same rule nets out. `originOf` maps a moved or
 * copied file to its path at the merge base: a rename keeps its count, and the files split from
 * one share its count. Without `baseCounts` (git couldn't
 * read the base) a changed file keeps every level. `newOnly` holds the ids declared newOnly;
 * `config.ratchet` adds more. Findings about something other than a file in the app (a package,
 * the config) are left alone, since `isAppPath` says which paths are files, and so are the rules
 * in NEVER_RATCHETED.
 */
export function applyRatchet(
  findings: Finding[],
  options: {
    config: DoctorConfig;
    newOnly: ReadonlySet<string>;
    changed: ReadonlySet<string>;
    base: string;
    isAppPath: (file: string) => boolean;
    baseCounts?: ReadonlyMap<string, number>;
    existedAtBase?: (file: string) => boolean;
    originOf?: (file: string) => string;
  },
): Finding[] {
  const { config, newOnly, changed, base, isAppPath, baseCounts, existedAtBase } = options;
  const originOf = options.originOf ?? ((f: string) => f);
  const counts = countFindings(findings.map((f) => ({ file: originOf(f.file), rule: f.rule })));
  return findings.map((f) => {
    if (f.level === "info" || !isRatcheted(f.rule, config, newOnly) || !isAppPath(f.file)) return f;
    if (!touched(f.file, changed)) return { ...f, level: "info", message: `${f.message} (ratcheted: unchanged since ${base})` };
    const origin = originOf(f.file);
    if (!baseCounts || !existedAtBase?.(origin)) return f;
    const now = counts.get(countKey(origin, f.rule)) ?? 0;
    const was = baseCounts.get(countKey(origin, f.rule)) ?? 0;
    const where = origin === f.file ? "this file" : `the files from ${origin}`;
    if (now > was) return { ...f, message: `${f.message} (${now} ${f.rule} findings in ${where}, ${was} at the merge base with ${base}: don't add to the debt)` };
    return { ...f, level: "info", message: `${f.message} (ratcheted: ${now} in ${where}, ${was} at the merge base with ${base})` };
  });
}

/** The app's files as they were at the merge base, for counting findings there. */
export interface BaseSnapshot {
  mergeBase: string;
  /** The scanned files as they were at the merge base, at their paths there: unchanged ones as they are, changed (and moved) ones read from git, new ones left out. */
  files: SourceFile[];
  /** Whether a path (a file or a folder) existed at the merge base. */
  existed(file: string): boolean;
}

/**
 * The scanned files as they were at the merge base with `base`. A changed file is read from git
 * at its path there (`originOf`, for one moved or copied), once per path. Null when git can't tell
 * (no repository, the ref isn't fetched, or a file can't be read).
 */
export function snapshotAtBase(
  root: string,
  base: string,
  files: readonly SourceFile[],
  changed: ReadonlySet<string>,
  originOf: (file: string) => string = (f) => f,
): BaseSnapshot | null {
  const mergeBase = mergeBaseOf(root, base);
  if (!mergeBase) return null;
  const out: SourceFile[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (!changed.has(f.path)) {
      if (!seen.has(f.path)) out.push(f);
      seen.add(f.path);
      continue;
    }
    const origin = originOf(f.path);
    if (seen.has(origin)) continue;
    seen.add(origin);
    const text = showAt(root, mergeBase, origin);
    if (text === null) return null;
    if (text !== undefined) out.push(withText({ ...f, path: origin, absolutePath: path.join(root, origin) }, text));
  }
  const cache = new Map<string, boolean>();
  return {
    mergeBase,
    files: out,
    existed(file) {
      if (!cache.has(file)) cache.set(file, git(root, ["cat-file", "-e", `${mergeBase}:./${file}`]) !== null);
      return cache.get(file)!;
    },
  };
}
