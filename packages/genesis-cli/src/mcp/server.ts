/**
 * `genesis mcp`: the doctor, the settings and the fix plans as MCP tools, for any agent session
 * (config-layer design §8; Phase 3 spec §4).
 *
 * - **Read-only tools** (`readOnlyHint`): doctor_run, doctor_explain, settings_catalogue,
 *   settings_get, upgrades_status, catalog_search, fix_plan and settings_propose. A plan is data:
 *   the files with the hash of the text each expects, the commands, the secrets by name, and a
 *   hash of the whole. Planning writes nothing.
 * - **One write tool, fix_apply {fixId, hash}.** It plans again and refuses a stale hash, then
 *   asks the person through an MCP elicitation that shows the plan; only an accepted answer
 *   applies it (through the fix engine, which re-checks the hash and every file once more). A
 *   client without elicitation gets `genesis fix <id> --expect <hash>` for the person to run. A
 *   fix that needs a secret is never run here: it returns the wizard step for the person.
 * - **Never a secret value.** Settings name their secrets; settings_get says set, missing or
 *   unknown. Every result and error is scrubbed of secret-looking environment values and URL
 *   passwords, bounded in size, and an error carries a message, never a stack.
 *
 * Stdio only: the protocol owns stdout, so the server's logs and anything a command prints go to
 * stderr.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Writable } from "node:stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { SettingsError } from "@marktiderman/genesis-config/settings";
import { GenesisConfigError } from "../doctor/config.js";
import { runDoctor } from "../doctor/index.js";
import { discoverPackages } from "../doctor/package-rules.js";
import type { DoctorResult, Finding } from "../doctor/types.js";
import { applyPlan, FixError, planFix, sha256, StalePlanError } from "../fix/engine.js";
import { allFixes, type BuiltinDeps } from "../fix/registry.js";
import type { Fix, FixContext, FixPlan } from "../fix/types.js";
import { distance, readUpgradeStatus, type RegistryDeps } from "../upgrade/registry.js";
import { boundedJson, clip, hasSecretLiteral, scrub, scrubStream, scrubValues, secretValues, showInvisible } from "./bounds.js";
import { guardChildStdio } from "./stdio.js";
import { boundedPlan, catalogSearch, cliPackageDir, explainRule, findingsReport, resolveFixTarget, slimFinding, ToolInputError, type FixTarget } from "./doctor.js";
import {
  checkProposal,
  describeKey,
  envSecretStatus,
  loadCatalogue,
  ProposalError,
  settingsProposalFix,
  settingsValues,
  SETTINGS_PROPOSE_ID,
  type SecretStatusReader,
} from "./settings.js";

export interface GenesisMcpOptions {
  /** The app root. */
  root: string;
  /** The doctor's config file, as `genesis doctor -c`. */
  configPath?: string;
  /** Let genesis-behind and upgrades_status reach npm and the advisory endpoints. Default false; `genesis mcp` turns it on unless --offline. */
  network?: boolean;
  /** Leave fix_apply out: only the read-only tools (an in-process agent's server). */
  readOnly?: boolean;
  /** Where the server logs (stderr). Never given a secret value. */
  log?: (line: string) => void;
  /** The environment whose secret-looking values are scrubbed from every result. Default process.env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Test seams. */
  deps?: {
    doctor?: (options: { root: string; configPath?: string; network: boolean; base?: string }) => Promise<DoctorResult>;
    fixes?: BuiltinDeps;
    /** Fixes added after the registry's (a test's stand-in for a package fix). */
    extraFixes?: Fix[];
    registry?: Omit<RegistryDeps, "network">;
    secretStatus?: SecretStatusReader;
  };
}

/** Fixes that run the package manager attached to the terminal (stdin and stdout), which over stdio is the protocol's: the person runs them. */
const TERMINAL_ONLY = new Set(["upgrade.release"]);

/** The most an approval message carries; one longer is refused, never cut. */
const MAX_APPROVAL_CHARS = 30_000;
/** The most of the files' changed lines an approval message shows. */
const MAX_DIFF_CHARS = 12_000;

/** The lines that differ between two texts: the middle left after the common first and last lines, as `-`/`+` lines. */
export function changedLines(before: string, after: string): string[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [...a.slice(start, endA).map((l) => `- ${l}`), ...b.slice(start, endB).map((l) => `+ ${l}`)];
}

