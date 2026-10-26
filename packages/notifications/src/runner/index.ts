/**
 * `@marktiderman/genesis-notifications/runner`: deprecated. The outbox engine
 * moved to `@marktiderman/genesis-supabase/runner`, where the background-job
 * queue runs on it too. Everything here is the same value or type as there,
 * re-exported so existing imports keep working for at least one more minor
 * release. Import from `@marktiderman/genesis-supabase/runner` instead.
 *
 * @deprecated Import from `@marktiderman/genesis-supabase/runner`.
 * @packageDocumentation
 */
import * as engine from "@marktiderman/genesis-supabase/runner";

// Each name is declared here (not `export *`), so editors can show it as deprecated.

/** @deprecated Import `RunnerJob` from `@marktiderman/genesis-supabase/runner`. */
export type RunnerJob = engine.RunnerJob;
/** @deprecated Import `JobResult` from `@marktiderman/genesis-supabase/runner`. */
export type JobResult = engine.JobResult;
/** @deprecated Import `JobFailure` from `@marktiderman/genesis-supabase/runner`. */
export type JobFailure = engine.JobFailure;
/** @deprecated Import `JobOutcome` from `@marktiderman/genesis-supabase/runner`. */
export type JobOutcome = engine.JobOutcome;
/** @deprecated Import `RunReport` from `@marktiderman/genesis-supabase/runner`. */
export type RunReport = engine.RunReport;
/** @deprecated Import `ClaimRequest` from `@marktiderman/genesis-supabase/runner`. */
export type ClaimRequest<Filter> = engine.ClaimRequest<Filter>;
/** @deprecated Import `SendContext` from `@marktiderman/genesis-supabase/runner`. */
export type SendContext = engine.SendContext;
/** @deprecated Import `RunnerOptions` from `@marktiderman/genesis-supabase/runner`. */
export type RunnerOptions<J extends engine.RunnerJob, Filter = undefined> = engine.RunnerOptions<J, Filter>;
/** @deprecated Import `RunOptions` from `@marktiderman/genesis-supabase/runner`. */
export type RunOptions<Filter> = engine.RunOptions<Filter>;
/** @deprecated Import `Runner` from `@marktiderman/genesis-supabase/runner`. */
export type Runner<Filter = undefined> = engine.Runner<Filter>;

/** @deprecated Import `DEFAULT_MAX_ATTEMPTS` from `@marktiderman/genesis-supabase/runner`. */
export const DEFAULT_MAX_ATTEMPTS: typeof engine.DEFAULT_MAX_ATTEMPTS = engine.DEFAULT_MAX_ATTEMPTS;
/** @deprecated Import `DEFAULT_MAX_DEFERRALS` from `@marktiderman/genesis-supabase/runner`. */
export const DEFAULT_MAX_DEFERRALS: typeof engine.DEFAULT_MAX_DEFERRALS = engine.DEFAULT_MAX_DEFERRALS;
/** @deprecated Import `DEFAULT_BATCH_SIZE` from `@marktiderman/genesis-supabase/runner`. */
export const DEFAULT_BATCH_SIZE: typeof engine.DEFAULT_BATCH_SIZE = engine.DEFAULT_BATCH_SIZE;
/** @deprecated Import `defaultBackoff` from `@marktiderman/genesis-supabase/runner`. */
export const defaultBackoff: typeof engine.defaultBackoff = engine.defaultBackoff;
/** @deprecated Import `jobOutcome` from `@marktiderman/genesis-supabase/runner`. */
export const jobOutcome: typeof engine.jobOutcome = engine.jobOutcome;
/** @deprecated Import `failureOf` from `@marktiderman/genesis-supabase/runner`. */
export const failureOf: typeof engine.failureOf = engine.failureOf;
/** @deprecated Import `createRunner` from `@marktiderman/genesis-supabase/runner`. */
export const createRunner: typeof engine.createRunner = engine.createRunner;
