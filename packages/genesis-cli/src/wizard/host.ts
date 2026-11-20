/**
 * The setup wizard's host: the CLI side of the settings protocol
 * (`@marktiderman/genesis-config/settings-protocol`), plus the wizard's own ops. The doctor and the
 * wizard are one engine (R6): the state is the doctor's findings with their fixes, and every write
 * is a fix plan.
 *
 * **Every write goes through the fix engine, approved by its hash.** A change is planned first
 * (`plan`, `settings.plan`, `init.plan`), which writes nothing and returns the plan and its hash;
 * the page shows it; `apply {fixId, expect}` then applies only a plan this host made in this run
 * with that hash, planning again and refusing a stale one (the engine checks every file's hash
 * once more). The protocol's direct writes (`setValue`, `clearValue`) are refused here: the page
 * plans them instead.
 *
 * **Secrets.** A plan names its secrets; `apply` may carry their values (`secrets: {NAME: value}`),
 * which go into a vault held for that one apply and reach a tool on stdin only (the S2 setters).
 * No answer, event or log line holds a value: each is redacted against the vault before it leaves.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  SETTINGS_PROTOCOL_VERSION,
  type SettingsApplyResult,
  type SettingsCapabilities,
  type SettingsErrorCode,
  type SettingsFinding,
  type SettingsPlan,
  type SettingsSecretStatus,
  type SettingsState,
  type SettingsUpgrades,
} from "@marktiderman/genesis-config/settings-protocol";
import { isLockedEntry, resolveSettings, SETTINGS_PRESETS, SettingsError, type SettingsCatalogue, type SettingsPreset } from "@marktiderman/genesis-config/settings";
import { GenesisConfigError, readGenesisConfig } from "../doctor/config.js";
import { discoverPackages } from "../doctor/package-rules.js";
import { neededSecrets } from "../doctor/settings.js";
import type { DoctorResult, Finding } from "../doctor/types.js";
import { applyPlan, FileConflictError, FixError, planFix, plannedFile, StalePlanError } from "../fix/engine.js";
import { allFixes, type BuiltinDeps } from "../fix/registry.js";
import type { Fix, FixContext, FixPlan, FixPlanDraft } from "../fix/types.js";
import type { ToolRunner } from "../exec/run.js";
import { findLockfile, installCommand, type PackageManager } from "../blocks/pm.js";
import { SecretError, SecretVault } from "../exec/secret-vault.js";
import { changedLines } from "../mcp/server.js";
import { CONFIG_FILE, fileLayers, loadCatalogue, ProposalError, settingsProposalFix } from "../mcp/settings.js";
import { distance, readUpgradeStatus, type RegistryDeps } from "../upgrade/registry.js";
import { checkInitChoices, initAppFix, InitChoiceError, starterSwitches, INIT_FIX_ID, type InitChoices } from "./init.js";
import { SetupStepError } from "@marktiderman/genesis-config/setup";
import { runnerFor, startStep, stepFix, stepList, StepError, verifyStep } from "./steps/index.js";
import type { FetchLike } from "./steps/framework.js";

export type WizardMode = "init" | "setup";

export interface WizardHostOptions {
  /** `setup`: the app at `root`. `init`: `root` is the folder a new app is made in. */
  mode: WizardMode;
  root: string;
  configPath?: string;
  /** Reach npm, the advisory endpoints and the secret stores. Default false. */
  network?: boolean;
  /** init: what `genesis init --preset/--without` chose, for the Preset and Packages screens to start from. */
  initial?: { preset?: string; without?: string[] };
  /** A fix's output as it runs, redacted (the server sends it on `/events`). */
  publish?: (event: string, data: unknown) => void;
  /** Test seams. */
  deps?: {
    doctor?: (options: { root: string; configPath?: string; network: boolean }) => Promise<Pick<DoctorResult, "findings">>;
    fixes?: BuiltinDeps;
    extraFixes?: Fix[];
    registry?: Omit<RegistryDeps, "network">;
    /** Runs allowlisted tools for the plans' commands (default src/exec/run.ts). */
    run?: ToolRunner;
    /** The guided steps' requests to outside services (default fetch). */
    fetch?: FetchLike;
  };
}

