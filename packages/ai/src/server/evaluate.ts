import type { Ai } from "../define";
import type { AiContext, AiResult, Loaded, TaskDefinition } from "../types";
import { runTask } from "./run";

export interface EvalCase<Args, Out, Db> {
  name: string;
  args: Args;
  ctx: AiContext<Db>;
  /** True when the result is good enough, or a reason it isn't. */
  check: (result: AiResult<Out>) => true | string | Promise<true | string>;
}

export interface EvalReport {
  task: string;
  version: number;
  passed: number;
  failed: Array<{ name: string; reason: string }>;
}

/**
 * Runs a task's cases through the real pipeline and model, for a check before an alias, rollout or
 * prompt version changes: run it with a live key in CI or by hand, and compare reports. Cases run
 * one at a time, so a budget and the vendor's rate limit see an ordinary caller.
 */
export async function evaluate<Args, L extends Loaded, Out, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, Out, Db>,
  cases: ReadonlyArray<EvalCase<Args, Out, Db>>,
): Promise<EvalReport> {
  const report: EvalReport = { task: task.id, version: task.version, passed: 0, failed: [] };
  for (const c of cases) {
    const verdict = await c.check(await runTask(ai, task, c.args, c.ctx));
    if (verdict === true) report.passed++;
    else report.failed.push({ name: c.name, reason: verdict });
  }
  return report;
}
