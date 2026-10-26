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
import { DoctorConfigError, loadConfig } from "./config.js";
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
import { checkSupabasePack } from "./supabase.js";
import { checkVersionSkew } from "./versions.js";
import { checkDuplicatePackages } from "./installs.js";
import { checkHandRolledSubNav, checkLocalGenesisCopies, checkPageLayouts, checkResourceWorkspaces } from "./structure.js";
import type { DoctorConfig, DoctorContext, DoctorPack, DoctorPlugin, DoctorResult, Finding, FindingInput, GenesisFacts } from "./types.js";

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
export { webRoutes, routesDir, type RouteFile } from "./routes.js";

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
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = options.config ? { config: options.config, dir: root } : loadConfig(root, options.configPath);
  const config = loaded.config;
  const genesis = options.genesis ?? loadGenesis(root, config);
  const files = scanFiles(root, config);

  const patterns = loadPatternRules(root, config.patterns, config.rulesDoc);
  const plugins = await loadPlugins(config.plugins, loaded.dir);
  const builtinIds = new Set<string>(BUILTIN_RULES);
  for (const p of config.patterns ?? []) {
    if (builtinIds.has(p.id)) throw new DoctorConfigError(`doctor.patterns: "${p.id}" is a built-in rule id; pick another`);
  }

  const raw: FindingInput[] = [];
  const ctx: DoctorContext = { root, files, genesis, config, report: (f) => raw.push(f) };
  for (const plugin of [...builtinChecks(config), ...(patterns ? [patterns.plugin] : []), ...plugins]) {
    try {
      await plugin.check(ctx);
    } catch (err) {
      if (err instanceof DoctorConfigError) throw err;
      raw.push({ rule: "plugin-error", file: plugin.name, message: `rule plugin "${plugin.name}" threw: ${(err as Error).message}` });
    }
  }

  if (options.build) {
    const failure = runBuild(root, buildCommands(root, config), options.quietBuild ?? false);
    if (failure) raw.push(failure);
  }

  const findings = applyConfig(raw, config);
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.length - errors;
  return {
    ok: errors === 0 && !(options.strict && warnings > 0),
    root,
    genesis,
    findings,
    unused: unusedComponents(ctx),
    ruleCount: (patterns?.count ?? 0) + plugins.length,
    errors,
    warnings,
  };
}

/**
 * The built-in checks, in the order they run. A new built-in rule is a check
 * here plus its ids in BUILTIN_RULES (rules.ts); a pack's checks run only when
 * `packs` lists it.
 */
export function builtinChecks(config: DoctorConfig): DoctorPlugin[] {
  const packs: Record<DoctorPack, DoctorPlugin> = {
    native: { name: "native", check: checkNativePack },
    supabase: { name: "supabase", check: checkSupabasePack },
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
    { name: "hand-rolled-sub-nav", check: checkHandRolledSubNav },
    { name: "local-genesis-copies", check: checkLocalGenesisCopies },
    { name: "resource-workspaces", check: checkResourceWorkspaces },
    { name: "page-layouts", check: checkPageLayouts },
    ...(config.packs ?? []).map((p) => packs[p]),
  ];
}

/** Apply `rules` level overrides and `allow` exceptions; flag exceptions that no longer match anything. */
function applyConfig(raw: FindingInput[], config: DoctorConfig): Finding[] {
  const allow = (config.allow ?? []).map((entry) => ({ entry, file: entry.file ? globToRegExp(entry.file) : null, used: false }));
  const out: Finding[] = [];
  for (const input of raw) {
    const setting = config.rules?.[input.rule];
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
      (a) => a.entry.rule === finding.rule && (!a.file || a.file.test(finding.file)) && (a.entry.match === undefined || a.entry.match === finding.subject),
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
    if (staleLevel === "off" || a.used || config.rules?.[a.entry.rule] === "off") continue;
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

/** The human-readable report. */
export function formatReport(result: DoctorResult): string {
  const g = result.genesis;
  const lines = [
    `Genesis doctor: ${g.uiPackage}@${g.uiVersion}, ${g.components.length} components, ${g.tokens.size} tokens, ` +
      `${result.ruleCount} app rules; raw tags checked: ${[...g.rawTags.keys()].join(", ") || "none"}`,
  ];
  for (const f of result.findings) {
    lines.push(`${f.level.toUpperCase().padEnd(5)} ${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}] ${f.message}`);
  }
  lines.push(`Available but unused (${result.unused.length}): ${result.unused.join(", ") || "none"}`);
  lines.push(result.ok ? `PASS (${result.warnings} warnings)` : `FAIL (${result.errors} errors, ${result.warnings} warnings)`);
  return lines.join("\n");
}

/** The `--json` report: plain data, sets turned into sorted lists. */
export function toJson(result: DoctorResult) {
  return {
    ok: result.ok,
    genesis: `${result.genesis.uiPackage}@${result.genesis.uiVersion}`,
    errors: result.errors,
    warnings: result.warnings,
    findings: result.findings,
    unused: result.unused,
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
