// @feat:forms-destinations
// The contract forms' destinations keep with the shared outbox engine
// (`@marktiderman/genesis-supabase/runner`, bundled into forms). If the engine
// changes any of these, forms' deliveries change with it, so they're pinned
// here, run through forms' own runner on the engine's source.
import * as engine from "@marktiderman/genesis-supabase/runner";
import { describe, expect, it } from "vitest";
import { defineForm, f } from "../index";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_DEFERRALS,
  createDeliveryRunner,
  defaultBackoff,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type DeliveryResult,
  type DeliverySubmission,
} from "../destinations";
import type { Condition } from "../types";

const NOW = 1_800_000_000_000;
const definition = defineForm({ id: "contract", title: "Contract", blocks: [f.shortText("name", { label: "Name" })] }).definition;
const submission: DeliverySubmission = { id: "sub-1", answers: { name: "Ada" }, submittedAt: "2026-10-26" };
const nameIsGrace: Condition = { op: "eq", left: { field: "name" }, right: { value: "Grace" } };

/**
 * An outbox that behaves like a SQL one: it hands back a delivery whose
 * outcome was `retry`, with the attempt or deferral it used, and never one
 * that finished (`sent`, `filtered`, `skipped`, `failed`).
 */
function outbox(first: Partial<ClaimedDelivery>) {
  let queue: ClaimedDelivery[] = [
    { id: "d1", destinationId: "dest-1", kind: "test", config: {}, submission, definition, attempt: 1, deferrals: 0, ...first },
  ];
  const outcomes: DeliveryOutcome[] = [];
  return {
    outcomes,
    claim: async ({ limit }: { limit: number }) => queue.splice(0, limit),
    record: async (delivery: ClaimedDelivery, outcome: DeliveryOutcome) => {
      outcomes.push(outcome);
      if (outcome.status === "retry") {
        queue = [
          {
            ...delivery,
            attempt: delivery.attempt + (outcome.counted ? 1 : 0),
            deferrals: (delivery.deferrals ?? 0) + (outcome.counted ? 0 : 1),
            redelivery: false,
          },
        ];
      }
    },
  };
}

function runnerFor(result: () => DeliveryResult, first: Partial<ClaimedDelivery> = {}, extra: { maxDeferrals?: number; maxAttempts?: number } = {}) {
  const box = outbox(first);
  const runner = createDeliveryRunner({
    claim: box.claim,
    record: box.record,
    destinations: { test: { kind: "test", deliver: async () => result() } },
    now: () => NOW,
    backoff: () => 60,
    ...extra,
  });
  return { box, runner };
}

describe("forms on the shared engine", () => {
  it("keeps the shared defaults: 8 attempts, 24 deferrals, batches of 25", () => {
    expect([DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_DEFERRALS, DEFAULT_BATCH_SIZE]).toEqual([8, 24, 25]);
    expect([engine.DEFAULT_MAX_ATTEMPTS, engine.DEFAULT_MAX_DEFERRALS, engine.DEFAULT_BATCH_SIZE]).toEqual([8, 24, 25]);
    expect(defaultBackoff).toBe(engine.defaultBackoff);
    expect([1, 2, 3, 4, 5, 6].map((a) => defaultBackoff(a, () => 0.5))).toEqual([300, 1200, 4800, 19_200, 76_800, 86_400]);
  });

  it("never retries a filtered delivery", async () => {
    const { box, runner } = runnerFor(() => ({ ok: true }), { config: { when: nameIsGrace } });
    expect(await runner.run()).toMatchObject({ claimed: 1, filtered: 1 });
    expect(await runner.run()).toMatchObject({ claimed: 0 });
    expect(box.outcomes).toEqual([{ status: "filtered" }]);
  });

  it("never retries a skipped delivery", async () => {
    const { box, runner } = runnerFor(() => ({ ok: true, notSent: "no_row" }));
    expect(await runner.run()).toMatchObject({ claimed: 1, skipped: 1 });
    expect(await runner.run()).toMatchObject({ claimed: 0 });
    expect(box.outcomes).toEqual([{ status: "skipped", reason: "no_row" }]);
  });

  it("defers on Retry-After without counting an attempt, up to maxDeferrals, then backs off", async () => {
    const { box, runner } = runnerFor(() => ({ ok: false, retryable: true, retryAfterSeconds: 30, status: 429, error: "Rate limited" }), {}, { maxDeferrals: 2 });
    for (let i = 0; i < 3; i++) await runner.run();
    expect(box.outcomes.map((o) => (o.status === "retry" ? [o.counted, o.retryAfterSeconds] : o.status))).toEqual([
      [false, 30],
      [false, 30],
      [true, 60],
    ]);
    const first = box.outcomes[0] as Extract<DeliveryOutcome, { status: "retry" }>;
    expect(first.retryAt.getTime()).toBe(NOW + 30_000);
    expect(first.httpStatus).toBe(429);
  });

  it("gives up a counted retry after maxAttempts", async () => {
    const { box, runner } = runnerFor(() => ({ ok: false, retryable: true, status: 503, error: "Unavailable" }), {}, { maxAttempts: 2 });
    for (let i = 0; i < 3; i++) await runner.run();
    expect(box.outcomes.map((o) => o.status)).toEqual(["retry", "failed"]);
    expect(box.outcomes[1]).toEqual({ status: "failed", error: "Unavailable (gave up after 2 attempts)", httpStatus: 503 });
  });

  it("fails a 410 Gone with disable, and never retries it", async () => {
    const { box, runner } = runnerFor(() => ({ ok: false, retryable: false, disable: true, status: 410, error: "Gone" }));
    expect(await runner.run()).toMatchObject({ failed: 1 });
    expect(await runner.run()).toMatchObject({ claimed: 0 });
    expect(box.outcomes).toEqual([{ status: "failed", error: "Gone", httpStatus: 410, disable: true }]);
  });
});
