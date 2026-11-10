/**
 * `genesis doctor`: checks an app against the installed Genesis — local
 * primitives, forbidden imports, raw tags Genesis has components for,
 * literal colors, undefined tokens, shadowed exports, duplicate Genesis
 * installs and structural copies (hand-rolled sub-nav, local copies of
 * Genesis components, pages without a Genesis layout) — plus the app's own
 * pattern rules and rule plugins. The CLI and the Vite plugin both call
 * `runDoctor`.
 */
import * as path from "node:path";
import { buildCommands, runBuild } from "./build.js";
import { DoctorConfigError, loadConfig, META_RULES } from "./config.js";
import { globToRegExp } from "./glob.js";
import { loadGenesis } from "./genesis.js";
import { loadPatternRules } from "./patterns.js";
import { loadPlugins } from "./plugins.js";
import {
  BUILTIN_RULES,
  checkColors,
  checkImports,
  checkProjectLayout,
  checkRawTags,
  checkShadowedExports,
  checkTokens,
  unusedComponents,
} from "./rules.js";
import { checkNativePack } from "./native.js";
import { scanFiles } from "./scan.js";
import { checkPackagesPack } from "./packages.js";
import { checkSupabasePack } from "./supabase.js";
import { checkVersionSkew } from "./versions.js";
import { checkDuplicatePackages, checkPeerRanges } from "./installs.js";
import { checkHandRolledSubNav, checkLocalGenesisCopies, checkPageLayouts, checkRecordViews } from "./structure.js";
import { checkIsoDateSlices } from "./dates.js";
import { checkRemovedScopeNames, checkStudioServerImports, checkTreeViews } from "./api-usage.js";
import { checkStabilityImports } from "./stability.js";
import { discoverPackages, packageRuleIds, packageRulesPlugins, preferRules, unknownPackageRuleSettings } from "./package-rules.js";
import { allowGrew, applyRatchet, changedSince, configAtBase, countFindings, countKey, extensionsAdded, isRatcheted, originsSince, rulesWeakened, snapshotAtBase, touched } from "./ratchet.js";
import { applyExtensions, dedupeFindings } from "./extensions.js";
import { checkContracts } from "./contracts.js";
import { checkAgentGuide, primitivesSummary } from "./primitives.js";
import { checkAgentHooks } from "./agent-hooks.js";
import { checkOverlays } from "./overlays.js";
import { checkLockFiles } from "./lock-files.js";
import { checkDatabaseHome } from "./database.js";
import { checkEslintConfig } from "./eslint-config.js";
import { checkFigmaRoutesRule } from "./figma-routes.js";
import { existsSync } from "node:fs";
import type { DoctorConfig, DoctorContext, DoctorPack, DoctorPlugin, DoctorResult, Finding, FindingInput, ExtensionEntry, GenesisFacts } from "./types.js";

/** Built-in rules ratcheted under --base without config (a deprecation, or a config Genesis now wants changed, lands on existing code). */
const RATCHETED_BY_DEFAULT = ["deprecated-import", "genesis-eslint-config"] as const;

export type * from "./types.js";
export {
  DoctorConfigError,
  GenesisConfigError,
  loadConfig,
  readGenesisConfig,
  validateConfig,
  validateLinks,
  type GenesisConfigFile,
  type GenesisLinks,
  type GenesisSupabase,
} from "./config.js";
export { loadGenesis, findPackageDir, parseExportNames, readPackageExports } from "./genesis.js";
export { parseRulesMarkdown } from "./patterns.js";
export { defineDoctorPlugin } from "./plugins.js";
export { BUILTIN_RULES } from "./rules.js";
export { globToRegExp } from "./glob.js";
export { nativeLayouts } from "./native.js";
export { sqlStatements } from "./supabase.js";
export { readReleaseManifest, type ReleaseManifest } from "./versions.js";
export { genesisInstalls, type GenesisInstall } from "./installs.js";
export { satisfies } from "./semver.js";
export { webRoutes, routesDir, type RouteFile } from "./routes.js";
export {
  discoverPackages,
  preferRules,
  ruleNamespace,
  validateDeclaration,
  clearPackageRulesCache,
  PackageDeclarationError,
  type DeclaringPackage,
  type PackageDeclaration,
  type PreferRule,
  type PrimitiveEntry,
  type ResolvedPreferRule,
} from "./package-rules.js";
export {
  primitivesCatalog,
  primitivesSummary,
  formatPrimitives,
  catalogTable,
  renderSkill,
  renderAgentsBlock,
  packageGuides,
  skillDescription,
  type PackageGuide,
  agentRules,
  CLAUDE_IMPORT,
  writeAgentGuide,
  agentGuideState,
  BLOCKED_FIX,
  unlistedGuides,
  SKILL_PATH,
  type PrimitiveRow,
} from "./primitives.js";
export { changedSince } from "./ratchet.js";
export { applyExtensions, dedupeFindings, extensionProblem } from "./extensions.js";
export { postgresContract, postgresSource } from "./contracts.js";

