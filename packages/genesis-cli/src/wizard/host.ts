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
import * as fs from "node:fs";
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
import { setupSteps } from "./steps.js";

export type WizardMode = "init" | "setup";

export interface WizardHostOptions {
  /** `setup`: the app at `root`. `init`: `root` is the folder a new app is made in. */
  mode: WizardMode;
  root: string;
  configPath?: string;
  /** Reach npm, the advisory endpoints and the secret stores. Default false. */
  network?: boolean;
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
export const WIZARD_OPS = ["wizard.info", "settings.plan", "init.plan", "install.plan", "step.list", "step.start", "step.submit", "step.verify", "agent.start", "agent.approve", "agent.discard"] as const;

/** How a plan was made, so `apply` can make the same one again. Never written to disk, never holds a secret. */
type Recipe = { kind: "install" } | { kind: "fix"; fixId: string; subject?: string } | { kind: "set"; key: string; value: unknown; locked?: boolean } | { kind: "clear"; key: string } | { kind: "init"; choices: InitChoices };

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
function appPackageManager(root: string): PackageManager {
  const found = findLockfile(root);
  if (found) return found.pm;
  return fs.existsSync(path.join(root, "pnpm-workspace.yaml")) ? "pnpm" : "npm";
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
      return { summary: `runs ${[tool, ...args].join(" ")} in the app`, commands: [{ tool: tool!, args, why: "installs what package.json lists, so the doctor and the app can run" }] };
    },
    verify: (ctx) => (fs.existsSync(path.join(ctx.root, "node_modules")) ? { ok: true } : { ok: false, message: "node_modules wasn't made" }),
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

  const context = (findings: Finding[], log?: (m: string) => void): FixContext => ({
    root: mode === "init" ? initRoot : root,
    findings,
    network,
    ...(log ? { log } : {}),
    recheck: async (rules) => (await doctor()).filter((f) => rules.includes(f.rule)),
  });

  /** The fix a recipe stands for, and the findings it covers now. */
  const resolveRecipe = async (recipe: Recipe): Promise<{ fix: Fix; findings: Finding[] }> => {
    if (recipe.kind === "set") return { fix: settingsProposalFix(recipe.key, recipe.value), findings: [] };
    if (recipe.kind === "clear") return { fix: settingsClearFix(recipe.key), findings: [] };
    if (recipe.kind === "init") return { fix: initAppFix(recipe.choices), findings: [] };
    if (recipe.kind === "install") return { fix: installFix(), findings: [] };
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
      plan = await planFix(fix, context(findings));
    } catch (err) {
      if (err instanceof ProposalError || err instanceof InitChoiceError) throw new HostError("bad_request", err.message);
      if (err instanceof FixError) throw new HostError("error", err.message, 500);
      throw err;
    }
    recipes.set(plan.hash, recipe);
    while (recipes.size > 200) recipes.delete(recipes.keys().next().value!);
    return toPlan(fix, plan);
  };

  const apply = async (fixId: string, expect: string, secretValues: Record<string, unknown> | undefined): Promise<SettingsApplyResult> => {
    const recipe = recipes.get(expect);
    if (!recipe) throw new HostError("stale_plan", "This plan wasn't made here (or has expired): plan it again and read it before applying.", 409);
    const vault = new SecretVault();
    const log = (m: string) => publish("log", { fixId, line: vault.redact(m) });
    try {
      const { fix, findings } = await resolveRecipe(recipe);
      if (fix.id !== fixId) throw new HostError("bad_request", `that plan is ${fix.id}'s, not ${fixId}'s`);
      if (fix.kind === "manual") throw new HostError("unsupported", `${fix.id} is done by hand: nothing runs`, 501);
      const ctx = context(findings, log);
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
      if (err instanceof StalePlanError) throw new HostError("stale_plan", vault.redact(err.message), 409);
      if (err instanceof FileConflictError) throw new HostError("stale_plan", vault.redact(err.message), 409);
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

  const safeSteps = () => {
    try {
      return setupSteps(root);
    } catch {
      return [];
    }
  };

  const info = () => ({
    mode,
    root: mode === "init" ? initRoot : root,
    app: mode === "init" ? path.basename(initRoot) : appName(root),
    presets: SETTINGS_PRESETS,
    defaultPreset: "max",
    capabilities: CLI_CAPABILITIES,
    ...(mode === "init"
      ? { switches: starterSwitches(), folderEmpty: !existsSync(initRoot) || fs.readdirSync(initRoot).length === 0 }
      : { steps: safeSteps(), needsInstall: existsSync(path.join(root, "package.json")) && !existsSync(path.join(root, "node_modules")) }),
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
        if (body.clear === true) return { plan: await makePlan({ kind: "clear", key }) };
        if (body.layer !== undefined && body.layer !== "file") throw new HostError("unsupported", "The wizard writes the file layer; the database layer is the app's Settings screen.", 501);
        if (!("value" in body)) throw new HostError("bad_request", `"value" is required`);
        return { plan: await makePlan({ kind: "set", key, value: body.value }) };
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
      case "install.plan":
        if (mode === "init") throw new HostError("unsupported", "There's no app yet: make one first.", 501);
        return { plan: await makePlan({ kind: "install" }) };
      case "step.list":
        if (mode === "init") return { steps: [] };
        return { steps: setupSteps(root) };
      case "step.start":
      case "step.submit":
      case "step.verify":
        throw new HostError("unsupported", "A step's guided runner (walk the service, verify it) isn't in this release: set the step's keys and secrets here.", 501);
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
