import { describe, expect, it } from "vitest";
import { mergeResponses, type Block, type FieldBlock, type FormDefinition, type HostOptions } from "../index";
import { validateSubmission } from "../server";

const field = (id: string, type: string, extra: Partial<FieldBlock> = {}): FieldBlock => ({
  kind: "field", id, key: id, type, label: id, ...extra,
});
const form = (blocks: Block[], extra: Partial<FormDefinition> = {}): FormDefinition => ({
  schemaVersion: 1,
  id: "merge",
  title: "Merge",
  blocks,
  endings: [{ id: "default", title: "Thanks" }],
  ...extra,
});

const branching = form(
  [
    field("member", "yes-no"),
    field("since", "date"),
    field("why_not", "long-text"),
    field("score", "rating"),
    field("total", "calculated", { props: { formula: "score * 2" } }),
    field("email", "email", { identifying: true }),
  ],
  {
    logic: [
      { id: "r1", when: { op: "neq", left: { field: "member" }, right: { value: true } }, effect: "hide", target: "since" },
      { id: "r2", when: { op: "eq", left: { field: "member" }, right: { value: true } }, effect: "hide", target: "why_not" },
    ],
  },
);

describe("mergeResponses", () => {
  it("lays the patch over the base, and null clears an answer", () => {
    expect(mergeResponses(branching, { member: true, since: "2026-01-02", score: 3 }, { score: 5 })).toEqual({
      member: true,
      since: "2026-01-02",
      score: 5,
    });
    expect(mergeResponses(branching, { member: true, score: 3 }, { score: null })).toEqual({ member: true });
  });

  it("drops unknown ids, calculated values and empty answers", () => {
    expect(mergeResponses(branching, { nope: 1, total: 99, why_not: "  " }, { score: 4, email: "" })).toEqual({ score: 4 });
  });

  it("drops identifying answers on an anonymous form", () => {
    const anonymous = { ...branching, settings: { anonymous: true } };
    expect(mergeResponses(anonymous, { email: "ada@example.com" }, { score: 2 })).toEqual({ score: 2 });
    expect(mergeResponses(branching, { email: "ada@example.com" }, {})).toEqual({ email: "ada@example.com" });
  });

  it("drops answers on a path no longer taken", () => {
    const base = { member: true, since: "2026-01-02" };
    // Now not a member: "since" is hidden, "why_not" shows.
    expect(mergeResponses(branching, base, { member: false, why_not: "Too far" })).toEqual({ member: false, why_not: "Too far" });
  });

  it("keeps them with clearHiddenValues: false, or when asked", () => {
    const base = { member: true, since: "2026-01-02" };
    const keeping = { ...branching, settings: { clearHiddenValues: false } };
    expect(mergeResponses(keeping, base, { member: false })).toEqual({ member: false, since: "2026-01-02" });
    expect(mergeResponses(branching, base, { member: false }, { offPath: "keep" })).toEqual({ member: false, since: "2026-01-02" });
    expect(mergeResponses(keeping, base, { member: false }, { offPath: "drop" })).toEqual({ member: false });
  });

  it("follows jumps and hidden inputs", () => {
    const jumping = form([field("a", "yes-no"), field("b", "short-text"), field("c", "short-text")], {
      hidden: [{ name: "plan", type: "string", source: "host" }],
      logic: [
        { id: "j", when: { op: "eq", left: { field: "a" }, right: { value: true } }, effect: "jump", from: "a", to: "c" },
        { id: "h", when: { op: "eq", left: { hidden: "plan" }, right: { value: "free" } }, effect: "hide", target: "c" },
      ],
    });
    expect(mergeResponses(jumping, { b: "skipped", c: "kept" }, { a: true })).toEqual({ a: true, c: "kept" });
    expect(mergeResponses(jumping, { b: "x", c: "y" }, {}, { hidden: { plan: "free" } })).toEqual({ b: "x" });
  });

  it("drops a pick its filtered list no longer shows, whichever side changed", () => {
    const lists: HostOptions = {
      locations: [{ value: "riverside", label: "Riverside Gym" }, { value: "hilltop", label: "Hilltop Fitness" }],
      coaches: [
        { value: "ada", label: "Ada", attributes: { location: "riverside" } },
        { value: "zoe", label: "Zoë", attributes: { location: "hilltop" } },
      ],
    };
    const filtered = form([
      field("location", "single-choice", { props: { optionsFrom: { source: "host", key: "locations" } } }),
      field("coach", "single-choice", { props: { optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } } } }),
      field("helpers", "multi-choice", { props: { optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } } } }),
    ]);
    const base = { location: "riverside", coach: "ada", helpers: ["ada", "zoe"] };
    expect(mergeResponses(filtered, base, { location: "hilltop" }, { hostOptions: lists })).toEqual({ location: "hilltop", helpers: ["zoe"] });
    expect(mergeResponses(filtered, base, { location: "hilltop", coach: "zoe" }, { hostOptions: lists })).toEqual({
      location: "hilltop",
      coach: "zoe",
      helpers: ["zoe"],
    });
    // The patch comes first in key order, the answer it depends on last: the result is the same.
    expect(mergeResponses(filtered, { coach: "zoe" }, { location: "hilltop" }, { hostOptions: lists })).toEqual({ location: "hilltop", coach: "zoe" });
  });

  it("returns answers in the form's order that validateSubmission accepts", () => {
    const merged = mergeResponses(branching, { score: 4, member: true }, { since: "2026-03-04" });
    expect(Object.keys(merged)).toEqual(["member", "since", "score"]);
    const checked = validateSubmission(branching, { answers: merged });
    expect(checked.ok && checked.submission.answers).toEqual({ member: true, since: "2026-03-04", score: 4, total: 8 });
  });

  it("treats prototype names as data and ignores malformed inputs", () => {
    const proto = JSON.parse('{"__proto__":{"polluted":true},"score":2}') as Record<string, never>;
    expect(mergeResponses(branching, proto, null as never)).toEqual({ score: 2 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(mergeResponses(branching, [] as never, "x" as never)).toEqual({});
  });
});