export interface RunDoctorOptions {
  /** The app root. Default `process.cwd()`. */
  root?: string;
  /** Explicit config file (otherwise genesis.config.json, then package.json `genesis`). */
  configPath?: string;
  /** Use this config instead of reading one. Relative plugin paths resolve from `root`. */
  config?: DoctorConfig;
  /** Treat warnings as failures. */
  strict?: boolean;
  /** Run the app's typecheck and build after the checks. */
  build?: boolean;
  /** Pipe build output instead of inheriting the terminal (for --json). */
  quietBuild?: boolean;
  /** Reuse facts read earlier (the Vite dev server caches them). */
  genesis?: GenesisFacts;
  /** The git ref change checks compare against (`--base`): the packages pack's change gate and the ratchet. */
  base?: string;
  /** Files changed since `base`, app-relative, instead of asking git (tests, or a CI that already knows). */
  changedFiles?: string[];
  /** Run the supabase pack's contract check (it reads the database). Default true; the Vite plugin (build and dev) passes false. */
  contracts?: boolean;
  /** Run the figma-routes check (it reads the Figma file) when the config has a figma block. Default true; the Vite plugin passes false. */
  figma?: boolean;
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = options.config ? { config: options.config, dir: root } : loadConfig(root, options.configPath);
  const config = loaded.config;
  const genesis = options.genesis ?? loadGenesis(root, config);
  const files = scanFiles(root, config);

  const patterns = loadPatternRules(root, config.patterns, config.rulesDoc);
  const plugins = await loadPlugins(config.plugins, loaded.dir);
  const packages = discoverPackages(root);
  const packagePlugins = await packageRulesPlugins(packages);
  const builtinIds = new Set<string>(BUILTIN_RULES);
  for (const p of config.patterns ?? []) {
    if (builtinIds.has(p.id) || META_RULES.has(p.id)) throw new DoctorConfigError(`doctor.patterns: "${p.id}" is a built-in rule id; pick another`);
  }

  const raw: FindingInput[] = [];
  const ctx: DoctorContext = { root, files, genesis, config, packages, ...(options.base ? { base: options.base } : {}), ...(options.strict ? { strict: true } : {}), report: (f) => raw.push(f) };
  const appChecks = [...packagePlugins, ...(patterns ? [patterns.plugin] : []), ...plugins];
  await runChecks(ctx, [...builtinChecks(config, { contracts: options.contracts ?? true, figma: options.figma ?? true }), ...appChecks]);

  if (options.build) {
    const failure = runBuild(root, buildCommands(root, config), options.quietBuild ?? false);
    if (failure) raw.push(failure);
  }

  raw.push(...unknownPackageRuleSettings(config, packages, raw));

