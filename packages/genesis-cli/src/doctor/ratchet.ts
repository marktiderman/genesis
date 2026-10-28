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
import { doctorBlock, isPackageDeclaration, META_RULES } from "./config.js";
import type { AllowEntry, DoctorConfig, FindingInput, Finding, PackageRuleSetting, RuleSetting } from "./types.js";

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

/** A file as it was at `rev`, read from `dir`; undefined when it didn't exist there, null when git can't tell. */
function showAt(dir: string, rev: string, file: string): string | null | undefined {
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
  const mergeBase = git(root, ["merge-base", base, "HEAD"])?.trim();
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
    const b = objectOr<{ allow?: unknown; rules?: unknown; packageRules?: unknown }>(block);
    return { allow: Array.isArray(b.allow) ? (b.allow as AllowEntry[]) : [], rules: objectOr(b.rules), packageRules: objectOr(b.packageRules) };
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