/** What the CLI host can do. The database layer is the app host's (Phase 4); Vault is set in the dashboard (the CLI never writes it: S2). */
export const CLI_CAPABILITIES: SettingsCapabilities = Object.freeze({
  writeFiles: true,
  writeDatabase: false,
  setSecrets: Object.freeze({ edge: true, ci: true }),
  runCli: true,
  agent: false,
  proposeChanges: false,
}) as SettingsCapabilities;

/** The most of a planned file `plan.file` returns at once. */
export const PLAN_FILE_PAGE = 64_000;

const STALE_MESSAGE = "The app changed after this plan was made, so nothing was written. Plan it again and read the new plan before applying.";

class HostError extends Error {
  constructor(
    readonly code: SettingsErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The ops the wizard adds to the protocol's. */
export const WIZARD_OPS = ["wizard.info", "settings.plan", "init.plan", "install.plan", "plan.file", "step.list", "step.start", "step.submit", "step.verify", "agent.start", "agent.approve", "agent.discard"] as const;

/** How a plan was made, so `apply` can make the same one again. Never written to disk, never holds a secret. */
type Recipe = { kind: "install" } | { kind: "step"; id: string; fields: unknown } | { kind: "fix"; fixId: string; subject?: string } | { kind: "set"; key: string; value: unknown; locked?: boolean } | { kind: "clear"; key: string } | { kind: "init"; choices: InitChoices };

const SETTINGS_CLEAR_ID = "settings.clear";

/** Take one key out of genesis.config.json: it goes back to the layers below (a lock on it goes too). */
export function settingsClearFix(key: string): Fix {
  return {
    id: SETTINGS_CLEAR_ID,
    kind: "auto",
    rules: ["invalid-setting"],
    title: `remove settings.${key} from ${CONFIG_FILE}`,
    plan(ctx): FixPlanDraft {
      const config = readGenesisConfig(ctx.root);
      const settings = (config?.raw.settings ?? {}) as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(settings, key)) return { summary: `settings.${key} isn't in ${CONFIG_FILE}` };
      const raw = JSON.stringify(config!.raw);
      const json = JSON.parse(raw) as Record<string, unknown> & { settings: Record<string, unknown> };
      delete json.settings[key];
      if (!Object.keys(json.settings).length) delete (json as Record<string, unknown>).settings;
      const text = fs.readFileSync(path.join(ctx.root, CONFIG_FILE), "utf8");
      const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
      const was = settings[key];
      return {
        summary: `removes settings.${key} from ${CONFIG_FILE}${isLockedEntry(was) && was.locked ? " (and its lock)" : ""}: it takes its value from the preset or default`,
        files: [plannedFile(ctx.root, CONFIG_FILE, `${JSON.stringify(json, null, indent)}${text.endsWith("\n") ? "\n" : ""}`, `the key goes back to the layers below`)],
      };
    },
    verify(ctx) {
      const settings = (readGenesisConfig(ctx.root)?.raw.settings ?? {}) as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(settings, key) ? { ok: false, message: `settings.${key} is still in ${CONFIG_FILE}` } : { ok: true };
    },
  };
}

const INSTALL_FIX_ID = "deps.install";

/** The app's name: package.json's, else its folder's. */
function appName(root: string): string {
  try {
    const name = (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { name?: unknown }).name;
    if (typeof name === "string" && name) return name;
  } catch {
    /* no package.json */
  }
  return path.basename(root);
}

/** The package manager a new or existing app installs with: its lockfile's, else pnpm when it has pnpm settings (the starter's), else npm. */
const MANAGERS: readonly PackageManager[] = ["pnpm", "bun", "yarn", "npm"];

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as unknown;
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A workspace's package globs: pnpm-workspace.yaml `packages`, else package.json `workspaces` (a list, or `{ packages }`). */
function workspaceGlobs(dir: string): string[] | null {
  const yamlFile = path.join(dir, "pnpm-workspace.yaml");
  if (fs.existsSync(yamlFile)) {
    try {
      const parsed = parseYaml(fs.readFileSync(yamlFile, "utf8")) as { packages?: unknown } | null;
      return Array.isArray(parsed?.packages) ? parsed.packages.filter((p): p is string => typeof p === "string") : [];
    } catch {
      return [];
    }
  }
  const ws = readPackageJson(dir)?.workspaces;
  if (Array.isArray(ws)) return ws.filter((p): p is string => typeof p === "string");
  if (ws && typeof ws === "object" && Array.isArray((ws as { packages?: unknown }).packages)) return ((ws as { packages: unknown[] }).packages).filter((p): p is string => typeof p === "string");
  return null;
}

/** A workspace glob (`apps/*`, `packages/**`) as a regex over a POSIX relative path. */
function globRegex(glob: string): RegExp {
  const parts = glob.replace(/^\.\//, "").replace(/\/+$/, "").split("/");
  let body = "";
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    if (part === "**") body += last ? ".*" : "(?:[^/]+/)*";
    else body += part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + (last ? "" : "/");
  });
  return new RegExp(`^${body}$`);
}

