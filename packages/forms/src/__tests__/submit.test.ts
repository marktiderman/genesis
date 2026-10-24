// @feat:forms-submit
// submitResponse: the server's one call for a submit. It checks the submission again,
// snapshots the options picked and stores it once per idempotency key.
import { describe, expect, it } from "vitest";
import {
  createForm,
  defineForm,
  f,
  fingerprint,
  isOtherValue,
  type FieldBlock,
  type FormDefinition,
  type HostOptions,
} from "../index";
import {
  isSubmitResult,
  submitOutcome,
  submitResponse,
  type StoredSubmissionRef,
  type SubmissionRecord,
  type SubmissionStore,
  type SubmitRequest,
  type SubmitResult,
} from "../server";

const lists: HostOptions = {
  locations: [
    { value: "riverside", label: "Riverside Gym" },
    { value: "hilltop", label: "Hilltop Fitness" },
  ],
  coaches: [
    { value: "ada", label: "Ada", attributes: { location: "riverside" } },
    { value: "zoe", label: "Zoë", attributes: { location: "hilltop" } },
  ],
};

const def = defineForm({
  id: "visit",
  title: "Your visit",
  hidden: { member: f.hidden.string({ source: "server" }), utm: f.hidden.string() },
  blocks: [
    f.dropdown("location", {
      label: "Where?",
      required: true,
      optionsFrom: { source: "host", key: "locations" },
      prefill: { param: "location", hideWhenPrefilled: true },
    }),
    f.singleChoice("coach", {
      label: "Who coached you?",
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
    }),
    f.multiChoice("helpers", {
      label: "Who else helped?",
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
      other: true,
    }),
    f.rating("overall", { label: "Overall?", required: true }),
  ],
}).definition as FormDefinition;
const fieldOf = (key: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!;

const KEY = "3f0c8a52-6a5e-4c2b-9d1e-0b7c4f2a9e11";
const request = (over: Partial<SubmitRequest> = {}): SubmitRequest => ({
  idempotencyKey: KEY,
  answers: { location: "riverside", overall: 4 },
  ...over,
});

function memoryStore(options: { find?: boolean } = {}) {
  const rows = new Map<string, SubmissionRecord & { id: string }>();
  let n = 0;
  const ref = (r: SubmissionRecord & { id: string }): StoredSubmissionRef => ({ id: r.id, receivedAt: r.receivedAt, inputHash: r.inputHash });
  const store: SubmissionStore = {
    async save(record) {
      const k = `${record.formId}:${record.idempotencyKey}`;
      const existing = rows.get(k);
      if (existing) return { duplicate: ref(existing) };
      const id = `resp-${++n}`;
      rows.set(k, { ...record, id });
      return { id };
    },
  };
  if (options.find !== false) {
    store.find = async (formId, key) => {
      const r = rows.get(`${formId}:${key}`);
      return r ? ref(r) : null;
    };
  }
  return { store, rows };
}

const at = new Date("2026-10-24T12:00:00.000Z");
const opts = (store: SubmissionStore, over: Record<string, unknown> = {}) => ({
  definition: def,
  hostOptions: lists,
  store,
  context: { member: "m-1" },
  now: () => at,
  log: () => {},
  ...over,
});

describe("submitResponse", () => {
  it("stores a valid submission once and answers its id and time", async () => {
    const { store, rows } = memoryStore();
    const result = await submitResponse(
      request({ hidden: { utm: "poster", member: "forged" }, clientSubmittedAt: Date.parse("2026-10-24T11:59:00Z") }),
      opts(store),
    );
    expect(result).toEqual({ ok: true, id: "resp-1", receivedAt: "2026-10-24T12:00:00.000Z" });
    const row = [...rows.values()][0]!;
    expect(row).toMatchObject({
      formId: "visit",
      idempotencyKey: KEY,
      definitionVersion: fingerprint(def),
      receivedAt: "2026-10-24T12:00:00.000Z",
      clientSubmittedAt: "2026-10-24T11:59:00.000Z",
      answers: { location: "riverside", overall: 4 },
      hidden: { utm: "poster" },
      context: { member: "m-1" },
      ending: null,
    });
    expect(row.ignored).toContain("hidden.member");
    expect(row.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes formId and version from the host", async () => {
    const { store, rows } = memoryStore();
    await submitResponse(request(), opts(store, { formId: "form-uuid-1", version: "v3" }));
    expect([...rows.values()][0]).toMatchObject({ formId: "form-uuid-1", definitionVersion: "v3" });
  });

  it("refuses an invalid submission with its errors, and stores nothing", async () => {
    const { store, rows } = memoryStore();
    const missing = await submitResponse(request({ answers: { location: "riverside" } }), opts(store));
    expect(missing).toMatchObject({ ok: false, reason: "invalid" });
    expect(missing.ok === false && missing.reason === "invalid" && missing.errors.overall).toBeTruthy();
    expect(await submitResponse(request({ answers: { location: "riverside", overall: 99 } }), opts(store))).toMatchObject({
      reason: "invalid",
    });
    expect(rows.size).toBe(0);
  });

  it("refuses a missing or malformed idempotency key, and a body that isn't an object", async () => {
    const { store } = memoryStore();
    for (const key of [undefined, "", "short", "has spaces in it, sixteen+", "x".repeat(129), 42]) {
      const result = await submitResponse(request({ idempotencyKey: key as never }), opts(store));
      expect(result).toMatchObject({ ok: false, reason: "invalid", errors: { "": expect.stringContaining("idempotency key") } });
    }
    expect(await submitResponse(null as never, opts(store))).toMatchObject({ reason: "invalid" });
    expect(await submitResponse([] as never, opts(store))).toMatchObject({ reason: "invalid" });
  });

  it("answers a retry with the same key as a duplicate of the first, storing one", async () => {
    const { store, rows } = memoryStore();
    const first = await submitResponse(request(), opts(store));
    // The device's copy has been through JSON, as it is over the wire.
    const again = await submitResponse(JSON.parse(JSON.stringify(request())) as SubmitRequest, opts(store));
    expect(first.ok).toBe(true);
    expect(again).toEqual({ ok: false, reason: "duplicate", id: "resp-1", receivedAt: "2026-10-24T12:00:00.000Z" });
    expect(rows.size).toBe(1);
    expect(submitOutcome(again)).toBe("delivered");
  });

  it("relies on save alone when the store has no find (a race), still storing one", async () => {
    const { store, rows } = memoryStore({ find: false });
    const [a, b] = await Promise.all([submitResponse(request(), opts(store)), submitResponse(request(), opts(store))]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ reason: "duplicate", id: "resp-1" });
    expect(rows.size).toBe(1);
  });

  it("refuses a key used before for other answers instead of calling it delivered", async () => {
    for (const find of [true, false]) {
      const { store, rows } = memoryStore({ find });
      await submitResponse(request(), opts(store));
      const reused = await submitResponse(request({ answers: { location: "hilltop", overall: 1 } }), opts(store));
      expect(reused).toMatchObject({ ok: false, reason: "invalid", errors: { "": expect.stringContaining("already used") } });
      expect(rows.size).toBe(1);
    }
  });

  it("answers a retry as a duplicate even after the form closed or the client is rate limited (with find)", async () => {
    const { store } = memoryStore();
    await submitResponse(request(), opts(store));
    expect(await submitResponse(request(), opts(store, { open: false }))).toMatchObject({ reason: "duplicate" });
    expect(await submitResponse(request(), opts(store, { rateLimit: () => false }))).toMatchObject({ reason: "duplicate" });
  });

  it("answers closed and rate_limited, and lets a submission on when the rate limit throws", async () => {
    const { store, rows } = memoryStore();
    expect(await submitResponse(request(), opts(store, { open: false }))).toEqual({ ok: false, reason: "closed" });
    expect(await submitResponse(request(), opts(store, { rateLimit: async () => false }))).toEqual({ ok: false, reason: "rate_limited" });
    expect(rows.size).toBe(0);
    const logs: string[] = [];
    const through = await submitResponse(
      request(),
      opts(store, {
        rateLimit: () => {
          throw new Error("counter down");
        },
        log: (m: string) => logs.push(m),
      }),
    );
    expect(through.ok).toBe(true);
    expect(logs.join()).toContain("rate limit");
  });

  it("answers store_failed when the store throws, and logs no answer", async () => {
    const logs: string[] = [];
    const store: SubmissionStore = {
      save: async () => {
        throw new Error("connection reset");
      },
    };
    const result = await submitResponse(request({ answers: { location: "riverside", overall: 4 } }), opts(store, { log: (m: string) => logs.push(m) }));
    expect(result).toEqual({ ok: false, reason: "store_failed" });
    expect(submitOutcome(result)).toBe("retry");
    expect(logs.join()).toContain("connection reset");
    expect(logs.join()).not.toContain("riverside");

    const findFails: SubmissionStore = {
      save: async () => ({ id: "x" }),
      find: async () => {
        throw new Error("timeout");
      },
    };
    expect(await submitResponse(request(), opts(findFails))).toEqual({ ok: false, reason: "store_failed" });
    const noId: SubmissionStore = { save: async () => ({ id: "" }) };
    expect(await submitResponse(request(), opts(noId))).toEqual({ ok: false, reason: "store_failed" });
  });

  it("snapshots the options picked, with their labels now, and an Other answer as other", async () => {
    const { store, rows } = memoryStore();
    expect(isOtherValue(fieldOf("helpers"), "My friend")).toBe(true);
    const result = await submitResponse(
      request({ answers: { location: "riverside", coach: "ada", helpers: ["ada", "My friend"], overall: 5 } }),
      opts(store),
    );
    expect(result.ok).toBe(true);
    expect([...rows.values()][0]!.snapshots).toEqual({
      location: { value: "riverside", label: "Riverside Gym" },
      coach: { value: "ada", label: "Ada" },
      helpers: [
        { value: "ada", label: "Ada" },
        { value: "My friend", label: "My friend", other: true },
      ],
    });
  });

  it("checks host options from the server, never the client, and refuses one outside the filter", async () => {
    const { store, rows } = memoryStore();
    // Zoë coaches at Hilltop: not one of Riverside's.
    const filtered = await submitResponse(request({ answers: { location: "riverside", coach: "zoe", overall: 3 } }), opts(store));
    expect(filtered).toMatchObject({ ok: false, reason: "invalid", errors: { [fieldOf("coach").id]: expect.any(String) } });
    // A value the server's list doesn't have, whatever the client claims.
    const forged = await submitResponse(request({ answers: { location: "made-up", overall: 3 } }), opts(store));
    expect(forged).toMatchObject({ reason: "invalid" });
    // An "Other" answer only where the question takes one.
    const otherCoach = await submitResponse(request({ answers: { location: "riverside", coach: "Someone new", overall: 3 } }), opts(store));
    expect(otherCoach).toMatchObject({ reason: "invalid" });
    expect(rows.size).toBe(0);
  });

  it("accepts a prefilled answer from the link, replayed from the event log", async () => {
    const { store, rows } = memoryStore();
    const engine = createForm(def, { hostOptions: lists, linkParams: { location: "hilltop" }, clock: () => undefined });
    engine.setValue(fieldOf("overall").id, 5);
    expect(engine.submit()).toBe(true);
    const result = await submitResponse({ idempotencyKey: KEY, events: engine.getState().events }, opts(store));
    expect(result.ok).toBe(true);
    expect([...rows.values()][0]).toMatchObject({
      answers: { location: "hilltop", overall: 5 },
      snapshots: { location: { value: "hilltop", label: "Hilltop Fitness" } },
    });
  });

  it("drops answers logic hides and fields it doesn't know", async () => {
    const { store, rows } = memoryStore();
    const result = await submitResponse(request({ answers: { location: "riverside", overall: 2, hacked: "x" } }), opts(store));
    expect(result.ok).toBe(true);
    const row = [...rows.values()][0]!;
    expect(row.answers).toEqual({ location: "riverside", overall: 2 });
    expect(row.ignored).toContain("hacked");
  });

  it("throws for the server's own mistakes: an invalid definition, or upload fields without uploads", async () => {
    const { store } = memoryStore();
    const broken = { ...def, blocks: [{ kind: "field", id: "a", key: "a", type: "no-such-type", label: "A" }] } as FormDefinition;
    await expect(submitResponse(request(), opts(store, { definition: broken }))).rejects.toThrow(/definition is invalid/);
    const withPhoto = defineForm({ id: "p", title: "P", blocks: [f.photo("photo", { label: "Photo" })] }).definition as FormDefinition;
    await expect(submitResponse(request({ answers: {} }), opts(store, { definition: withPhoto }))).rejects.toThrow(/upload fields/);
  });

  it("checks the files an answer names against the upload store", async () => {
    const withPhoto = defineForm({ id: "p", title: "P", blocks: [f.photo("photo", { label: "Photo" })] }).definition as FormDefinition;
    const photoId = withPhoto.blocks[0]!.id;
    const ref = { id: "up-1", name: "a.jpg", type: "image/jpeg", size: 1000 };
    const stored = {
      id: "up-1",
      fieldId: photoId,
      attemptHash: "hash-1",
      editOf: null,
      responseId: null,
      name: "a.jpg",
      contentType: "image/jpeg",
      size: 1000,
      stored: true,
      storedType: "image/jpeg",
      storedSize: 1200,
    };
    const { store, rows } = memoryStore();
    const uploads = { owner: { attemptHash: "hash-1" }, store: { uploadRefs: async () => [stored] } };
    const ok = await submitResponse(request({ answers: { [photoId]: [ref] } }), opts(store, { definition: withPhoto, uploads }));
    expect(ok.ok).toBe(true);
    expect([...rows.values()][0]!.answers[photoId]).toEqual([{ id: "up-1", name: "a.jpg", type: "image/jpeg", size: 1200 }]);

    const notMine = { owner: { attemptHash: "someone-else" }, store: { uploadRefs: async () => [stored] } };
    const refused = await submitResponse(
      request({ idempotencyKey: "a".repeat(20), answers: { [photoId]: [ref] } }),
      opts(store, { definition: withPhoto, uploads: notMine }),
    );
    expect(refused).toMatchObject({ reason: "invalid", errors: { [photoId]: expect.any(String) } });

    const down = { owner: { attemptHash: "hash-1" }, store: { uploadRefs: async () => Promise.reject(new Error("db down")) } };
    expect(
      await submitResponse(request({ idempotencyKey: "b".repeat(20), answers: { [photoId]: [ref] } }), opts(store, { definition: withPhoto, uploads: down })),
    ).toEqual({ ok: false, reason: "store_failed" });
  });
});

describe("submitOutcome and isSubmitResult", () => {
  it("maps each result to what the device does, and anything else to retry", () => {
    const cases: [SubmitResult, string][] = [
      [{ ok: true, id: "r", receivedAt: "t" }, "delivered"],
      [{ ok: false, reason: "duplicate", id: "r", receivedAt: "t" }, "delivered"],
      [{ ok: false, reason: "invalid", errors: {} }, "rejected"],
      [{ ok: false, reason: "closed" }, "rejected"],
      [{ ok: false, reason: "rate_limited" }, "retry"],
      [{ ok: false, reason: "store_failed" }, "retry"],
    ];
    for (const [result, outcome] of cases) {
      expect(isSubmitResult(result)).toBe(true);
      expect(submitOutcome(result)).toBe(outcome);
    }
    for (const junk of [null, "ok", {}, { ok: true }, { ok: true, id: "" , receivedAt: "t" }, { ok: false, reason: "teapot" }, { ok: false, reason: "invalid" }, "<html>502</html>"]) {
      expect(isSubmitResult(junk)).toBe(false);
      expect(submitOutcome(junk)).toBe("retry");
    }
  });
});
