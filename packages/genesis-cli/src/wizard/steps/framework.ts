/**
 * The guided setup steps' runners (config-layer design §3.2, R5): each walks one outside service.
 *
 * A runner pairs a step's metadata (`defineSetupStep`, genesis-config `./setup`) with:
 *
 * - `detect`: what is there now (a project list, signed in or not). Reads only.
 * - `plan`: the commands the CLI runs, as a fix plan: the S2 setters put each secret in its store
 *   on stdin, never in argv. Writes nothing.
 * - `apply`: an outside call made after the commands, with the secrets (create a Resend domain).
 * - `verify`: a real test call, so a step ends verified or stays open.
 *
 * {@link stepFix} turns a runner and the person's field values into a {@link Fix}, so a step runs
 * through the fix engine like everything else: planned, shown, approved by its hash, applied, verified.
 * Tools and `fetch` are injected; tests stub both.
 *
 * Secrets: a runner reads a value only through `secrets.use(name, …)`, and only to put it on a
 * tool's stdin or in a request header. Never argv, a URL, a log line or an answer: every message
 * is redacted against the vault before it leaves.
 */
import { checkSetupFields, SetupStepError, type SetupStepDef } from "@marktiderman/genesis-config/setup";
import { SettingsError } from "@marktiderman/genesis-config/settings";
import { runTool, isAllowedTool, TOOL_AUTH_ENV, type ToolRunner } from "../../exec/run.js";
import { SecretVault } from "../../exec/secret-vault.js";
import { setterFor, stdinFor, storeOptions, supabaseLinked, targetsOf } from "../../exec/secret-stores.js";
import { loadCatalogue, settingsProposalFix } from "../../mcp/settings.js";
import type { ApplyContext, ApplyOutcome, Fix, FixPlan, FixPlanDraft, PlannedCommand, VerifyResult } from "../../fix/types.js";

/** The part of `fetch` a runner uses. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface StepDeps {
  run?: ToolRunner;
  fetch?: FetchLike;
  /** Reach the outside services. Off: verify says it couldn't check. */
  network?: boolean;
}

export interface StepContext {
  root: string;
  /** The person's values for the step's fields, checked against their patterns. */
  fields: Readonly<Record<string, string>>;
  run: ToolRunner;
  fetch: FetchLike;
  network: boolean;
  log?: (line: string) => void;
}

export interface StepRunner {
  step: SetupStepDef;
  /** Offered for this app even when no installed package names the step (a supabase/ folder, an eas.json). */
  appliesTo?(root: string): boolean;
  detect?(ctx: StepContext): Promise<string[]>;
  plan(ctx: StepContext): FixPlanDraft | Promise<FixPlanDraft>;
  apply?(ctx: StepContext, secrets: SecretVault): Promise<string[]>;
  /** Without `secrets` (a re-check), a runner checks what it can by name and says what it couldn't. */
  verify(ctx: StepContext, secrets?: SecretVault): Promise<VerifyResult>;
}

export class StepError extends Error {
  override name = "StepError";
}

export { SetupStepError };

const TIMEOUT_MS = 20_000;

export function stepContext(root: string, rawFields: unknown, step: SetupStepDef, deps: StepDeps, log?: (line: string) => void): StepContext {
  return {
    root,
    fields: checkSetupFields(step, rawFields),
    run: deps.run ?? runTool,
    fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
    network: deps.network ?? false,
    ...(log ? { log } : {}),
  };
}

/** The fix id a step's plan carries. */
export const stepFixId = (id: string) => `setup.${id}`;

/**
 * The commands that put one secret in its store, and what a person does by hand (EAS has no stdin
 * path). Throws when the store is Supabase and the app isn't linked yet.
 */
export function secretSetters(root: string, name: string, store: "edge" | "ci"): { commands: PlannedCommand[]; manual: string[] } {
  if (store === "edge" && !supabaseLinked(root)) throw new StepError(`${name} goes in the linked Supabase project's Edge Function secrets, and this app isn't linked yet: run genesis setup --step supabase.link first`);
  const commands: PlannedCommand[] = [];
  const manual: string[] = [];
  for (const target of targetsOf(store, root)) {
    const setter = setterFor(name, target, storeOptions(root));
    if ("command" in setter) commands.push(setter.command);
    else manual.push(setter.manual);
  }
  return { commands, manual };
}

/** The catalogue key a field is saved to: one that names this step and ends in `.<setting>`. */
function settingKey(root: string, step: SetupStepDef, setting: string): { key: string; type: string } | null {
  let keys;
  try {
    keys = loadCatalogue(root).catalogue.keys;
  } catch (err) {
    if (err instanceof SettingsError) return null;
    throw err;
  }
  const def = Object.values(keys).find((d) => d.setup === step.id && d.key.endsWith(`.${setting}`));
  return def ? { key: def.key, type: def.type } : null;
}

