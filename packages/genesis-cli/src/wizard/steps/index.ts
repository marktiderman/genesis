/**
 * The guided steps the CLI can run, and the app's list of them: every step its installed packages'
 * settings name (src/wizard/steps.ts), plus each runner whose service the app uses (a supabase/
 * folder, an eas.json), each with its runner's title, instructions, fields and links.
 */
import type { SetupStepDef } from "./define.js";
import { safeErrorMessage, SecretVault } from "../../exec/secret-vault.js";
import type { VerifyResult } from "../../fix/types.js";
import { setupSteps, type SetupStepSummary } from "../steps.js";
import { aiKeyBudget } from "./ai-key-budget.js";
import { easPush } from "./eas-push.js";
import { stepContext, StepError, type StepDeps, type StepRunner } from "./framework.js";
import { githubIssues } from "./github-issues.js";
import { resendDomain } from "./resend-domain.js";
import { sentry } from "./sentry.js";
import { supabaseLink } from "./supabase-link.js";

export { stepFix, stepFixId, StepError, type StepDeps, type StepRunner } from "./framework.js";

/** Every runner, in the order a new app wants them (Supabase first: the others keep secrets there). */
export const STEP_RUNNERS: readonly StepRunner[] = [supabaseLink, githubIssues, resendDomain, sentry, aiKeyBudget, easPush];

export function runnerFor(id: string): StepRunner | undefined {
  return STEP_RUNNERS.find((r) => r.step.id === id);
}

export interface SetupStepListing extends SetupStepSummary {
  /** The runner's metadata, when the CLI has one for the step. */
  runner?: SetupStepDef;
}

/** The app's steps: the catalogue's, with their runners, then the runners the app's services call for. */
export function stepList(root: string): SetupStepListing[] {
  let listed: SetupStepSummary[] = [];
  try {
    listed = setupSteps(root);
  } catch {
    listed = [];
  }
  const out: SetupStepListing[] = listed.map((s) => {
    const runner = runnerFor(s.id);
    return runner ? { ...s, runner: runner.step } : s;
  });
  for (const runner of STEP_RUNNERS) {
    if (out.some((s) => s.id === runner.step.id) || !runner.appliesTo?.(root)) continue;
    out.push({ id: runner.step.id, packages: runner.step.package ? [runner.step.package] : [], keys: [], secrets: runner.step.needs.map((n) => ({ name: n.name, store: n.store })), done: false, command: `genesis setup --step ${runner.step.id}`, runner: runner.step });
  }
  const order = (id: string) => {
    const i = STEP_RUNNERS.findIndex((r) => r.step.id === id);
    return i < 0 ? STEP_RUNNERS.length : i;
  };
  return out.sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));
}

function need(id: string): StepRunner {
  const runner = runnerFor(id);
  if (!runner) throw new StepError(`No guided runner for ${id}${STEP_RUNNERS.length ? ` (the CLI runs ${STEP_RUNNERS.map((r) => r.step.id).join(", ")})` : ""}.`);
  return runner;
}

/** `step.start`: the step's metadata and what is there now. Reads only. */
export async function startStep(root: string, id: string, deps: StepDeps): Promise<{ step: SetupStepDef; detected: string[] }> {
  const runner = need(id);
  const ctx = { ...stepContext(root, {}, { ...runner.step, fields: [] }, deps) };
  return { step: runner.step, detected: runner.detect ? await runner.detect(ctx) : [] };
}

/**
 * `step.verify`: the runner's test call. `secrets` are the values for the step's needs, typed in
 * for this check only; everything said back is redacted against them, and they are dropped after.
 */
export async function verifyStep(root: string, id: string, fields: unknown, secrets: Readonly<Record<string, unknown>> | undefined, deps: StepDeps): Promise<VerifyResult> {
  const runner = need(id);
  const vault = new SecretVault();
  try {
    for (const [name, value] of Object.entries(secrets ?? {})) {
      if (!runner.step.needs.some((n) => n.name === name)) throw new StepError(`${id} doesn't use a secret named ${name}`);
      if (typeof value !== "string") throw new StepError(`${name}'s value must be text`);
      vault.set(name, value);
    }
    const typed = vault.names();
    const result = await runner.verify(stepContext(root, fields, runner.step, deps), typed.length ? vault : undefined);
    const message = result.message ? safeErrorMessage(vault, result.message, "The check's message isn't shown: it may hold a secret.") : "";
    // A store never gives a value back, so a Check tests what was typed into it, not what is stored.
    const note = typed.length ? `This checked the value typed in for ${typed.join(" and ")}, not the one stored: a store never gives a value back.` : "";
    const said = [message, note].filter(Boolean).join(" ");
    return said ? { ...result, message: said } : result;
  } catch (err) {
    throw new StepError(safeErrorMessage(vault, err, "The check failed; its error isn't shown, since it may hold a secret."));
  } finally {
    vault.clear();
  }
}
