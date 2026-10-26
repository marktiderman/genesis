/**
 * The outbox runner: claim a batch of due deliveries, send each to its
 * destination, and record what happened. The store is the app's (a SQL
 * outbox, a queue, a KV list): it hands over claimed deliveries and takes
 * back outcomes, and decides how claims and leases work. The runner owns the
 * rest: the destination's condition (`config.when`), batching deliveries to
 * one destination into one request where the destination can, keeping its
 * state, and turning each result into an outcome with a retry time.
 *
 * Outcomes:
 * - `sent`: delivered (or already there, on a redelivery).
 * - `filtered`: the submission doesn't match the destination's condition; nothing was sent, nothing to retry.
 * - `skipped`: the destination deliberately sent nothing (`notSent`); never retried.
 * - `retry`: a retryable failure. With the service's own Retry-After it is
 *   deferred without counting an attempt (`counted: false`); otherwise it backs
 *   off by attempt (`counted: true`), until `maxAttempts`.
 * - `failed`: permanent, an unknown kind, or out of attempts. With `disable:
 *   true` the receiver asked to be switched off (a webhook's 410 Gone): the
 *   app should disable the destination rather than keep sending to it.
 *
 * It never throws for a delivery's failure, and never logs answers, contact
 * details or secrets: only ids, kinds and the destinations' safe messages.
 *
 * It is the shared outbox engine (`createRunner` from
 * `@marktiderman/genesis-supabase/runner`, bundled into this build so forms
 * keeps no dependencies), with forms' claim, grouping by destination and
 * destinations as its sender.
 */
import {
  DEFAULT_BATCH_SIZE as SHARED_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS as SHARED_MAX_ATTEMPTS,
  DEFAULT_MAX_DEFERRALS as SHARED_MAX_DEFERRALS,
  createRunner,
  defaultBackoff as sharedBackoff,
  jobOutcome,
  type JobOutcome,
  type JobResult,
  type RunReport,
} from "@marktiderman/genesis-supabase/runner";
import type { FormDefinition, Json } from "../types";
import { passesCondition } from "./condition";
import {
  deliveryFailure,
  type DeliveryItem,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
  type DestinationConfig,
} from "./types";

/** One claimed delivery, as the app's store hands it over. */
export interface ClaimedDelivery {
  /** The delivery's id: stable across its retries (the email idempotency key, the webhook-id). */
  id: string;
  /** The destination's id. Deliveries to one destination are batched, and its state is kept by it. */
  destinationId: string;
  /** The destination's kind: a key of `destinations`. */
  kind: string;
  /** The destination's config (no secrets). */
  config: DestinationConfig;
  /** What the destination cached last time (`DeliveryResult.state`), as stored. */
  state?: Record<string, Json> | undefined;
  submission: DeliverySubmission;
  definition: FormDefinition;
  /** This delivery's attempt number, from 1 for its first. */
  attempt: number;
  /**
   * How many times it was deferred so far (outcomes with `counted: false`).
   * Keep and pass it back, so `maxDeferrals` can stop a service that answers
   * "try later" forever. Default 0.
   */
  deferrals?: number | undefined;
  /**
   * An earlier attempt may have gone through (it was claimed before and timed
   * out, or its lease ran out), so destinations that can look first do.
   */
  redelivery?: boolean | undefined;
  /** An update of a submission delivered before (an edit). */
  update?: boolean | undefined;
}

export type DeliveryOutcome =
  | {
      status: "sent";
      /** It was already there (a redelivery), so nothing was sent this time. */
      alreadyThere?: boolean;
    }
  | { status: "filtered" }
  | {
      status: "skipped";
      /** Why, safe to store. */
      reason: string;
    }
  | {
      status: "retry";
      error: string;
      /** When to try again. */
      retryAt: Date;
      retryAfterSeconds: number;
      /** Whether this attempt counts toward `maxAttempts`. False when the service said when to come back. */
      counted: boolean;
      httpStatus?: number;
    }
  | {
      status: "failed";
      error: string;
      httpStatus?: number;
      /** The receiver asked to be switched off (a webhook's 410 Gone): disable the destination. */
      disable?: true;
    };

