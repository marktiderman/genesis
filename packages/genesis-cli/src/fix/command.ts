/**
 * `genesis fix [rule|fixId] [--plan] [--yes] [--expect <hash>] [--json]`.
 *
 * - With no target: the fixes the doctor's findings declare, and how many findings each covers.
 * - With a fix id or a rule id: plan the fix and print the plan with its hash. `--plan` stops there.
 *   `--yes` applies it (or, at a terminal, a yes to the prompt). `--expect <hash>` applies only the
 *   plan with that hash: a plan read earlier that has since gone stale is refused.
 * - A manual fix prints what to do; nothing runs. A guided fix runs what it can and prints the rest.
 *
 * Exit codes: 0 done (or nothing to do), 1 the fix failed, was refused or didn't verify, 2 the
 * doctor couldn't run.
 */
import { discoverPackages } from "../doctor/package-rules.js";
import { GenesisConfigError, runDoctor } from "../doctor/index.js";
import type { Finding } from "../doctor/types.js";
import { applyPlan, planFix } from "./engine.js";
import { allFixes, type BuiltinDeps } from "./registry.js";
import type { Fix, FixContext, FixPlan } from "./types.js";
import { SecretVault } from "../exec/secret-vault.js";

export interface FixCommandOptions {
  root: string;
  target?: string;
  plan?: boolean;
  yes?: boolean;
  expect?: string;
  json?: boolean;
  /** Reach the network (genesis-behind, the upgrade). Default true. */
  network?: boolean;
  configPath?: string;
}

export interface FixCommandIo {
  out: (line: string) => void;
  err: (line: string) => void;
  /** Ask the person; absent when there's no terminal (then only --yes applies). */
  confirm?: (question: string) => Promise<boolean>;
  /**
   * Ask for a secret's value without echoing it (a terminal only). Default: a hidden prompt when
   * `confirm` is given and stdin is a terminal; absent, a plan that needs a secret is refused.
   */
  promptSecret?: (name: string, question: string) => Promise<string>;
  /** Test seams for the built-in fixes. */
  deps?: BuiltinDeps;
  /** Test seam: the doctor run (default runDoctor). */
  doctor?: (options: { root: string; configPath?: string; network: boolean }) => Promise<{ findings: Finding[] }>;
}

interface Group {
  fix: Fix | null;
  id: string;
  findings: Finding[];
}

export function describePlan(fix: Fix, plan: FixPlan): string[] {
  const lines = [`${fix.id} (${fix.kind}): ${fix.title}`, `  ${plan.summary}`];
  for (const f of plan.files) lines.push(`  ${f.beforeHash === null ? "create" : "write "} ${f.path}  (${f.why})`);
  for (const c of plan.commands) lines.push(`  run    ${[c.tool, ...c.args].join(" ")}${c.stdinSecret ? ` < ${c.stdinSecret}` : ""}  (${c.why})`);
  if (plan.secrets.length) lines.push(`  needs  ${plan.secrets.join(", ")} (by name; values are never shown)`);
  if (plan.manual) lines.push(...plan.manual.split("\n").map((l, i) => `  ${i ? "      " : "then  "} ${l}`));
  lines.push(`  plan ${plan.hash}`);
  return lines;
}

export async function runFixCommand(options: FixCommandOptions, rawIo: FixCommandIo): Promise<number> {
  // Values typed in for this run live here only; everything printed is redacted against them.
  const vault = new SecretVault();
  const io: FixCommandIo = { ...rawIo, out: (l) => rawIo.out(vault.redact(l)), err: (l) => rawIo.err(vault.redact(l)) };
  try {
    return await fixCommand(options, io, vault);
  } catch (err) {
    // The doctor couldn't run (a bad config): the CLI exits 2 for it.
    if (err instanceof GenesisConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) io.out(JSON.stringify({ ok: false, error: message }, null, 2));
    else io.err(`✗ ${message}`);
    return 1;
  } finally {
    vault.clear();
    // The tail of a paste that came in after its prompt: read and thrown away, never left for the shell.
    if (terminalPrompted) {
      terminalPrompted = false;
      const { drainInput } = await import("../exec/prompt-secret.js");
      await drainInput();
    }
  }
}

async function defaultPrompt(io: FixCommandIo): Promise<FixCommandIo["promptSecret"]> {
  if (io.promptSecret) return io.promptSecret;
  if (!io.confirm || !process.stdin.isTTY) return undefined;
  const { promptHidden } = await import("../exec/prompt-secret.js");
  return (_name, question) => {
    terminalPrompted = true;
    return promptHidden(question);
  };
}

/** A hidden prompt ran at the terminal in this process: what is left on stdin is drained before exit. */
let terminalPrompted = false;