  // Under --base: the ratchet's changed files, and the config's allow, rules and packageRules against
  // the base's. When git can't compare, one ratchet-skipped notice: a warning when only the ratchet
  // was skipped (every rule ran at its full level), an error when the config went uncompared.
  // Built-in rules that land on existing code ratchet by default, so a Genesis upgrade never fails an
  // app's strict CI on files nobody touched: deprecations are moved file by file.
  const newOnly = new Set([...RATCHETED_BY_DEFAULT, ...(patterns?.newOnly ?? []), ...preferRules(packages).filter((r) => r.newOnly).map((r) => r.ruleId)]);
  let changed: Set<string> | null = null;
  let skipped = false;
  // A default-ratcheted rule asks git only when it found something, so an app with no deprecated
  // imports never sees a ratchet-skipped notice where git can't compare.
  const ratchetNeeded = newOnly.size > RATCHETED_BY_DEFAULT.length || raw.some((f) => (RATCHETED_BY_DEFAULT as readonly string[]).includes(f.rule));
  if (options.base && (ratchetNeeded || config.ratchet || config.extend?.length)) {
    changed = options.changedFiles ? new Set(options.changedFiles) : changedSince(root, options.base);
    skipped ||= !changed;
  }
  const configFile = "file" in loaded ? loaded.file : null;
  const guarded = (config.allow?.length ?? 0) + (config.extend?.length ?? 0) + Object.keys(config.rules ?? {}).length + Object.keys(config.packageRules ?? {}).length > 0;
  let configSkipped = false;
  let baseExtend: ExtensionEntry[] = [];
  if (options.base && configFile) {
    const before = configAtBase(root, options.base, options.configPath !== undefined ? configFile : undefined);
    if (before && before !== "absent") baseExtend = before.extend;
    // No doctor settings at the base (adopting the doctor): nothing to compare allow and rules with,
    // but every extension is new, and the review sees each.
    if (before === "absent") raw.push(...extensionsAdded(config.extend ?? [], [], options.base));
    if (before && before !== "absent") {
      raw.push(...allowGrew(config.allow ?? [], before.allow, options.base));
      raw.push(...rulesWeakened(config, before, options.base));
      raw.push(...extensionsAdded(config.extend ?? [], before.extend, options.base));
    }
    // Uncompared: an error when the config holds something to compare; nothing to say when it holds
    // none (no allow, extend, rules or packageRules can have weakened or grown).
    configSkipped = !before && guarded;
  }
  if (skipped || configSkipped) {
    raw.push(
      configSkipped
        ? { rule: "ratchet-skipped", level: "error", file: "genesis config", message: `couldn't compare allow, extend, rules and packageRules against ${options.base} (not a git repository, or the ref isn't fetched; in CI check out with fetch-depth: 0)` }
        : { rule: "ratchet-skipped", level: "warn", file: "genesis config", message: `couldn't compare against ${options.base} (not a git repository, or the ref isn't fetched); every rule ran at its full level` },
    );
  }
  const packageIds = packageRuleIds(packages);
  const extensionCtx = { config, files, packages, raw };
  const configured = applyConfig(raw, config, packageIds);
  let findings = applyExtensions(configured, extensionCtx);
  if (options.base && changed) {
    const isAppPath = (f: string) => existsSync(path.join(root, f));
    const origins = options.changedFiles ? new Map<string, string>() : originsSince(root, options.base);
    const originOf = (f: string) => origins.get(f) ?? f;
    // A changed file keeps a ratcheted rule's findings at their level only when it is new or has
    // more of them than at the merge base, and an extension the base had covers only the findings
    // its file had there: count them at the merge base, from the files as they were.
    const dueRules = new Set(findings.filter((f) => f.level !== "info" && isRatcheted(f.rule, config, newOnly) && isAppPath(f.file) && touched(f.file, changed!)).map((f) => f.rule));
    const heldExtensions = (config.extend ?? []).filter((e) => touched(e.file, changed!) && baseExtend.some((b) => b.rule === e.rule && (b.file === e.file || b.file === originOf(e.file))));
    for (const e of heldExtensions) dueRules.add(e.rule);
    const snapshot = dueRules.size ? snapshotAtBase(root, options.base, files, changed, originOf) : null;
    let baseCounts: Map<string, number> | undefined;
    if (snapshot) {
      const before: FindingInput[] = [];
      await runChecks({ ...ctx, files: snapshot.files, report: (f) => before.push(f) }, baseChecks(dueRules, packageIds, packagePlugins, () => [...builtinChecks(config, { contracts: false, figma: false }), ...appChecks]));
      // Counted before extensions: what an extension covers is what its file had.
      baseCounts = countFindings(applyConfig(before, config, packageIds));
      if (heldExtensions.length) {
        const counts = baseCounts;
        const held = new Set(heldExtensions);
        findings = applyExtensions(configured, { ...extensionCtx, limit: (e) => (held.has(e) ? (counts.get(countKey(originOf(e.file), e.rule)) ?? 0) : undefined) });
      }
    }
    findings = applyRatchet(findings, { config, newOnly, changed, base: options.base, isAppPath, originOf, ...(snapshot && baseCounts ? { baseCounts, existedAtBase: snapshot.existed } : {}) });
  }
  findings = dedupeFindings(findings);
  const extensionsNew = (config.extend ?? []).filter((e) => findings.some((f) => f.rule === "extension-added" && f.file === e.file && f.subject === e.rule));
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warn").length;
  const infos = findings.length - errors - warnings;
  return {
    ok: errors === 0 && !(options.strict && warnings > 0),
    root,
    genesis,
    findings,
    unused: unusedComponents(ctx),
    ruleCount: (patterns?.count ?? 0) + plugins.length,
    primitives: primitivesSummary(packages),
    errors,
    warnings,
    infos,
    ...(extensionsNew.length ? { extensionsAdded: extensionsNew } : {}),
  };
}