export interface ClaimRequest<Filter> {
  /** Most deliveries to claim. */
  limit: number;
  /** What `run` was given: the app's own narrowing (one response, one account). */
  filter?: Filter | undefined;
}

export interface DeliveryRunnerOptions<Filter = undefined> {
  /** Claims up to `limit` due deliveries, each held (leased) so no other runner sends it meanwhile. */
  claim(request: ClaimRequest<Filter>): Promise<readonly ClaimedDelivery[]>;
  /**
   * Records an outcome. Resolve `false` when the claim was no longer held
   * (its lease ran out and another runner took it): it is counted as stale.
   * A rejection is logged and counted as unrecorded; the lease then runs out
   * and the delivery comes back on its own.
   */
  record(delivery: ClaimedDelivery, outcome: DeliveryOutcome): Promise<void | boolean>;
  /** Keeps a destination's new state (a sheet's header and last row). Failures are logged, never fatal. */
  saveState?: ((destinationId: string, state: Record<string, Json>) => Promise<void>) | undefined;
  /** The destinations by kind. */
  destinations: Readonly<Record<string, Destination>>;
  now?: (() => number) | undefined;
  /** Safe lines (ids, kinds, short reasons). Default: nothing is logged. */
  log?: ((message: string) => void) | undefined;
  /** Deliveries claimed per run. Default 25. */
  batchSize?: number | undefined;
  /** Counted attempts before a retryable failure is given up. Default `DEFAULT_MAX_ATTEMPTS` (8). */
  maxAttempts?: number | undefined;
  /**
   * Deferrals (Retry-After, no attempt counted) allowed before a further one
   * counts as an attempt and backs off. Default `DEFAULT_MAX_DEFERRALS` (24).
   */
  maxDeferrals?: number | undefined;
  /** Seconds to wait after a counted failed attempt. Default `defaultBackoff`. */
  backoff?: ((attempt: number) => number) | undefined;
}

export interface DeliveryReport {
  claimed: number;
  sent: number;
  filtered: number;
  skipped: number;
  /** Retryable failures, backed off by attempt. */
  retrying: number;
  /** Retryable failures the service said when to retry; no attempt used. */
  deferred: number;
  failed: number;
  /** Recorded after the claim was lost (`record` resolved false). */
  stale: number;
  /** `record` threw. */
  unrecorded: number;
}

export interface RunOptions<Filter> {
  filter?: Filter | undefined;
  /** Overrides `batchSize` for this run. */
  limit?: number | undefined;
  /** Aborts the sends in flight; their outcomes are recorded as retries. */
  signal?: AbortSignal | undefined;
}

export interface DeliveryRunner<Filter = undefined> {
  /** One claim, its sends and their records. Never rejects for a delivery's failure; a failing `claim` rejects. */
  run(options?: RunOptions<Filter>): Promise<DeliveryReport>;
}

// Declared here (with their types written out) so this build's types stand alone.
export const DEFAULT_MAX_ATTEMPTS: number = SHARED_MAX_ATTEMPTS;
export const DEFAULT_MAX_DEFERRALS: number = SHARED_MAX_DEFERRALS;
export const DEFAULT_BATCH_SIZE: number = SHARED_BATCH_SIZE;

/**
 * 5 minutes, quadrupling each attempt, at most 24 hours: 5m, 20m, 80m, 5h20m,
 * 21h20m, then 24h. Across the default 8 attempts that is about 3 days, as
 * Standard Webhooks suggests. Each wait is jittered by up to ±20%, so
 * deliveries that failed together (a receiver's outage) don't all come back
 * at once. `random` (default `Math.random`) is for tests.
 */
export const defaultBackoff: (attempt: number, random?: () => number) => number = sharedBackoff;

// The shared runner's outcome and report are these, field for field.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameOutcome: Same<DeliveryOutcome, JobOutcome> = true;
const sameReport: Same<DeliveryReport, RunReport> = true;
void sameOutcome;
void sameReport;