async function fixCommand(options: FixCommandOptions, io: FixCommandIo, vault: SecretVault): Promise<number> {
  const network = options.network ?? true;
  const doctor = io.doctor ?? ((o) => runDoctor({ root: o.root, ...(o.configPath ? { configPath: o.configPath } : {}), network: o.network }));
  const { findings } = await doctor({ root: options.root, ...(options.configPath ? { configPath: options.configPath } : {}), network });
  const packages = discoverPackages(options.root);
  const { fixes } = await allFixes(packages, io.deps ?? {});
  const byId = new Map(fixes.map((f) => [f.id, f]));

  const groups = new Map<string, Group>();
  for (const f of findings) {
    const id = f.fix?.id ?? `manual:${f.rule}`;
    const g = groups.get(id) ?? { fix: byId.get(id) ?? null, id, findings: [] };
    g.findings.push(f);
    groups.set(id, g);
  }

  if (!options.target) {
    const list = [...groups.values()].sort((a, b) => Number(!a.fix) - Number(!b.fix) || a.id.localeCompare(b.id));
    if (options.json) {
      io.out(JSON.stringify({ fixes: list.map((g) => ({ id: g.id, kind: g.fix?.kind ?? "manual", title: g.fix?.title ?? "follow the finding's message", findings: g.findings.length, rules: [...new Set(g.findings.map((f) => f.rule))] })) }, null, 2));
      return 0;
    }
    const runnable = list.filter((g) => g.fix);
    if (!runnable.length) io.out(findings.length ? "No finding has an automatic or guided fix; each finding's message says what to do." : "Nothing to fix.");
    for (const g of runnable) io.out(`genesis fix ${g.id}  (${g.fix!.kind}, ${g.findings.length} finding${g.findings.length === 1 ? "" : "s"}): ${g.fix!.title}`);
    const manual = list.filter((g) => !g.fix).reduce((n, g) => n + g.findings.length, 0);
    if (manual) io.out(`${manual} more finding${manual === 1 ? "" : "s"} to fix by hand (genesis doctor shows them).`);
    return 0;
  }

  // A fix id, or a rule whose findings name their fixes.
  const target = options.target;
  let chosen: Group[];
  if (byId.has(target)) chosen = [groups.get(target) ?? { fix: byId.get(target)!, id: target, findings: [] }];
  else chosen = [...groups.values()].filter((g) => g.findings.some((f) => f.rule === target) || g.id === target);
  if (!chosen.length) {
    if (options.json) io.out(JSON.stringify({ target, fixes: [] }, null, 2));
    else io.out(`Nothing to fix for ${target}: no finding of that rule, and no fix with that id.`);
    return 0;
  }

  const results: unknown[] = [];
  // Each result is redacted as it is recorded, while the values it could hold are still in the vault.
  const record = (result: unknown) => results.push(vault.redactJson(result));
  let code = 0;
  const contextFor = (fix: Fix, g: Group): FixContext => ({
    root: options.root,
    findings: g.findings,
    network,
    log: (m) => (options.json ? io.err(m) : io.out(m)),
    recheck: async (rules) => (await doctor({ root: options.root, ...(options.configPath ? { configPath: options.configPath } : {}), network })).findings.filter((f) => rules.includes(f.rule)),
  });

  // `--expect <hash>` names one plan. Every plan is read before anything is applied, so a target
  // with several fixes to apply is refused whole, not after the first one is written.
  const planned = new Map<string, FixPlan>();
  if (options.expect && !options.plan) {
    const toApply: string[] = [];
    const unplanned: Array<{ id: string; error: string }> = [];
    for (const g of chosen) {
      if (!g.fix) continue;
      let plan: FixPlan;
      try {
        plan = await planFix(g.fix, contextFor(g.fix, g));
      } catch (err) {
        unplanned.push({ id: g.fix.id, error: (err as Error).message });
        continue;
      }
      planned.set(g.fix.id, plan);
      if (g.fix.kind !== "manual" && plan.files.length + plan.commands.length > 0) toApply.push(g.fix.id);
    }
    // A fix that can't be planned can't be checked against --expect either: nothing is applied.
    if (unplanned.length) {
      for (const u of unplanned) io.err(`✗ ${u.id}: couldn't plan: ${u.error}`);
      const message = `--expect needs every fix of ${target} planned first; ${unplanned.map((u) => u.id).join(", ")} couldn't be. Nothing was written.`;
      if (options.json) io.out(JSON.stringify({ target, fixes: unplanned.map((u) => ({ id: u.id, error: u.error })), error: message }, null, 2));
      else io.err(`✗ ${message}`);
      return 1;
    }
    if (toApply.length > 1) {
      const message = `--expect names one plan, but ${target} has ${toApply.length} fixes to apply (${toApply.join(", ")}). Nothing was written; run genesis fix <id> --expect <hash> for each.`;
      if (options.json) io.out(JSON.stringify({ target, fixes: toApply.map((id) => ({ id, plan: planned.get(id), refused: "ambiguous" })), error: message }, null, 2));
      else io.err(`✗ ${message}`);
      return 1;
    }
  }

  for (const g of chosen) {
    if (!g.fix) {
      record({ id: g.id, kind: "manual", findings: g.findings });
      if (!options.json) {
        io.out(`${g.id}: nothing runs; fix by hand:`);
        for (const f of g.findings) io.out(`  ${f.file}${f.line ? `:${f.line}` : ""}  ${f.message}`);
      }
      continue;
    }
    const fix = g.fix;
    if (!g.findings.length && !options.json) io.out(`${fix.id}: no finding uses it now; planning anyway.`);
    const ctx = contextFor(fix, g);
    let plan: FixPlan;
    try {
      plan = planned.get(fix.id) ?? (await planFix(fix, ctx));
    } catch (err) {
      io.err(`✗ ${fix.id}: couldn't plan: ${(err as Error).message}`);
      record({ id: fix.id, error: (err as Error).message });
      code = 1;
      continue;
    }
    if (!options.json) io.out(describePlan(fix, plan).join("\n"));
    const actionable = plan.files.length + plan.commands.length > 0;
    if (options.plan || fix.kind === "manual" || !actionable) {
      record({ id: fix.id, kind: fix.kind, plan });
      continue;
    }
    if (options.expect && options.expect !== plan.hash) {
      io.err(`✗ ${fix.id}: the plan is now ${plan.hash}, not ${options.expect}: the app changed since that plan was read. Nothing was written; read the plan above.`);
      record({ id: fix.id, kind: fix.kind, plan, refused: "stale" });
      code = 1;
      continue;
    }
    const approved = options.yes || (io.confirm ? await io.confirm(`Apply ${fix.id}?`) : false);
    if (!approved) {
      if (!options.json) io.out(`  Not applied. Apply this plan with: genesis fix ${fix.id} --yes --expect ${plan.hash}`);
      record({ id: fix.id, kind: fix.kind, plan, applied: false });
      continue;
    }
    // The one place this fix's values are forgotten: after everything about it is printed.
    try {
      const missing = plan.secrets.filter((name) => !vault.has(name));
      if (missing.length) {
        const prompt = await defaultPrompt(io);
        if (!prompt) {
          io.err(`✗ ${fix.id} needs ${missing.join(", ")}: run genesis fix ${fix.id} at a terminal, where it asks for ${missing.length === 1 ? "the value" : "each value"} without showing it (a value is never taken from a flag or a file). Nothing was written.`);
          record({ id: fix.id, kind: fix.kind, plan, applied: false, refused: "secrets", secrets: missing });
          code = 1;
          continue;
        }
        try {
          for (const name of missing) vault.set(name, (await prompt(name, `${name} (hidden; Enter when done): `)).trim());
        } catch (err) {
          io.err(`✗ ${fix.id}: ${(err as Error).message}. Nothing was written.`);
          record({ id: fix.id, kind: fix.kind, plan, applied: false, refused: "secrets" });
          code = 1;
          continue;
        }
      }
      try {
        const applied = await applyPlan(fix, plan, { ...ctx, secrets: vault }, { expect: options.expect ?? plan.hash, keepSecrets: true });
        record({ id: fix.id, kind: fix.kind, plan: applied.plan, applied: true, written: applied.written, ran: applied.ran, notes: applied.notes, verify: { ok: applied.verify.ok, message: applied.verify.message, remaining: applied.verify.remaining?.length ?? 0 } });
        if (!options.json) {
          if (applied.written.length) io.out(`✔ Wrote ${applied.written.join(", ")}`);
          if (applied.ran.length) io.out(`✔ Ran ${applied.ran.join("; ")}`);
          for (const n of applied.notes) io.out(`  ${n}`);
          io.out(applied.verify.ok ? `✔ Verified: ${fix.rules.join(", ")} no longer report what this fix covers.` : `✗ Not verified: ${applied.verify.message ?? "the findings are still there"}`);
        }
        if (!applied.verify.ok) code = 1;
      } catch (err) {
        // applyPlan wraps what fails after it starts writing in a FixError that says what it rolled back.
        const e = err instanceof Error ? err : new Error(String(err));
        io.err(`✗ ${e.message}`);
        record({ id: fix.id, kind: fix.kind, plan, applied: false, error: e.message, refused: e.name });
        code = 1;
      }
    } finally {
      vault.clear();
    }
  }
  if (options.json) io.out(JSON.stringify(vault.redactJson({ target, fixes: results }), null, 2));
  return code;
}