/**
 * The checks the merge base's pass runs: only the package rules when every rule it counts is a
 * package `prefer` rule (the usual case), else every check that reads the app's files.
 */
function baseChecks(rules: ReadonlySet<string>, preferIds: ReadonlySet<string>, packagePlugins: DoctorPlugin[], all: () => DoctorPlugin[]): DoctorPlugin[] {
  if ([...rules].every((r) => preferIds.has(r))) return packagePlugins.filter((p) => p.name === "package-rules");
  return all();
}

/** Run each check, turning a plugin's crash into a `plugin-error` finding (a config error still throws). */
async function runChecks(ctx: DoctorContext, checks: DoctorPlugin[]): Promise<void> {
  for (const plugin of checks) {
    try {
      await plugin.check(ctx);
    } catch (err) {
      if (err instanceof DoctorConfigError) throw err;
      ctx.report({ rule: "plugin-error", file: plugin.name, message: `rule plugin "${plugin.name}" threw: ${(err as Error).message}` });
    }
  }
}

/**
 * The built-in checks, in the order they run. A new built-in rule is a check
 * here plus its ids in BUILTIN_RULES (rules.ts); a pack's checks run only when
 * `packs` lists it.
 */
export function builtinChecks(config: DoctorConfig, options: { contracts?: boolean; figma?: boolean } = {}): DoctorPlugin[] {
  const packs: Record<DoctorPack, DoctorPlugin> = {
    native: { name: "native", check: checkNativePack },
    supabase: { name: "supabase", check: checkSupabasePack },
    packages: { name: "packages", check: checkPackagesPack },
  };
  return [
    { name: "layout", check: checkProjectLayout },
    { name: "imports", check: checkImports },
    { name: "raw-tags", check: checkRawTags },
    { name: "colors", check: checkColors },
    { name: "tokens", check: checkTokens },
    { name: "shadowed-exports", check: checkShadowedExports },
    { name: "version-skew", check: checkVersionSkew },
    { name: "duplicate-packages", check: checkDuplicatePackages },
    { name: "peer-ranges", check: checkPeerRanges },
    { name: "hand-rolled-sub-nav", check: checkHandRolledSubNav },
    { name: "local-genesis-copies", check: checkLocalGenesisCopies },
    { name: "resource-workspaces", check: checkRecordViews },
    { name: "page-layouts", check: checkPageLayouts },
    { name: "iso-date-slices", check: checkIsoDateSlices },
    { name: "resource-view-trees", check: checkTreeViews },
    { name: "studio-server-imports", check: checkStudioServerImports },
    { name: "removed-scope-names", check: checkRemovedScopeNames },
    { name: "stability-imports", check: checkStabilityImports },
    { name: "agent-guide", check: (ctx: DoctorContext) => { checkAgentGuide(ctx); checkAgentHooks(ctx); } },
    { name: "overlays", check: (ctx: DoctorContext) => checkOverlays(ctx) },
    { name: "lock-files", check: checkLockFiles },
    { name: "database-elsewhere", check: checkDatabaseHome },
    { name: "eslint-config", check: checkEslintConfig },
    ...(config.packs ?? []).map((p) => packs[p]),
    ...(options.figma !== false ? [{ name: "figma-routes", check: checkFigmaRoutesRule }] : []),
    ...(config.packs?.includes("supabase") && config.contracts && options.contracts !== false ? [{ name: "contracts", check: (ctx: DoctorContext) => checkContracts(ctx) }] : []),
  ];
}

/**
 * Apply `rules` and `packageRules` level overrides and `allow` exceptions; flag exceptions that no
 * longer match anything, and package rules changed in `rules` without a reason.
 */