/** How long the person has to answer an approval. */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;

/** Plans made in this session, by hash: what fix_apply needs to plan the same thing again (never written to disk). */
interface Remembered {
  fixId: string;
  file?: string;
  subject?: string;
  key?: string;
  value?: unknown;
}

type JsonSchema = { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties: false };

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly: boolean;
  openWorld?: boolean;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const str = (description: string, maxLength = 200) => ({ type: "string", minLength: 1, maxLength, description });
const strList = (description: string) => ({ type: "array", items: { type: "string", minLength: 1, maxLength: 200 }, maxItems: 50, description });
const schema = (properties: JsonSchema["properties"], required: string[] = []): JsonSchema => ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });

/** Checks a call's arguments against the tool's schema (the subset the tools use). */
function checkArgs(tool: ToolDef, args: Record<string, unknown>): Record<string, unknown> {
  const { properties, required = [] } = tool.inputSchema;
  for (const key of Object.keys(args)) if (!(key in properties)) throw new ToolInputError(`${tool.name}: unknown argument "${key}" (it takes ${Object.keys(properties).join(", ") || "none"})`);
  for (const key of required) if (args[key] === undefined) throw new ToolInputError(`${tool.name}: "${key}" is required`);
  for (const [key, spec] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined || spec.type === undefined) continue;
    const bad = (what: string) => new ToolInputError(`${tool.name}: "${key}" must be ${what}`);
    if (spec.type === "boolean" && typeof value !== "boolean") throw bad("true or false");
    if (spec.type === "string") {
      if (typeof value !== "string" || !value.length) throw bad("a non-empty string");
      if (value.length > (spec.maxLength as number)) throw bad(`at most ${spec.maxLength as number} characters`);
      if (spec.pattern && !new RegExp(spec.pattern as string).test(value)) throw bad(`${spec.description as string}`);
    }
    if (spec.type === "array") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v.length || v.length > 200)) throw bad("a list of non-empty strings");
      if (value.length > (spec.maxItems as number)) throw bad(`at most ${spec.maxItems as number} items`);
    }
  }
  return args;
}

