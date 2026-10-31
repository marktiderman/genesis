import type { Ai } from "../define";
import type { AiContext, AiResult, Loaded, TaskDefinition } from "../types";
import { runTask } from "./run";

export interface EvalCase<Args, Out, Db> {
  name: string;
  args: Args;
  ctx: AiContext<Db>;
  /** What a good answer looks like, for scorers to compare against. */
  expected?: unknown;
  /** True when the result is good enough, or a reason it isn't. Optional when scorers judge it. */
  check?: (result: AiResult<Out>) => true | string | Promise<true | string>;
}

/** A scorer's judgement of one case: pass or not, an optional 0–1 score and a short note. */
export interface ScoreResult {
  pass: boolean;
  score?: number | undefined;
  note?: string | undefined;
}

/**
 * Judges one case's result. Code scorers (exact match, a schema, a word count) and, later,
 * model-graded judges share this shape; a judge is a scorer that calls a task.
 */
export interface Scorer<Args, Out, Db> {
  name: string;
  score: (testCase: EvalCase<Args, Out, Db>, result: AiResult<Out>) => ScoreResult | Promise<ScoreResult>;
}

/**
 * What `evaluate` runs: a task, or anything with an id, a version and a `run`, so an agent or
 * a tool trajectory evaluates the same way once it exists.
 */
export type EvalTarget<Args, L extends Loaded, Out, Db> =
  | TaskDefinition<Args, L, Out, Db>
  | { id: string; version: number; run: (args: Args, ctx: AiContext<Db>) => Promise<AiResult<Out>> };

export interface EvalReport {
  task: string;
  version: number;
  passed: number;
  failed: Array<{ name: string; reason: string }>;
  /** Every scorer's result per case, when scorers ran. */
  scores: Array<{ case: string; scorer: string } & ScoreResult>;
}

/**
 * Runs a target's cases through the real pipeline and model, for a check before an alias, rollout or
 * prompt version changes: run it with a live key in CI or by hand, and compare reports. Cases run
 * one at a time, so a budget and the vendor's rate limit see an ordinary caller. A case passes when
 * its `check` (if any) and every scorer pass.
 */
export async function evaluate<Args, L extends Loaded, Out, Db>(
  ai: Ai,
  target: EvalTarget<Args, L, Out, Db>,
  cases: ReadonlyArray<EvalCase<Args, Out, Db>>,
  options: { scorers?: ReadonlyArray<Scorer<Args, Out, Db>> } = {},
): Promise<EvalReport> {
  const report: EvalReport = { task: target.id, version: target.version, passed: 0, failed: [], scores: [] };
  const run = (args: Args, ctx: AiContext<Db>) => ("run" in target ? target.run(args, ctx) : runTask(ai, target, args, ctx));
  for (const c of cases) {
    const result = await run(c.args, c.ctx);
    const reasons: string[] = [];
    if (c.check) {
      const verdict = await c.check(result);
      if (verdict !== true) reasons.push(verdict);
    }
    for (const scorer of options.scorers ?? []) {
      const s = await scorer.score(c, result);
      report.scores.push({ case: c.name, scorer: scorer.name, ...s });
      if (!s.pass) reasons.push(`${scorer.name}${s.note ? `: ${s.note}` : ""}`);
    }
    if (!c.check && !options.scorers?.length) reasons.push("no check and no scorers");
    if (reasons.length) report.failed.push({ name: c.name, reason: reasons.join("; ") });
    else report.passed++;
  }
  return report;
}