/** The genesis.config.json write for the step's one setting field, when an installed package declares its key. */
async function settingsDraft(ctx: StepContext, step: SetupStepDef): Promise<FixPlanDraft | null> {
  const found = step.fields.flatMap((f) => {
    const value = ctx.fields[f.name];
    if (!f.setting || value === undefined) return [];
    const key = settingKey(ctx.root, step, f.setting);
    return key ? [{ ...key, value }] : [];
  });
  if (!found.length) return null;
  if (found.length > 1) throw new StepError(`${step.id}: a step saves one setting (found ${found.map((f) => f.key).join(", ")})`);
  const { key, type, value } = found[0]!;
  const typed = type === "number" ? Number(value) : type === "boolean" ? value === "true" : value;
  return settingsProposalFix(key, typed).plan({ root: ctx.root, findings: [] });
}

/** Run the plan's commands as the engine does: argv only, each secret on stdin, output redacted. */
async function runCommands(plan: FixPlan, ctx: StepContext, vault: SecretVault): Promise<string[]> {
  const run = vault.redactingRunner(ctx.run);
  const ran: string[] = [];
  for (const c of plan.commands) {
    if (!isAllowedTool(c.tool)) throw new StepError(`"${c.tool}" isn't a tool a step may run`);
    const base = { cwd: ctx.root, passEnv: TOOL_AUTH_ENV[c.tool] ?? [], ...(ctx.log ? { onOutput: (text: string) => ctx.log!(text.replace(/\n$/, "")) } : {}) };
    const result = c.stdinSecret
      ? await vault.use(c.stdinSecret, (value) => run(c.tool as Parameters<ToolRunner>[0], c.args, { ...base, stdin: stdinFor(c.stdinFormat ?? "value", c.stdinSecret!, value) }))
      : await run(c.tool as Parameters<ToolRunner>[0], c.args, base);
    ran.push([c.tool, ...c.args].join(" ") + (c.stdinSecret ? ` < ${c.stdinSecret}` : ""));
    if (result.code !== 0) throw new StepError(`${c.tool} ${c.args[0] ?? ""} failed (exit ${result.code}): ${(result.stderr.trim() || result.stdout.trim()).split("\n").slice(-5).join("\n")}`);
  }
  return ran;
}

/**
 * A step as a fix: the person's field values in, a plan out (the setting it saves, the commands,
 * the secrets by name, what is left by hand). The engine re-plans before applying, so the fields
 * are checked again then.
 */
export function stepFix(runner: StepRunner, rawFields: unknown, deps: StepDeps = {}): Fix {
  const { step } = runner;
  const ctxFor = (root: string, log?: (line: string) => void) => stepContext(root, rawFields, step, deps, log);
  return {
    id: stepFixId(step.id),
    kind: step.manual ? "manual" : "guided",
    rules: ["setup-incomplete"],
    title: step.title,
    step: step.id,
    async plan(context): Promise<FixPlanDraft> {
      const ctx = ctxFor(context.root);
      const own = await runner.plan(ctx);
      const settings = await settingsDraft(ctx, step);
      const manual = [own.manual, settings?.manual].filter(Boolean).join("\n");
      return {
        summary: [own.summary, settings?.files?.length ? settings.summary : ""].filter(Boolean).join("; "),
        files: [...(settings?.files ?? []), ...(own.files ?? [])],
        commands: own.commands ?? [],
        secrets: [...new Set([...(own.secrets ?? []), ...step.needs.map((s) => s.name)])],
        ...(manual ? { manual } : {}),
      };
    },
    async apply(plan: FixPlan, context: ApplyContext): Promise<ApplyOutcome> {
      const vault = SecretVault.from(context.secrets);
      const ctx = ctxFor(context.root, context.log);
      const ran = await runCommands(plan, ctx, vault);
      const notes = runner.apply ? await runner.apply(ctx, vault) : [];
      return { ran, notes };
    },
    async verify(context): Promise<VerifyResult> {
      const secrets = (context as ApplyContext).secrets;
      return runner.verify(ctxFor(context.root), secrets ? SecretVault.from(secrets) : undefined);
    },
  };
}

/** A JSON request with a timeout. Never throws: a failure is `{ ok: false, status: 0 }` with the reason. */
export async function request(ctx: StepContext, url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  try {
    const res = await ctx.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * One line of remote text made safe to print at a terminal: ANSI and OSC escape sequences, every
 * other control character (newlines too: split lines first), bidi controls and zero-width
 * characters removed (a tab becomes a space), so a project name or a DNS record can't move the
 * cursor, retitle the window, hide a line or reorder what it shows.
 */
export function printable(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, "") // OSC … BEL / ST
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "") // CSI (colours, cursor)
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "") // 8-bit CSI
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

/** The verify answer when the network is off. */
export const OFFLINE: VerifyResult = { ok: false, message: "Not checked: the network is off (--offline). Run the step again online to verify it." };

/** The verify answer when a check needs a secret this run doesn't hold. */
export const needsSecret = (name: string): VerifyResult => ({ ok: false, message: `Not checked: the test call needs ${name}, which is never kept. Type it in again to check.` });