function cliVersion(): string {
  try {
    const dir = cliPackageDir();
    return dir ? (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string }).version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const INSTRUCTIONS = [
  "Genesis's doctor, settings and fixes for this app.",
  "Start with doctor_run; doctor_explain says what a rule means, catalog_search what to use for a need.",
  "Every change is a plan the person approves: fix_plan or settings_propose return a plan and its hash, writing nothing.",
  "Show the person the plan, then call fix_apply {fixId, hash}: the person is asked to approve it before anything is written.",
  "If the client can't ask, fix_apply returns the command the person runs. Secrets are never values here: settings_get says only whether each is set.",
].join(" ");

/** The Genesis MCP server for one app, not yet connected to a transport. */
export function createGenesisMcpServer(options: GenesisMcpOptions): Server {
  const root = path.resolve(options.root);
  const network = options.network ?? false;
  const log = options.log ?? (() => {});
  const env = options.env ?? process.env;
  const deps = options.deps ?? {};
  const readStatus = deps.secretStatus ?? envSecretStatus(env);
  const remembered = new Map<string, Remembered>();
  let queue: Promise<unknown> = Promise.resolve();

  // A Server, not McpServer: the tools are declared as plain JSON Schema (no zod in the CLI), and
  // fix_apply needs the low-level elicitation call.
  const server = new Server({ name: "genesis", title: "Genesis", version: cliVersion() }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });

  const doctor = (o: { network?: boolean; base?: string } = {}) =>
    (deps.doctor ?? ((d) => runDoctor({ root: d.root, ...(d.configPath ? { configPath: d.configPath } : {}), network: d.network, ...(d.base ? { base: d.base } : {}), ...(deps.registry ? { registry: deps.registry } : {}) })))({
      root,
      ...(options.configPath ? { configPath: options.configPath } : {}),
      network: o.network ?? network,
      ...(o.base ? { base: o.base } : {}),
    });

  const state = async () => {
    const { findings } = await doctor();
    const { fixes } = await allFixes(discoverPackages(root), deps.fixes ?? {});
    return { findings, fixes: [...fixes, ...(deps.extraFixes ?? [])] };
  };

  const fixContext = (findings: Finding[]): FixContext => ({
    root,
    findings,
    network,
    log,
    recheck: async (rules) => (await doctor()).findings.filter((f) => rules.includes(f.rule)),
  });

  const remember = (hash: string, entry: Remembered) => {
    remembered.delete(hash);
    remembered.set(hash, entry);
    while (remembered.size > 100) remembered.delete(remembered.keys().next().value!);
  };

  /** The secret names the catalogue declares, for scrubbing their values (read from the environment, never shown). */
  const declaredSecretNames = (): string[] => {
    try {
      return Object.values(loadCatalogue(root).catalogue.keys).flatMap((d) => (d.secret ? [d.secret.name] : []));
    } catch {
      return [];
    }
  };

  /** Scrub, then clip: a clip first could cut a secret in half and leave its start unredacted. */
  const sc = (text: string, max?: number) => clip(scrub(text, secretValues(env, declaredSecretNames())), max);
  const scrubber = () => {
    const values = secretValues(env, declaredSecretNames());
    return (text: string) => scrub(text, values);
  };

  /** The command the person runs to apply this plan themselves, or what to do by hand. */
  const personCommand = (fix: Fix, plan: FixPlan, remembered?: Remembered) =>
    fix.id === SETTINGS_PROPOSE_ID
      ? { manual: `Set "settings.${remembered?.key ?? "…"}" to ${sc(JSON.stringify(remembered?.value) ?? "null", 500)} in genesis.config.json (or approve it from a client that can ask).` }
      : { command: `genesis fix ${fix.id} --expect ${plan.hash}` };

  /** Whether fix_apply may run this plan, and if not, what the person does instead. */
  const applyAdvice = (fix: Fix, plan: FixPlan) => {
    if (fix.kind === "manual" || plan.files.length + plan.commands.length === 0) {
      return { runnable: false as const, reason: `nothing to apply${plan.manual ? `: ${sc(plan.manual, 1_000)}` : ""}` };
    }
    if (plan.secrets.length || plan.commands.some((c) => c.stdinSecret) || (fix.kind === "guided" && fix.step)) {
      // `genesis setup --step <id>` arrives with the setup wizard; until then the CLI's fix, which asks at a terminal.
      return {
        runnable: false as const,
        reason: `${fix.id} needs ${plan.secrets.length ? `secrets (${plan.secrets.join(", ")})` : "a person's input"}: it never runs over MCP. The person runs it at a terminal.`,
        command: `genesis fix ${fix.id}`,
        ...(fix.step ? { step: fix.step } : {}),
      };
    }
    if (TERMINAL_ONLY.has(fix.id)) {
      return { runnable: false as const, reason: `${fix.id} runs the package manager at a terminal: the person runs it.`, command: `genesis fix ${fix.id} --expect ${plan.hash}` };
    }
    return { runnable: true as const, next: { tool: "fix_apply", arguments: { fixId: fix.id, hash: plan.hash } }, note: "fix_apply asks the person to approve this plan before anything is written." };
  };

  const supportsApproval = () => {
    const e = server.getClientCapabilities()?.elicitation as { form?: unknown; url?: unknown } | undefined;
    // An empty elicitation capability is form mode (the spec's default); a client that lists only url can't show a form.
    return !!e && (e.form !== undefined || e.url === undefined);
  };

  /**
   * What the person reads before approving: the plan, a proposed setting's value in full, and each
   * file's changed lines. It is shown exactly as it is, or not at all: a message over its bounds, or
   * one that holds a secret's value or a secret-shaped literal (which would have to be hidden from
   * the person approving it), is refused with the reason. Invisible and direction-changing
   * characters are shown as their codes.
   */
  const approvalMessage = (fix: Fix, plan: FixPlan, seen: Remembered | undefined): { message: string } | { refused: string } => {
    let budget = MAX_DIFF_CHARS;
    const diffs: string[] = [];
    for (const f of plan.files) {
      let before = "";
      try {
        before = f.beforeHash === null ? "" : readFileSync(path.join(root, f.path), "utf8");
      } catch {
        before = "";
      }
      // The diff is drawn against the file the plan read: one that changed since would show lines
      // the plan doesn't write (and applying would refuse it anyway).
      if (f.beforeHash !== null && sha256(before) !== f.beforeHash) return { refused: `${f.path} changed since the plan was made: plan again` };
      const lines = changedLines(before, f.content);
      const text = lines.join("\n");
      if (text.length > budget) return { refused: `the plan changes more lines than an approval can show whole (over ${MAX_DIFF_CHARS} characters)` };
      budget -= text.length;
      diffs.push(`• ${f.beforeHash === null ? "create" : "write"} ${f.path}: ${f.why}`, ...lines.map((l) => `  ${l}`));
    }
    const message = [
      `Apply this Genesis change in ${path.basename(root)}?`,
      "",
      `${fix.id} (${fix.kind}): ${plan.summary}`,
      ...(fix.id === SETTINGS_PROPOSE_ID && seen?.key !== undefined ? ["", `New value of settings.${seen.key}, in full:`, JSON.stringify(seen.value, null, 2) ?? "null"] : []),
      "",
      ...diffs,
      ...plan.commands.map((c) => `• run ${[c.tool, ...c.args].join(" ")}: ${c.why}`),
      ...(plan.manual ? ["", `Then: ${plan.manual}`] : []),
      "",
      `Plan ${plan.hash.slice(0, 12)}. Nothing is written unless you approve; a plan that changed since is refused.`,
    ].join("\n");
    if (message.length > MAX_APPROVAL_CHARS) return { refused: `the plan is too large to show whole for approval (${message.length} characters)` };
    if (scrubValues(message, secretValues(env, declaredSecretNames())) !== message) return { refused: "the plan holds the value of a secret from the environment; a secret is never written by an agent" };
    if (hasSecretLiteral(message)) return { refused: "the plan holds text shaped like a secret (a private key block or a provider token), which an approval would have to hide" };
    return { message: showInvisible(message) };
  };

  const tools: ToolDef[] = [
    {
      name: "doctor_run",
      title: "Run the Genesis doctor",
      description: "Check the app against the installed Genesis. Returns the findings (rule, level, file, line, message) and the fix each declares. Writes nothing.",
      inputSchema: schema({
        rules: strList("Only these rule ids (as the findings name them)."),
        base: { ...str("A git ref change checks compare against (origin/main); letters, digits and ./_-@^~ only, not starting with -.", 200), pattern: "^[A-Za-z0-9_.@^~/][A-Za-z0-9_.@^~/-]*$" },
        offline: { type: "boolean", description: "Don't reach npm or the advisory endpoints (genesis-behind reads its cache)." },
      }),
      readOnly: true,
      openWorld: true,
      async run(args) {
        const result = await doctor({ network: network && args.offline !== true, ...(args.base ? { base: args.base as string } : {}) });
        return {
          ok: result.ok,
          genesis: `${result.genesis.uiPackage}@${result.genesis.uiVersion}`,
          errors: result.errors,
          warnings: result.warnings,
          infos: result.infos,
          ...findingsReport(result.findings, args.rules as string[] | undefined, scrubber()),
        };
      },
    },
    {
      name: "doctor_explain",
      title: "Explain a doctor rule",
      description: "What a rule checks, where it comes from (built in, a package, the app), what to use instead, and the fixes that cover it.",
      inputSchema: schema({ rule: str("The rule id (raw-tag, ui/lists-use-resource-view).") }, ["rule"]),
      readOnly: true,
      async run(args) {
        const packages = discoverPackages(root);
        const { fixes } = await allFixes(packages, deps.fixes ?? {});
        return explainRule(args.rule as string, { root, ...(options.configPath ? { configPath: options.configPath } : {}), packages, fixes });
      },
    },
    {
      name: "settings_catalogue",
      title: "List the settings catalogue",
      description: "Every setting the installed Genesis packages declare: type, defaults by preset, scope, bounds, what it requires, and the secret it needs by name.",
      inputSchema: schema({ package: str("Only this package (@marktiderman/genesis-support) or namespace (support).") }),
      readOnly: true,
      async run(args) {
        const { catalogue, declared, problems } = loadCatalogue(root);
        const want = args.package as string | undefined;
        const owner = new Map(declared.flatMap((d) => Object.keys(d.declaration.keys).map((k) => [k, d.package] as const)));
        const keys = Object.values(catalogue.keys)
          .filter((def) => !want || def.namespace === want || owner.get(def.key) === want)
          .sort((a, b) => a.key.localeCompare(b.key));
        if (want && !keys.length) throw new ToolInputError(`no installed package or namespace "${want}" declares settings`);
        return { keys: keys.map((def) => describeKey(def, owner.get(def.key))), ...(problems.length ? { declarationProblems: problems } : {}) };
      },
    },
    {
      name: "settings_get",
      title: "Read the app's settings",
      description: "The resolved value of each setting with its source (default, preset, file), any problems, and the secrets they need by name with whether each is set. Never a secret's value.",
      inputSchema: schema({ keys: strList("Only these keys (namespace.key).") }),
      readOnly: true,
      run: (args) => settingsValues(root, args.keys as string[] | undefined, readStatus),
    },
    {
      name: "upgrades_status",
      title: "Genesis upgrade status",
      description: "The installed Genesis release, npm's latest, how far behind, and any published advisory on an installed Genesis package.",
      inputSchema: schema({ offline: { type: "boolean", description: "Read only the cache." } }),
      readOnly: true,
      openWorld: true,
      async run(args) {
        const status = await readUpgradeStatus(root, { ...deps.registry, network: network && args.offline !== true });
        if (!status) return { installed: null, note: "The app has no @marktiderman/genesis umbrella installed, so there is no release to compare." };
        const behind = status.latest ? distance(status.installed, status.latest) : null;
        return {
          ...status,
          behind,
          ...(behind && behind.kind !== "current" ? { fix: "upgrade.release: genesis fix upgrade.release opens the upgrade pull request (the person runs it)" } : {}),
        };
      },
    },
    {
      name: "catalog_search",
      title: "Search the Genesis catalog",
      description: "What Genesis has for a need (\"a list screen\", \"dates\", \"a settings page\"): what to use, its import, its docs and the rule behind it.",
      inputSchema: schema({ need: str("What you need, in a few words.", 300) }, ["need"]),
      readOnly: true,
      run: async (args) => catalogSearch(args.need as string, discoverPackages(root)),
    },
    {
      name: "fix_plan",
      title: "Plan a fix",
      description: "Plan the fix for a rule's findings (or a fix id): the files it would write with the hash of the text each expects, the commands, the secrets by name, what is left to a person, and the plan's hash. Writes nothing. Pass the hash to fix_apply.",
      inputSchema: schema({
        fixId: str("A fix id, as a finding's fix names it (codemod.scope-names)."),
        rule: str("A rule id whose findings to fix."),
        file: str("Only the findings in this app-relative file.", 500),
        subject: str("Only the findings about this subject.", 500),
      }),
      readOnly: true,
      // Planning can reach outside the app: contracts.introspect reads the database, upgrade.release npm.
      openWorld: true,
      async run(args) {
        if (!args.fixId === !args.rule) throw new ToolInputError("fix_plan: pass fixId or rule (one of them)");
        const { findings, fixes } = await state();
        const target: FixTarget = resolveFixTarget(args as { fixId?: string; rule?: string; file?: string; subject?: string }, findings, fixes);
        if (!target.fix) {
          return { fixId: target.id, kind: "manual", findings: target.findings.slice(0, 50).map((f) => slimFinding(f, scrubber())), note: "A manual fix: nothing runs. Each finding's message says what to do." };
        }
        const plan = await planFix(target.fix, fixContext(target.findings));
        remember(plan.hash, { fixId: plan.fixId, ...(args.file ? { file: args.file as string } : {}), ...(args.subject ? { subject: args.subject as string } : {}) });
        return { fixId: target.fix.id, kind: target.fix.kind, title: target.fix.title, findings: target.findings.length, plan: boundedPlan(plan, scrubber()), hash: plan.hash, apply: applyAdvice(target.fix, plan) };
      },
    },
    {
      name: "settings_propose",
      title: "Propose a settings change",
      description: "Plan setting one key in genesis.config.json: checked against the catalogue, a locked value stays locked. Returns the file plan and its hash; writes nothing. Pass the hash to fix_apply with fixId settings.propose.",
      inputSchema: schema({ key: str("The setting (namespace.key)."), value: { description: "The new value (JSON), of the key's type." } }, ["key", "value"]),
      readOnly: true,
      async run(args) {
        const key = args.key as string;
        checkProposal(loadCatalogue(root).catalogue, key, args.value);
        const fix = settingsProposalFix(key, args.value);
        const plan = await planFix(fix, { root, findings: [], network, log });
        remember(plan.hash, { fixId: SETTINGS_PROPOSE_ID, key, value: args.value });
        return { fixId: SETTINGS_PROPOSE_ID, key, plan: boundedPlan(plan, scrubber()), hash: plan.hash, apply: applyAdvice(fix, plan) };
      },
    },
  ];

  if (!options.readOnly) {
    tools.push({
      name: "fix_apply",
      title: "Apply a fix the person approves",
      description:
        "Apply a plan from fix_plan or settings_propose by its fixId and hash. The person is asked to approve it first (an MCP elicitation showing the plan); nothing is written without that. A plan that changed since is refused. Without approval support, returns the command for the person to run.",
      inputSchema: schema(
        {
          fixId: str("The plan's fixId."),
          hash: { ...str("The plan's hash (64 hex characters).", 64), pattern: "^[0-9a-f]{64}$" },
        },
        ["fixId", "hash"],
      ),
      readOnly: false,
      async run(args) {
        // One apply at a time: two approvals racing on the same files would both pass their checks.
        const run = queue.then(() => applyOne(args.fixId as string, args.hash as string));
        queue = run.catch(() => {});
        return run;
      },
    });
  }

  async function applyOne(fixId: string, hash: string) {
    const seen = remembered.get(hash);
    let fix: Fix;
    let ctx: FixContext;
    if (fixId === SETTINGS_PROPOSE_ID) {
      if (!seen || seen.fixId !== fixId || seen.key === undefined) throw new ToolInputError("no settings proposal with that hash in this session: call settings_propose and show the person the plan");
      fix = settingsProposalFix(seen.key, seen.value);
      ctx = { root, findings: [], network, log };
    } else {
      const { findings, fixes } = await state();
      const narrowing = seen?.fixId === fixId ? seen : undefined;
      const target = resolveFixTarget({ fixId, ...(narrowing?.file ? { file: narrowing.file } : {}), ...(narrowing?.subject ? { subject: narrowing.subject } : {}) }, findings, fixes);
      if (!target.fix) throw new ToolInputError(`${fixId} is a manual fix: nothing runs`);
      fix = target.fix;
      ctx = fixContext(target.findings);
    }
    const plan = await planFix(fix, ctx);
    if (plan.hash !== hash) {
      throw new StalePlanError(`${fixId}: the app changed since that plan was made (plan ${hash.slice(0, 12)}, now ${plan.hash.slice(0, 12)}); nothing was written. Plan again and show the person the new plan.`);
    }
    const advice = applyAdvice(fix, plan);
    if (!advice.runnable) return { applied: false, fixId, ...advice };
    if (!supportsApproval()) {
      return {
        applied: false,
        fixId,
        reason: "This client can't ask the person to approve a change (MCP elicitation), so nothing was applied. The person can apply exactly this plan themselves:",
        ...personCommand(fix, plan, seen),
      };
    }
    const shown = approvalMessage(fix, plan, seen);
    if ("refused" in shown) {
      log(`genesis mcp: ${fix.id} not offered for approval: ${shown.refused}`);
      return {
        applied: false,
        fixId,
        reason: `Not offered for approval: ${shown.refused}. Nothing was written. The person reviews and applies it themselves:`,
        ...(fix.id === SETTINGS_PROPOSE_ID ? { manual: `Edit genesis.config.json by hand (settings.${seen?.key ?? "…"}).` } : { command: `genesis fix ${fix.id} --plan, then genesis fix ${fix.id} --expect ${plan.hash}` }),
      };
    }
    log(`genesis mcp: asking the person to approve ${fix.id} (plan ${hash.slice(0, 12)})`);
    const answer = await server.elicitInput(
      {
        mode: "form",
        message: shown.message,
        requestedSchema: { type: "object", properties: { approve: { type: "boolean", title: "Apply this plan", description: "Write the files and run the commands listed above.", default: false } }, required: ["approve"] },
      },
      { timeout: APPROVAL_TIMEOUT_MS },
    );
    if (answer.action !== "accept" || answer.content?.approve !== true) {
      log(`genesis mcp: ${fix.id} not approved (${answer.action})`);
      return { applied: false, fixId, reason: answer.action === "accept" ? "The person didn't approve it; nothing was written." : `The person ${answer.action === "decline" ? "declined" : "cancelled"}; nothing was written.` };
    }
    // applyPlan plans once more and checks every file again: what changed while the person read it is refused.
    const result = await applyPlan(fix, plan, ctx, { expect: hash });
    remembered.delete(hash);
    log(`genesis mcp: applied ${fix.id}`);
    return {
      applied: true,
      fixId,
      written: result.written,
      ran: result.ran,
      notes: result.notes.map((n) => sc(n, 1_000)),
      verify: { ok: result.verify.ok, ...(result.verify.message ? { message: sc(result.verify.message, 1_000) } : {}), ...(result.verify.remaining ? { remaining: result.verify.remaining.length } : {}) },
    };
  }

  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(
      (t): Tool => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: !t.readOnly, idempotentHint: t.readOnly, openWorldHint: t.openWorld ?? false },
      }),
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `no tool "${clip(request.params.name, 100)}" (tools/list has them)`);
    const values = () => secretValues(env, declaredSecretNames());
    const started = Date.now();
    try {
      const args = checkArgs(tool, (request.params.arguments ?? {}) as Record<string, unknown>);
      const value = await tool.run(args);
      log(`genesis mcp: ${tool.name} (${Date.now() - started} ms)`);
      return { content: [{ type: "text" as const, text: boundedJson(value, values()) }] };
    } catch (err) {
      const e = toMcpError(err, tool.name, values());
      log(`genesis mcp: ${tool.name} failed: ${e.message}`);
      throw e;
    }
  });

  return server;
}