/** Whether a workspace's globs take in this app (an excluded `!glob` wins). */
function isMember(globs: readonly string[], rel: string): boolean {
  const included = globs.filter((g) => !g.startsWith("!")).some((g) => globRegex(g).test(rel));
  const excluded = globs.filter((g) => g.startsWith("!")).some((g) => globRegex(g.slice(1)).test(rel));
  return included && !excluded;
}

/**
 * The workspace root an app is a member of: the nearest folder above it with pnpm-workspace.yaml
 * or a package.json `workspaces` whose globs take the app in. A folder that declares a workspace
 * the app isn't part of stops the search: the app stands on its own.
 */
export function workspaceRoot(root: string): string | null {
  const app = path.resolve(root);
  for (let dir = path.dirname(app); ; dir = path.dirname(dir)) {
    const globs = workspaceGlobs(dir);
    if (globs) return isMember(globs, path.relative(dir, app).split(path.sep).join("/")) ? dir : null;
    if (path.dirname(dir) === dir) return null;
  }
}

/** A lockfile in this folder itself (never a parent's). */
function lockfileIn(dir: string): PackageManager | null {
  const found = findLockfile(dir);
  return found && path.resolve(found.dir) === path.resolve(dir) ? found.pm : null;
}

/**
 * The package manager an app installs with: package.json `packageManager` (the app's, else its
 * workspace root's); else a lockfile in the app's folder or its workspace root (never another
 * folder above it); else pnpm when the app has pnpm settings (the starter's); else npm.
 */
export function appPackageManager(root: string): PackageManager {
  const ws = workspaceRoot(root);
  for (const dir of [root, ...(ws ? [ws] : [])]) {
    const declared = readPackageJson(dir)?.packageManager;
    const name = typeof declared === "string" ? declared.split("@")[0] : undefined;
    if (name && (MANAGERS as readonly string[]).includes(name)) return name as PackageManager;
  }
  for (const dir of [root, ...(ws ? [ws] : [])]) {
    const pm = lockfileIn(dir);
    if (pm) return pm;
  }
  return fs.existsSync(path.join(root, "pnpm-workspace.yaml")) ? "pnpm" : "npm";
}

const LOCKFILES = ["pnpm-lock.yaml", "bun.lock", "bun.lockb", "yarn.lock", "package-lock.json", "npm-shrinkwrap.json"];

/**
 * What an install reads, as one sha256: the app's package.json, and the lockfiles and workspace
 * settings in the app and its workspace root. It is in the approved plan, so a manifest changed
 * between the plan and the apply makes the plan stale instead of installing what nobody read.
 */
