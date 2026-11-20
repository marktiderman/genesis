/**
 * `genesis setup --step <id>` at a terminal: run one guided step there, the same runner the
 * wizard's Guided steps tab uses.
 *
 * 1. What to do in the outside service, and the links.
 * 2. What is there now (the runner's detect).
 * 3. The step's values, asked one by one (never a secret).
 * 4. The plan, approved with a yes; each secret it needs asked hidden (S2's prompt), held in a
 *    vault for this run, sent on stdin only.
 * 5. Apply and verify. A manual step prints its instructions and runs only the verify.
 *
 * Everything printed is redacted against the values typed in.
 */
import { applyPlan, planFix } from "../fix/engine.js";
import { describePlan } from "../fix/command.js";
import { SecretVault } from "../exec/secret-vault.js";
import { runnerFor, startStep, stepFix, STEP_RUNNERS, type StepDeps } from "./steps/index.js";

export interface StepCommandOptions {
  root: string;
  id: string;
  network: boolean;
}

export interface StepCommandIo {
  out: (line: string) => void;
  err: (line: string) => void;
  /** A plain question (a field's value). */
  ask: (question: string) => Promise<string>;
  confirm: (question: string) => Promise<boolean>;
  /** A secret, without echo. */
  askSecret: (question: string) => Promise<string>;
  deps?: Omit<StepDeps, "network">;
}

/** The exit code: 0 verified, 1 not done or failed. */
export async function runStepCommand(options: StepCommandOptions, rawIo: StepCommandIo): Promise<number> {
  const vault = new SecretVault();
  const io = { ...rawIo, out: (l: string) => rawIo.out(vault.redact(l)), err: (l: string) => rawIo.err(vault.redact(l)) };
  const runner = runnerFor(options.id);
  if (!runner) {
    io.err(`✗ No guided step ${options.id} (the steps: ${STEP_RUNNERS.map((r) => r.step.id).join(", ")}).`);
    return 1;
  }
  const deps: StepDeps = { ...rawIo.deps, network: options.network };
  const { step } = runner;
  try {
    io.out(`${step.title} (${step.id})`);
    step.instructions.forEach((line, i) => io.out(`  ${i + 1}. ${line}`));
    for (const link of step.links) io.out(`  ${link.label}: ${link.url}`);
    const { detected } = await startStep(options.root, step.id, deps);
    if (detected.length) {
      io.out("");
      detected.forEach((l) => io.out(`  ${l}`));
    }
    io.out("");
    const fields: Record<string, string> = {};
    for (const f of step.fields) {
      const answer = (await io.ask(`${f.label}${f.optional ? " (optional)" : ""}${f.placeholder ? ` [${f.placeholder}]` : ""}: `)).trim();
      if (answer) fields[f.name] = answer;
    }
    const fix = stepFix(runner, fields, deps);
    const context = { root: options.root, findings: [], network: options.network, log: (m: string) => io.out(`  ${m}`) };
    const plan = await planFix(fix, context);
    describePlan(fix, plan).forEach((l) => io.out(l));
    let verified;
    if (fix.kind === "manual") {
      verified = await fix.verify!({ root: options.root, findings: [] });
    } else {
      if (!(await io.confirm(`Run ${step.id}?`))) {
        io.out("Nothing was run.");
        return 1;
      }
      for (const name of plan.secrets) {
        const help = step.needs.find((n) => n.name === name)?.help;
        vault.set(name, await io.askSecret(`${name}${help ? ` (${help})` : ""}, hidden: `));
      }
      const result = await applyPlan(fix, plan, { ...context, secrets: vault }, { keepSecrets: true, ...(rawIo.deps?.run ? { run: rawIo.deps.run } : {}) });
      for (const r of result.ran) io.out(`  ran ${r}`);
      for (const n of result.notes) io.out(n);
      verified = result.verify;
    }
    if (verified.ok) io.out(`✔ ${step.id}: ${verified.message ?? "verified"}`);
    else io.err(`✗ ${step.id} isn't verified: ${verified.message ?? "the check failed"}`);
    return verified.ok ? 0 : 1;
  } catch (err) {
    io.err(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    vault.clear();
  }
}