/** Any failure as an MCP error: a message (scrubbed, bounded), never a stack. */
export function toMcpError(err: unknown, tool: string, values: readonly string[]): McpError {
  const message = (text: string) => clip(scrub(text, values), 2_000);
  // McpError's constructor prefixes "MCP error <code>: "; strip every one so a re-thrown error doesn't stack them.
  if (err instanceof McpError) return new McpError(err.code, message(err.message.replace(/^(?:MCP error -?\d+: )+/, "")));
  const raw = err instanceof Error ? err.message : String(err);
  if (err instanceof ToolInputError || err instanceof ProposalError || err instanceof SettingsError || err instanceof GenesisConfigError) return new McpError(ErrorCode.InvalidParams, message(raw));
  if (err instanceof StalePlanError || err instanceof FixError) return new McpError(ErrorCode.InvalidRequest, message(raw));
  return new McpError(ErrorCode.InternalError, message(`${tool} failed: ${raw}`));
}

/**
 * Serve over stdio: `genesis mcp`. The protocol owns stdout; anything else written there (a
 * command's console output) is moved to stderr so it can't corrupt the stream.
 */
export async function runMcpStdio(options: GenesisMcpOptions): Promise<Server> {
  const stdout = process.stdout;
  const write = stdout.write.bind(stdout) as (chunk: unknown, encoding?: BufferEncoding, cb?: (err?: Error | null) => void) => boolean;
  const protocolOut = new Writable({
    write(chunk, encoding, callback) {
      write(chunk, encoding, callback);
    },
  });
  // stderr carries the server's logs, what in-process commands print, and the stdout moved below:
  // all of it scrubbed of the secret values and secret-shaped literals the results are.
  let declared: string[] = [];
  try {
    declared = Object.values(loadCatalogue(path.resolve(options.root)).catalogue.keys).flatMap((d) => (d.secret ? [d.secret.name] : []));
  } catch {
    declared = [];
  }
  scrubStream(process.stderr, secretValues(options.env ?? process.env, declared));
  stdout.write = ((chunk: unknown, ...rest: unknown[]) => (process.stderr.write as (...a: unknown[]) => boolean)(chunk, ...rest)) as typeof stdout.write;
  // A child that inherits the terminal would write to fd 1: route its stdout to stderr, its stdin away.
  guardChildStdio();
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const server = createGenesisMcpServer({ ...options, log });
  await server.connect(new StdioServerTransport(process.stdin, protocolOut));
  log(`genesis mcp: serving ${path.resolve(options.root)} over stdio${options.network ? "" : " (offline)"}`);
  return server;
}
