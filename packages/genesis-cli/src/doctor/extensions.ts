/**
 * Declared extensions (`doctor.extend`) and merging duplicate findings.
 *
 * A package rule may declare extension points (`extensible`): the Genesis exports an app can build
 * on in ways the rule doesn't recognize. A file that does, and can say why, declares an extension
 * instead of hiding the finding in `allow`: `{ rule, file, buildsOn, reason, upstream? }`. `allow`
 * is debt that only shrinks; an extension is a reviewed decision, bounded twice: by the rule's
 * points, and by the findings the file had when it was declared (under `--base`, a file with more
 * of them than at the merge base fails as usual). The doctor keeps it honest:
 *
 * - `extension-invalid` (error): the rule declares no extension points (a built-in rule, a
 *   deprecation) or `buildsOn` isn't one of them, the file doesn't import `buildsOn` from a Genesis
 *   package, `buildsOn` is what a package rule replaces, or something in the file flags it (a
 *   deprecated import). The findings it would cover stay.
 * - `stale-extension` (warn): the file no longer has a finding of `rule`; remove the entry.
 */
import { genesisNamedImports } from "./stability.js";
import { preferRules } from "./package-rules.js";
import type { DeclaringPackage, DoctorConfig, ExtensionEntry, Finding, FindingInput, Level, SourceFile } from "./types.js";

export interface ExtensionContext {
  config: DoctorConfig;
  files: readonly SourceFile[];
  packages: readonly DeclaringPackage[];
  /** Every finding the rules reported, before `rules`, `allow` and extensions applied. */
  raw: readonly FindingInput[];
  /**
   * How many findings an extension may cover: its file's count of its rule at the merge base, for
   * an extension the base config had too. Undefined: no limit (no `--base`, or a new extension,
   * whose findings the pull request's review sees).
   */
  limit?: (entry: ExtensionEntry) => number | undefined;
}

/** Why a rule can't be extended with `buildsOn` at all, whatever the file: null when it can. */
function pointProblem(entry: ExtensionEntry, packages: readonly DeclaringPackage[]): string | null {
  const rule = preferRules(packages).find((r) => r.ruleId === entry.rule);
  if (!rule?.extensible?.length) return `${entry.rule} declares no extension points, so it can't be extended (debt goes in allow, and is fixed)`;
  if (!rule.extensible.includes(entry.buildsOn)) return `${entry.buildsOn} isn't one of ${entry.rule}'s extension points (${rule.extensible.join(", ")})`;
  return null;
}

/** Why an extension can't be accepted, or null when it can. */
export function extensionProblem(entry: ExtensionEntry, ctx: Omit<ExtensionContext, "limit">): string | null {
  const point = pointProblem(entry, ctx.packages);
  if (point) return point;
  const name = entry.buildsOn.split(".")[0]!;
  const replaces = preferRules(ctx.packages).find((r) => r.forbid.jsx?.includes(name));
  if (replaces) return `${name} is what ${replaces.ruleId} replaces (use ${replaces.use}); a legacy component can't be built on`;
  const flagged = ctx.raw.find((f) => f.file === entry.file && f.subject === name);
  if (flagged) return `${name} is flagged in this file by ${flagged.rule}; build on a current Genesis primitive`;
  const file = ctx.files.find((f) => f.path === entry.file);
  if (!file) return `${entry.file} isn't one of the files the doctor scans`;
  const imported = genesisNamedImports(file.code).some((i) => i.names.includes(name));
  if (!imported) return `${entry.file} doesn't import ${name} from a Genesis package; buildsOn names the extension point the file uses`;
  return null;
}

/**
 * Drop the findings each valid extension covers, and report extensions that no longer cover
 * anything (`stale-extension`) or can't be accepted (`extension-invalid`). Runs after `rules` and
 * `allow`, so an extension of a rule that is off isn't reported. With `limit`, a file that has
 * more findings of the rule than the extension covered at the merge base keeps them all.
 */
export function applyExtensions(findings: Finding[], ctx: ExtensionContext): Finding[] {
  const entries = ctx.config.extend ?? [];
  if (!entries.length) return findings;
  const staleLevel = ctx.config.rules?.["stale-extension"];
  const covered = new Set<Finding>();
  const grew = new Map<Finding, string>();
  const out: Finding[] = [];
  const invalid = (entry: ExtensionEntry, problem: string) =>
    out.push({ rule: "extension-invalid", level: "error", file: entry.file, line: 0, subject: entry.rule, message: `the extension of ${entry.rule} isn't accepted: ${problem}` });
  for (const entry of entries) {
    if (ctx.config.rules?.[entry.rule] === "off" || ctx.config.packageRules?.[entry.rule]?.level === "off") continue;
    const point = pointProblem(entry, ctx.packages);
    if (point) {
      invalid(entry, point);
      continue;
    }
    const hits = findings.filter((f) => f.rule === entry.rule && f.file === entry.file);
    if (!hits.length) {
      if (staleLevel === "off") continue;
      out.push({
        rule: "stale-extension",
        level: (staleLevel ?? "warn") as Level,
        file: entry.file,
        line: 0,
        subject: entry.rule,
        message: `the extension of ${entry.rule} (building on ${entry.buildsOn}) no longer matches a finding in this file; remove it from doctor.extend`,
      });
      continue;
    }
    const problem = extensionProblem(entry, ctx);
    if (problem) {
      invalid(entry, problem);
      continue;
    }
    const limit = ctx.limit?.(entry);
    if (limit !== undefined && hits.length > limit) {
      for (const h of hits) grew.set(h, `${h.message} (the extension of ${entry.rule} here covers the ${limit} at the merge base; this file now has ${hits.length}, so they all count)`);
      continue;
    }
    for (const h of hits) covered.add(h);
  }
  const kept = findings.filter((f) => !covered.has(f)).map((f) => (grew.has(f) ? { ...f, message: grew.get(f)! } : f));
  return [...kept, ...out].sort(byPlace);
}

const byPlace = (x: Finding, y: Finding) => x.file.localeCompare(y.file) || x.line - y.line || x.rule.localeCompare(y.rule);

const RANK: Record<Level, number> = { info: 0, warn: 1, error: 2 };

/**
 * One finding per element: findings of different rules on the same file, line and subject (an
 * app's own rule and a package rule hitting the same `<DataTable>`) are merged, at the higher
 * level, listing every rule in `rules`. Two findings of one rule stay two (two elements on a line).
 */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const groups = new Map<string, Finding[][]>();
  const order: Finding[][] = [];
  for (const f of findings) {
    if (f.subject === undefined || !f.line) {
      order.push([f]);
      continue;
    }
    const key = `${f.file}\0${f.line}\0${f.subject}`;
    const list = groups.get(key) ?? [];
    const group = list.find((g) => !g.some((x) => x.rule === f.rule));
    if (group) group.push(f);
    else {
      const fresh = [f];
      list.push(fresh);
      groups.set(key, list);
      order.push(fresh);
    }
  }
  return order.map((group) => {
    if (group.length === 1) return group[0]!;
    const primary = group.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
    const rules = [primary.rule, ...group.filter((g) => g !== primary).map((g) => g.rule)];
    return { ...primary, rules, message: `${primary.message} (also ${rules.slice(1).join(", ")})` };
  });
}