export function installInputsDigest(root: string): string {
  const ws = workspaceRoot(root);
  const files = [path.join(root, "package.json"), path.join(root, "pnpm-workspace.yaml"), ...LOCKFILES.map((f) => path.join(root, f))];
  if (ws) files.push(path.join(ws, "package.json"), path.join(ws, "pnpm-workspace.yaml"), ...LOCKFILES.map((f) => path.join(ws, f)));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${path.relative(root, file)}\0`);
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : "(none)");
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** The app's packages are installed: node_modules, or Yarn Plug'n'Play's .pnp.cjs. */
export function packagesInstalled(root: string): boolean {
  return fs.existsSync(path.join(root, "node_modules")) || fs.existsSync(path.join(root, ".pnp.cjs"));
}

/** Install the app's packages with its package manager (R5: the CLI does the installs). */
export function installFix(): Fix {
  return {
    id: INSTALL_FIX_ID,
    kind: "auto",
    rules: ["packages-not-installed"],
    title: "install the app's packages",
    plan(ctx): FixPlanDraft {
      const [tool, ...args] = installCommand(appPackageManager(ctx.root));
      const digest = installInputsDigest(ctx.root).slice(0, 16);
      return {
        summary: `runs ${[tool, ...args].join(" ")} in the app`,
        commands: [{ tool: tool!, args, why: `installs what package.json and the lockfile list (as read for this plan: ${digest}), so the doctor and the app can run` }],
      };
    },
    verify: (ctx) => (packagesInstalled(ctx.root) ? { ok: true } : { ok: false, message: "the install made neither node_modules nor .pnp.cjs" }),
  };
}

/** A unified-looking diff of a planned file for the page: the changed lines, bounded. A new file shows its first lines. */
function fileDiff(root: string, rel: string, content: string, created: boolean): string {
  const MAX = 8_000;
  let before = "";
  if (!created) {
    try {
      before = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      before = "";
    }
  }
  const lines = created ? content.split("\n").slice(0, 60).map((l) => `+ ${l}`) : changedLines(before, content);
  const text = lines.join("\n");
  return text.length > MAX ? `${text.slice(0, MAX)}\n… (${text.length - MAX} more characters)` : text;
}

export interface WizardHost {
  /** One request: `{v, op, …}` in, a status and a JSON body out. Never throws. */
  handle(request: unknown): Promise<{ status: number; body: unknown }>;
  /** The app the wizard is on now (after an init, the new app). */
  root(): string;
  mode(): WizardMode;
}

export function createWizardHost(options: WizardHostOptions): WizardHost {
  let root = path.resolve(options.root);
  let mode: WizardMode = options.mode;
  /** The folder init was opened in: the new app is made beneath it. */
  const initRoot = root;
  const network = options.network ?? false;
  const deps = options.deps ?? {};
  const publish = options.publish ?? (() => {});
  const recipes = new Map<string, Recipe>();
  const stepDeps = { network, ...(deps.run ? { run: deps.run } : {}), ...(deps.fetch ? { fetch: deps.fetch } : {}) };
  /** The last plans made, whole, so the page can read every planned file before approving (`plan.file`). */
  const plans = new Map<string, FixPlan>();
  /** One apply at a time: two writes never interleave. */
  let queue: Promise<unknown> = Promise.resolve();

  const doctor = async (): Promise<Finding[]> => {
    const run =
      deps.doctor ??
      (async (o: { root: string; configPath?: string; network: boolean }) => {
        const { runDoctor } = await import("../doctor/index.js");
        return runDoctor({ root: o.root, ...(o.configPath ? { configPath: o.configPath } : {}), network: o.network, ...(deps.registry ? { registry: deps.registry } : {}) });
      });
    return (await run({ root, ...(options.configPath ? { configPath: options.configPath } : {}), network })).findings;
  };

  const fixes = async (): Promise<Fix[]> => {
    const { fixes: list } = await allFixes(discoverPackages(root), deps.fixes ?? {});
    return [...list, ...(deps.extraFixes ?? [])];
  };

  const catalogue = (): SettingsCatalogue | null => {
    try {
      return loadCatalogue(root).catalogue;
    } catch (err) {
      if (err instanceof SettingsError) return null;
      throw err;
    }
  };

  /** An init plans and writes beneath the folder init was opened in, whatever the wizard is on now. */
  const context = (findings: Finding[], log?: (m: string) => void, recipe?: Recipe): FixContext => ({
    root: recipe?.kind === "init" ? initRoot : mode === "init" ? initRoot : root,
    findings,
    network,
    ...(log ? { log } : {}),
    recheck: async (rules) => (await doctor()).filter((f) => rules.includes(f.rule)),
  });

  /** The fix a recipe stands for, and the findings it covers now. */
  const resolveRecipe = async (recipe: Recipe): Promise<{ fix: Fix; findings: Finding[] }> => {
    if (recipe.kind === "set") return { fix: settingsProposalFix(recipe.key, recipe.value, recipe.locked), findings: [] };
    if (recipe.kind === "clear") return { fix: settingsClearFix(recipe.key), findings: [] };
    if (recipe.kind === "init") return { fix: initAppFix(recipe.choices), findings: [] };
    if (recipe.kind === "install") return { fix: installFix(), findings: [] };
    if (recipe.kind === "step") {
      const runner = runnerFor(recipe.id);
      if (!runner) throw new HostError("not_found", `no guided runner for ${recipe.id}`, 404);
      return { fix: stepFix(runner, recipe.fields, stepDeps), findings: [] };
    }
    const list = await fixes();
    const fix = list.find((f) => f.id === recipe.fixId);
    if (!fix) throw new HostError("not_found", `no fix ${recipe.fixId}`, 404);
    const findings = (await doctor()).filter((f) => f.fix?.id === fix.id && (recipe.subject === undefined || f.subject === recipe.subject));
    return { fix, findings };
  };

  const toPlan = (fix: Fix, plan: FixPlan): SettingsPlan => {
    const base = mode === "init" ? initRoot : root;
    return {
      fixId: plan.fixId,
      summary: plan.summary,
      hash: plan.hash,
      files: plan.files.map((f) => ({ path: f.path, why: f.why, ...(f.beforeHash === null ? { created: true } : {}), ...(plan.files.length <= 40 ? { diff: fileDiff(base, f.path, f.content, f.beforeHash === null) } : {}) })),
      commands: plan.commands.map((c) => ({ tool: c.tool, args: c.args, why: c.why + (c.stdinSecret ? ` (${c.stdinSecret} on stdin)` : "") })),
      secrets: plan.secrets,
      ...(plan.files.length ? { layers: ["file" as const] } : {}),
      ...(plan.manual ? { manual: plan.manual } : {}),
      ...(fix.kind === "manual" ? { manual: plan.manual ?? "Nothing runs: follow the finding's message." } : {}),
    };
  };

  const makePlan = async (recipe: Recipe): Promise<SettingsPlan> => {
    const { fix, findings } = await resolveRecipe(recipe);
    let plan: FixPlan;
    try {
      plan = await planFix(fix, context(findings, undefined, recipe));
    } catch (err) {
      if (err instanceof ProposalError || err instanceof InitChoiceError || err instanceof SetupStepError || err instanceof StepError) throw new HostError("bad_request", err.message);
      if (err instanceof FixError) throw new HostError("error", err.message, 500);
      // The starter's own checks (a folder that isn't empty, a switch that isn't there) are the person's to correct.
      if (recipe.kind === "init" && err instanceof Error) throw new HostError("bad_request", err.message);
      throw err;
    }
    recipes.set(plan.hash, recipe);
    plans.set(plan.hash, plan);
    while (recipes.size > 200) recipes.delete(recipes.keys().next().value!);
    while (plans.size > 20) plans.delete(plans.keys().next().value!);
    return toPlan(fix, plan);
  };

  const apply = async (fixId: string, expect: string, secretValues: Record<string, unknown> | undefined): Promise<SettingsApplyResult> => {
    const recipe = recipes.get(expect);
    // An app was made since this init was planned: the wizard is on it now, so another init is stale.
    if (recipe?.kind === "init" && mode !== "init") {
      recipes.delete(expect);
      throw new HostError("stale_plan", "An app was already made in this run; the wizard is on it now. Nothing was written. Run genesis init again to make another.", 409);
    }
    if (!recipe) throw new HostError("stale_plan", "This plan is no longer current (it was applied, expired or made elsewhere). Nothing was written: plan it again and read the new plan.", 409);
    const vault = new SecretVault();
    const log = (m: string) => publish("log", { fixId, line: vault.redact(m) });
    try {
      const { fix, findings } = await resolveRecipe(recipe);
      if (fix.id !== fixId) throw new HostError("bad_request", `that plan is ${fix.id}'s, not ${fixId}'s`);
      if (fix.kind === "manual") throw new HostError("unsupported", `${fix.id} is done by hand: nothing runs`, 501);
      const ctx = context(findings, log, recipe);
      // Values for the secrets the plan names, and only those.
      const fresh = await planFix(fix, ctx);
      for (const [name, value] of Object.entries(secretValues ?? {})) {
        if (!fresh.secrets.includes(name)) throw new HostError("bad_request", `the plan doesn't use a secret named ${name}`);
        if (typeof value !== "string") throw new HostError("bad_request", `${name}'s value must be text`);
        vault.set(name, value);
      }
      const missing = fresh.secrets.filter((n) => !vault.has(n));
      if (missing.length) throw new HostError("bad_request", `${fix.id} needs ${missing.join(", ")}: type ${missing.length === 1 ? "its value" : "their values"} in, then apply`);
      publish("apply", { fixId, state: "running" });
      const result = await applyPlan(fix, fresh, { ...ctx, secrets: vault }, { expect, keepSecrets: true, ...(deps.run ? { run: deps.run } : {}) });
      recipes.delete(expect);
      plans.delete(expect);
      if (fix.id === INIT_FIX_ID && result.verify.ok && recipe.kind === "init") {
        root = path.join(initRoot, recipe.choices.folder ?? recipe.choices.slug);
        mode = "setup";
      }
      const pr = result.notes.map((n) => /https:\/\/github\.com\/\S+\/pull\/\d+/.exec(n)?.[0]).find(Boolean);
      const message = [result.written.length ? `Wrote ${result.written.length <= 5 ? result.written.join(", ") : `${result.written.length} files`}` : "", result.ran.length ? `Ran ${result.ran.join("; ")}` : "", ...result.notes, result.verify.message ?? ""].filter(Boolean).join(". ");
      publish("apply", { fixId, state: result.verify.ok ? "verified" : "unverified" });
      return vault.redactJson({ fixId, verified: result.verify.ok, ...(message ? { message } : {}), ...(pr ? { pullRequestUrl: pr } : {}) });
    } catch (err) {
      publish("apply", { fixId, state: "failed" });
      if (err instanceof HostError) throw new HostError(err.code, vault.redact(err.message), err.status);
      // The engine's own wording names the CLI; the page plans again instead.
      if (err instanceof StalePlanError || err instanceof FileConflictError) throw new HostError("stale_plan", STALE_MESSAGE, 409);
      if (err instanceof SecretError) throw new HostError("bad_request", vault.redact(err.message));
      if (err instanceof ProposalError || err instanceof InitChoiceError) throw new HostError("bad_request", vault.redact(err.message));
      throw new HostError("error", vault.redact(err instanceof Error ? err.message : String(err)), 500);
    } finally {
      vault.clear();
    }
  };

  const findingsOf = (findings: Finding[], cat: SettingsCatalogue | null, list: Fix[]): SettingsFinding[] =>
    findings.map((f, i) => {
      const registered = f.fix ? list.find((x) => x.id === f.fix!.id) : undefined;
      const step = f.fix?.id === "settings.setup" && f.subject ? cat?.keys[f.subject]?.setup : registered?.step;
      return {
        id: `f${i}`,
        rule: f.rule,
        level: f.level === "error" || f.level === "warn" ? f.level : "info",
        message: f.message,
        ...(f.file ? { file: f.file } : {}),
        ...(f.line ? { line: f.line } : {}),
        ...(f.subject ? { subject: f.subject } : {}),
        ...(f.fix ? { fix: { id: f.fix.id, kind: f.fix.kind, ...(f.fix.title ? { title: f.fix.title } : {}), ...(step ? { step } : {}), ...(f.fix.kind === "manual" ? { instructions: f.message } : {}) } } : {}),
      };
    });

  const secretsOf = (findings: Finding[], cat: SettingsCatalogue | null, values: { readonly [key: string]: unknown }): SettingsSecretStatus[] => {
    if (!cat) return [];
    const missing = new Set(findings.filter((f) => f.rule === "secret-missing" && f.level !== "info" && f.subject).map((f) => f.subject!));
    const unchecked = findings.filter((f) => f.rule === "secret-missing" && f.level === "info").map((f) => f.message);
    return neededSecrets(root, cat, values).map((s) => ({
      name: s.name,
      store: s.store,
      status: missing.has(s.name) ? "missing" : !network || unchecked.some((m) => m.split(" not checked")[0]!.split(", ").includes(s.name)) ? "unknown" : "set",
      neededBy: s.from,
    }));
  };

  const upgrades = async (): Promise<SettingsUpgrades | undefined> => {
    const status = await readUpgradeStatus(root, { ...deps.registry, network });
    if (!status) return undefined;
    const d = status.latest ? distance(status.installed, status.latest) : null;
    const kind = d?.kind ?? "unknown";
    const advisory = new Set(status.advisories.map((a) => a.package));
    return {
      packages: Object.entries(status.packages)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, current]) => ({ name, current, ...(name === "@marktiderman/genesis" && status.latest ? { latest: status.latest } : {}), distance: name === "@marktiderman/genesis" ? kind : "unknown", ...(advisory.has(name) ? { advisory: true } : {}) })),
      checkedAt: status.checkedAt,
      ...(status.source === "cache" ? { offline: true } : {}),
      ...(kind !== "current" && kind !== "unknown" ? { fix: { id: "upgrade.release", kind: "auto" as const, title: "upgrade Genesis in a pull request (never merged)" } } : {}),
    };
  };

  const state = async (): Promise<SettingsState> => {
    const findings = await doctor();
    const cat = catalogue();
    const config = readGenesisConfig(root);
    const layers = fileLayers(root);
    const resolved = cat ? resolveSettings(cat, layers) : { preset: (config?.preset ?? "max") as SettingsPreset, values: {}, sources: {}, problems: [] };
    const name = appName(root);
    const up = await upgrades().catch(() => undefined);
    return {
      app: { name, host: "cli", preset: resolved.preset, ...(up?.packages.find((p) => p.name === "@marktiderman/genesis") ? { genesisVersion: up.packages.find((p) => p.name === "@marktiderman/genesis")!.current } : {}) },
      catalogue: cat ? Object.values(cat.keys).sort((a, b) => a.key.localeCompare(b.key)) : [],
      resolved,
      layers: { file: layers.file },
      findings: findingsOf(findings, cat, await fixes()),
      secrets: secretsOf(findings, cat, resolved.values),
      capabilities: CLI_CAPABILITIES,
      ...(up ? { upgrades: up } : {}),
      audit: { entries: [] },
    };
  };


  const info = () => ({
    mode,
    root: mode === "init" ? initRoot : root,
    app: mode === "init" ? path.basename(initRoot) : appName(root),
    presets: SETTINGS_PRESETS,
    defaultPreset: "max",
    capabilities: CLI_CAPABILITIES,
    ...(mode === "init"
      ? { switches: starterSwitches(), folderEmpty: !existsSync(initRoot) || fs.readdirSync(initRoot).length === 0, ...(options.initial ? { initial: options.initial } : {}) }
      : { steps: stepList(root), needsInstall: existsSync(path.join(root, "package.json")) && !packagesInstalled(root) }),
  });

  const str = (body: Record<string, unknown>, key: string, max = 200): string => {
    const v = body[key];
    if (typeof v !== "string" || !v || v.length > max) throw new HostError("bad_request", `"${key}" must be non-empty text`);
    return v;
  };

  async function route(body: Record<string, unknown>): Promise<unknown> {
    const op = body.op;
    switch (op) {
      case "state":
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        return state();
      case "wizard.info":
        return info();
      case "upgrades":
        return (await upgrades()) ?? { packages: [] };
      case "audit":
        return { entries: [] };
      case "setValue":
      case "clearValue":
        throw new HostError("unsupported", "The wizard writes through a plan you approve: settings.plan, then apply with its hash.", 501);
      case "propose":
        throw new HostError("unsupported", "The wizard writes genesis.config.json itself: plan the change with settings.plan.", 501);
      case "setSecret":
        throw new HostError("unsupported", "The wizard sets a secret through its fix: plan secrets.set, then apply with the value.", 501);
      case "settings.plan": {
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        const key = str(body, "key");
        // The layer first, for a clear as for a set: a database clear must never remove the file's value.
        if (body.layer !== undefined && body.layer !== "file") throw new HostError("unsupported", "The wizard writes the file layer; the database layer is the app's Settings screen.", 501);
        if (body.clear === true) return { plan: await makePlan({ kind: "clear", key }) };
        if (body.locked !== undefined && typeof body.locked !== "boolean") throw new HostError("bad_request", `"locked" must be true or false`);
        if (!("value" in body)) throw new HostError("bad_request", `"value" is required`);
        return { plan: await makePlan({ kind: "set", key, value: body.value, ...(typeof body.locked === "boolean" ? { locked: body.locked } : {}) }) };
      }
      case "plan": {
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        const fixId = str(body, "fixId");
        const subject = body.subject === undefined ? undefined : str(body, "subject");
        return { plan: await makePlan({ kind: "fix", fixId, ...(subject ? { subject } : {}) }) };
      }
      case "init.plan": {
        if (mode !== "init") throw new HostError("unsupported", "This folder already has an app: the wizard is in setup.", 501);
        let choices: InitChoices;
        try {
          choices = checkInitChoices(body.app);
        } catch (err) {
          throw new HostError("bad_request", (err as Error).message);
        }
        return { plan: await makePlan({ kind: "init", choices }) };
      }
      case "apply": {
        const fixId = str(body, "fixId");
        const expect = str(body, "expect", 64);
        const secrets = body.secrets;
        if (secrets !== undefined && (!secrets || typeof secrets !== "object" || Array.isArray(secrets))) throw new HostError("bad_request", `"secrets" must map names to values`);
        const run = queue.then(() => apply(fixId, expect, secrets as Record<string, unknown> | undefined));
        queue = run.catch(() => undefined);
        return { result: await run };
      }
      case "plan.file": {
        // A planned file's full text, a page at a time, from the plan with that hash (what apply would write).
        const hash = str(body, "hash", 64);
        const file = str(body, "path", 1_000);
        const offset = body.offset === undefined ? 0 : body.offset;
        if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) throw new HostError("bad_request", `"offset" must be a whole number`);
        const plan = plans.get(hash);
        if (!plan) throw new HostError("stale_plan", "That plan is no longer here: plan it again.", 409);
        const planned = plan.files.find((f) => f.path === file);
        if (!planned) throw new HostError("not_found", `the plan writes no ${file}`, 404);
        const content = planned.content.slice(offset, offset + PLAN_FILE_PAGE);
        const next = offset + content.length;
        return { path: planned.path, why: planned.why, created: planned.beforeHash === null, offset, total: planned.content.length, content, ...(next < planned.content.length ? { next } : {}) };
      }
      case "install.plan":
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        return { plan: await makePlan({ kind: "install" }) };
      case "step.list":
        if (mode === "init") return { steps: [] };
        return { steps: stepList(root) };
      case "step.start":
      case "step.submit":
      case "step.verify": {
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        const id = str(body, "id", 100);
        if (!runnerFor(id)) throw new HostError("not_found", `No guided runner for ${id}.`, 404);
        try {
          if (op === "step.start") return await startStep(root, id, stepDeps);
          // The fields are the step's plain values; its secrets come with apply (or a check), never here.
          if (op === "step.submit") return { plan: await makePlan({ kind: "step", id, fields: body.fields ?? {} }) };
          const secrets = body.secrets;
          if (secrets !== undefined && (!secrets || typeof secrets !== "object" || Array.isArray(secrets))) throw new HostError("bad_request", `"secrets" must map names to values`);
          const result = await verifyStep(root, id, body.fields ?? {}, secrets as Record<string, unknown> | undefined, stepDeps);
          return { result: { verified: result.ok, ...(result.message ? { message: result.message } : {}) } };
        } catch (err) {
          if (err instanceof SetupStepError || err instanceof StepError) throw new HostError("bad_request", err.message);
          throw err;
        }
      }
      case "agent.start":
      case "agent.approve":
      case "agent.discard":
        throw new HostError("unsupported", "Fix with Claude isn't in this release.", 501);
      default:
        throw new HostError("unsupported", `Unknown op ${JSON.stringify(op).slice(0, 40)}.`, 501);
    }
  }

  return {
    root: () => root,
    mode: () => mode,
    async handle(request) {
      if (!request || typeof request !== "object" || Array.isArray(request)) return { status: 400, body: { error: { code: "bad_request", message: "The body must be an object." } } };
      const body = request as Record<string, unknown>;
      if (body.v !== SETTINGS_PROTOCOL_VERSION) return { status: 400, body: { error: { code: "version", message: `This wizard speaks protocol version ${SETTINGS_PROTOCOL_VERSION}.` } } };
      try {
        return { status: 200, body: await route(body) };
      } catch (err) {
        if (err instanceof HostError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
        if (err instanceof GenesisConfigError) return { status: 400, body: { error: { code: "bad_request", message: err.message } } };
        // An unexpected error's message only: never a stack, never the request.
        return { status: 500, body: { error: { code: "error", message: err instanceof Error ? err.message : "The wizard failed on that request." } } };
      }
    },
  };
}