/** Turns a destination's result into an outcome for a delivery on its `attempt`. */
export function deliveryOutcome(
  result: DeliveryResult,
  attempt: number,
  options: {
    now?: number | undefined;
    maxAttempts?: number | undefined;
    backoff?: ((attempt: number) => number) | undefined;
    /** Deferrals so far (`ClaimedDelivery.deferrals`). */
    deferrals?: number | undefined;
    maxDeferrals?: number | undefined;
  } = {},
): DeliveryOutcome {
  return jobOutcome(result.ok ? { ok: true, notSent: result.notSent } : result, attempt, options);
}

export function createDeliveryRunner<Filter = undefined>(options: DeliveryRunnerOptions<Filter>): DeliveryRunner<Filter> {
  // App code: a logger that throws must never stop an outcome being recorded.
  const log = (message: string): void => {
    try {
      options.log?.(message);
    } catch {
      // Ignored.
    }
  };

  /** Sends one destination's deliveries; resolves one result per delivery, in order. */
  async function send(group: readonly ClaimedDelivery[], signal: AbortSignal | undefined): Promise<(DeliveryResult | "filtered")[]> {
    const first = group[0]!;
    const destination = options.destinations[first.kind];
    if (!destination) {
      return group.map(() => ({ ok: false, retryable: false, error: `No destination for kind ${first.kind}` }));
    }
    // The condition first: a submission that doesn't match is never sent.
    const results: (DeliveryResult | "filtered" | null)[] = group.map((d) => {
      try {
        return passesCondition(d.submission, d.definition, d.config) ? null : "filtered";
      } catch (error) {
        return deliveryFailure(error);
      }
    });
    const due = group.filter((_, i) => results[i] === null);
    let state = first.state;
    const keep = (result: DeliveryResult) => {
      if (result.ok && result.state) state = result.state;
    };
    const guard = async (call: () => Promise<DeliveryResult>): Promise<DeliveryResult> => {
      try {
        return await call();
      } catch (error) {
        // Destinations never throw; an app-written one might.
        return deliveryFailure(error);
      }
    };
    const base = { state, signal, destinationId: first.destinationId };
    let sent: DeliveryResult[];
    if (due.length > 1 && destination.deliverBatch) {
      const items: DeliveryItem[] = due.map((d) => ({ submission: d.submission, definition: d.definition, deliveryId: d.id, update: d.update }));
      const result = await guard(() =>
        destination.deliverBatch!(items, first.config, { ...base, redelivery: due.some((d) => d.redelivery) }),
      );
      keep(result);
      sent = due.map(() => result);
    } else {
      sent = [];
      for (const d of due) {
        const result = await guard(() =>
          destination.deliver(d.submission, d.definition, d.config, {
            ...base,
            state,
            deliveryId: d.id,
            redelivery: d.redelivery,
            update: d.update,
          }),
        );
        keep(result);
        sent.push(result);
      }
    }
    if (state !== first.state && state && options.saveState) {
      try {
        await options.saveState(first.destinationId, state);
      } catch {
        log(`Saving destination ${first.destinationId}'s state failed`);
      }
    }
    let next = 0;
    return results.map((r) => r ?? sent[next++]!);
  }

  return createRunner<ClaimedDelivery, Filter>({
    claim: options.claim,
    // One group per destination: a sheet gets one append for all its rows.
    group: (delivery) => delivery.destinationId,
    async send(group, { signal }) {
      const results = await send(group, signal);
      return results.map((result, i): JobResult | "filtered" => {
        if (result === "filtered") return result;
        if (!result.ok) return result;
        return { ok: true, notSent: result.notSent, alreadyThere: result.skipped?.includes(group[i]!.submission.id) && !result.notSent };
      });
    },
    record: options.record,
    now: options.now,
    log: options.log,
    label: (delivery) => `Delivery ${delivery.id} (${delivery.kind})`,
    recordLabel: (delivery) => `delivery ${delivery.id}`,
    batchSize: options.batchSize,
    maxAttempts: options.maxAttempts,
    maxDeferrals: options.maxDeferrals,
    backoff: options.backoff,
  });
}
