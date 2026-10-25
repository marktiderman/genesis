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
 * - `failed`: permanent, an unknown kind, or out of attempts.
 *
 * It never throws for a delivery's failure, and never logs answers, contact
 * details or secrets: only ids, kinds and the destinations' safe messages.
 */
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

export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_MAX_DEFERRALS = 24;
export const DEFAULT_BATCH_SIZE = 25;

/** 1 minute, doubling each attempt, at most 6 hours: 1m, 2m, 4m … 6h. */
export function defaultBackoff(attempt: number): number {
  return Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempt - 1));
}

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
  if (result.ok) return result.notSent ? { status: "skipped", reason: result.notSent.slice(0, 500) } : { status: "sent" };
  const http = result.status !== undefined ? { httpStatus: result.status } : {};
  if (!result.retryable) return { status: "failed", error: result.error, ...http };
  const now = options.now ?? Date.now();
  // Deferred without counting an attempt, until maxDeferrals: after that a
  // service that keeps saying "later" is backed off and given up like any other.
  if (result.retryAfterSeconds !== undefined && (options.deferrals ?? 0) < (options.maxDeferrals ?? DEFAULT_MAX_DEFERRALS)) {
    const seconds = Math.max(1, Math.ceil(result.retryAfterSeconds));
    return { status: "retry", error: result.error, retryAt: new Date(now + seconds * 1000), retryAfterSeconds: seconds, counted: false, ...http };
  }
  const max = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (attempt >= max) return { status: "failed", error: `${result.error} (gave up after ${attempt} attempts)`.slice(0, 500), ...http };
  const seconds = Math.max(1, Math.ceil((options.backoff ?? defaultBackoff)(attempt)));
  return { status: "retry", error: result.error, retryAt: new Date(now + seconds * 1000), retryAfterSeconds: seconds, counted: true, ...http };
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
  const now = () => options.now?.() ?? Date.now();

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

  return {
    async run(runOptions: RunOptions<Filter> = {}): Promise<DeliveryReport> {
      const report: DeliveryReport = {
        claimed: 0,
        sent: 0,
        filtered: 0,
        skipped: 0,
        retrying: 0,
        deferred: 0,
        failed: 0,
        stale: 0,
        unrecorded: 0,
      };
      const limit = runOptions.limit ?? options.batchSize ?? DEFAULT_BATCH_SIZE;
      const claimed = await options.claim({ limit, filter: runOptions.filter });
      report.claimed = claimed.length;

      // One group per destination: a sheet gets one append for all its rows.
      const groups = new Map<string, ClaimedDelivery[]>();
      for (const delivery of claimed) {
        const list = groups.get(delivery.destinationId) ?? [];
        list.push(delivery);
        groups.set(delivery.destinationId, list);
      }

      await Promise.all(
        [...groups.values()].map(async (group) => {
          const results = await send(group, runOptions.signal);
          const at = now();
          await Promise.all(
            group.map(async (delivery, i) => {
              const result = results[i]!;
              const outcome: DeliveryOutcome =
                result === "filtered"
                  ? { status: "filtered" }
                  : deliveryOutcome(result, delivery.attempt, {
                      now: at,
                      maxAttempts: options.maxAttempts,
                      backoff: options.backoff,
                      deferrals: delivery.deferrals,
                      maxDeferrals: options.maxDeferrals,
                    });
              if (outcome.status === "sent" && result !== "filtered" && result.ok && result.skipped?.includes(delivery.submission.id)) {
                outcome.alreadyThere = true;
              }
              if (outcome.status === "failed" || outcome.status === "retry") {
                log(`Delivery ${delivery.id} (${delivery.kind}) ${outcome.status === "failed" ? "failed" : "will be retried"}: ${outcome.error}`);
              } else if (outcome.status === "skipped") {
                log(`Delivery ${delivery.id} (${delivery.kind}) skipped: ${outcome.reason}`);
              }
              let recorded: void | boolean;
              try {
                recorded = await options.record(delivery, outcome);
              } catch {
                report.unrecorded++;
                log(`Recording delivery ${delivery.id} failed`);
                return;
              }
              if (recorded === false) report.stale++;
              else if (outcome.status === "sent") report.sent++;
              else if (outcome.status === "filtered") report.filtered++;
              else if (outcome.status === "skipped") report.skipped++;
              else if (outcome.status === "failed") report.failed++;
              else if (outcome.counted) report.retrying++;
              else report.deferred++;
            }),
          );
        }),
      );
      return report;
    },
  };
}