function applyConfig(raw: FindingInput[], config: DoctorConfig, packageIds: ReadonlySet<string>): Finding[] {
  const allow = (config.allow ?? []).map((entry) => ({ entry, file: entry.file ? globToRegExp(entry.file) : null, used: false }));
  const out: Finding[] = [];
  // The meta rules guard the config itself, so the config can't lower or allow them.
  const levelOf = (rule: string) => (META_RULES.has(rule) ? undefined : (config.rules?.[rule] ?? config.packageRules?.[rule]?.level));
  for (const [rule, level] of Object.entries(config.rules ?? {})) {
    if (!packageIds.has(rule) || config.packageRules?.[rule]?.reason) continue;
    out.push({
      rule: "package-rule-override",
      level: "warn",
      file: "genesis config",
      line: 0,
      subject: rule,
      message: `rules sets the package rule ${rule} to "${level}" without a reason; move it to doctor.packageRules["${rule}"] with { "level": "${level}", "reason": "…" }`,
    });
  }
  for (const input of raw) {
    const setting = levelOf(input.rule);
    if (setting === "off") continue;
    const finding: Finding = {
      rule: input.rule,
      level: setting ?? input.level ?? "error",
      file: input.file,
      line: input.line ?? 0,
      message: input.message,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
    };
    const exception = allow.find(
      (a) => !META_RULES.has(finding.rule) && a.entry.rule === finding.rule && (!a.file || a.file.test(finding.file)) && (a.entry.match === undefined || a.entry.match === finding.subject),
    );
    if (exception) {
      exception.used = true;
      continue;
    }
    out.push(finding);
  }
  // stale-exception is a rule like any other: `rules` can turn it off or change its level.
  const staleLevel = config.rules?.["stale-exception"];
  for (const a of allow) {
    if (staleLevel === "off" || a.used || levelOf(a.entry.rule) === "off") continue;
    out.push({
      rule: "stale-exception",
      level: staleLevel ?? "warn",
      file: a.entry.file ?? "genesis config",
      line: 0,
      subject: a.entry.rule,
      message: `the allow entry for ${a.entry.rule}${a.entry.match ? ` (${a.entry.match})` : ""} no longer matches anything; remove it`,
    });
  }
  return out.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.rule.localeCompare(y.rule));
}

/** The human-readable report. `verbose` lists the components no file imports; otherwise only their count. */
export function formatReport(result: DoctorResult, options: { verbose?: boolean } = {}): string {
  const g = result.genesis;
  const lines = [
    `Genesis doctor: ${g.uiPackage}@${g.uiVersion}, ${g.components.length} components, ${g.tokens.size} tokens, ` +
      `${result.ruleCount} app rules; raw tags checked: ${[...g.rawTags.keys()].join(", ") || "none"}`,
  ];
  for (const f of result.findings) {
    lines.push(`${f.level.toUpperCase().padEnd(5)} ${f.file}${f.line ? `:${f.line}` : ""}  [${(f.rules ?? [f.rule]).join(", ")}] ${f.message}`);
  }
  lines.push(options.verbose ? `Available but unused (${result.unused.length}): ${result.unused.join(", ") || "none"}` : `Available but unused: ${result.unused.length} (genesis doctor --verbose lists them)`);
  lines.push(`Primitives: ${result.primitives.rules} rules from ${result.primitives.packages} packages; see genesis catalog`);
  if (result.extensionsAdded?.length) {
    lines.push(`Extensions added on this branch (${result.extensionsAdded.length}); the pull request's review accepts each:`);
    for (const e of result.extensionsAdded) lines.push(`  ${e.file}  [${e.rule}] builds on ${e.buildsOn}: ${e.reason}${e.upstream ? ` (upstream: ${e.upstream})` : ""}`);
  }
  const info = result.infos ? `, ${result.infos} info` : "";
  lines.push(result.ok ? `PASS (${result.warnings} warnings${info})` : `FAIL (${result.errors} errors, ${result.warnings} warnings${info})`);
  return lines.join("\n");
}

/** The `--json` report: plain data, sets turned into sorted lists. */
export function toJson(result: DoctorResult) {
  return {
    ok: result.ok,
    genesis: `${result.genesis.uiPackage}@${result.genesis.uiVersion}`,
    errors: result.errors,
    warnings: result.warnings,
    infos: result.infos,
    findings: result.findings,
    unused: result.unused,
    primitives: result.primitives,
    ...(result.extensionsAdded ? { extensionsAdded: result.extensionsAdded } : {}),
  };
}

/** What `--print-genesis` shows: the facts every rule is derived from. */
export function genesisSummary(g: GenesisFacts) {
  return {
    package: `${g.uiPackage}@${g.uiVersion}`,
    components: g.components,
    tokens: [...g.tokens].sort(),
    rawTags: Object.fromEntries(g.rawTags),
    palette: g.palette,
    companions: Object.fromEntries(g.companions.map((c) => [`${c.package}@${c.version}`, c.components])),
  };
}

export { subagentContext, subagentHookOutput, mergeAgentHooks, writeAgentHooks, agentHooksState, SETTINGS_PATH, SUBAGENT_HOOK_COMMAND, DENY_RULES } from "./agent-hooks.js";
