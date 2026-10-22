import { describe, expect, it } from "vitest";
import { FeatureRegistryError, defineFeatures, defineFlags, expiredFlags, flagsForFeature, toRecords } from "../index";
import { features, flags, type FeatureId } from "./fixture";

const base = { name: "X", summary: "Does x.", status: "live", owner: "mark", apps: ["web"], audience: ["client"] } as const;

function problems(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof FeatureRegistryError) return error.problems;
    throw error;
  }
  return [];
}

describe("defineFeatures", () => {
  it("returns the same object, typed by its keys", () => {
    const id: FeatureId = "tasks";
    expect(features[id].name).toBe("Tasks");
    // @ts-expect-error not a feature
    const bad: FeatureId = "nope";
    expect(bad).toBe("nope");
  });

  it("lists every problem at once", () => {
    const found = problems(() =>
      defineFeatures({
        Bad: { ...base },
        ok: { ...base, status: "shipped" as never, apps: [], since: "2026-13-01" },
        paths: { ...base, links: { code: ["../outside", "/abs"], issue: "nope" } },
      }),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Bad: the id/),
        expect.stringMatching(/^ok\.status/),
        expect.stringMatching(/^ok\.apps/),
        expect.stringMatching(/^ok\.since/),
        expect.stringMatching(/^paths\.links\.code\.0/),
        expect.stringMatching(/^paths\.links\.code\.1/),
        expect.stringMatching(/^paths\.links\.issue/),
      ]),
    );
  });

  it("refuses unknown fields, so typos don't pass silently", () => {
    expect(problems(() => defineFeatures({ a: { ...base, ownr: "x" } as never }))).toHaveLength(1);
  });

  it("accepts issue references in all three forms", () => {
    for (const issue of ["#12", "owner/repo#12", "https://github.com/o/r/issues/12"]) {
      expect(problems(() => defineFeatures({ a: { ...base, links: { issue } } }))).toEqual([]);
    }
  });
});

describe("defineFlags", () => {
  it("makes an unknown feature a type error and a runtime error", () => {
    const found = problems(() =>
      // @ts-expect-error "nope" is not a FeatureId
      defineFlags(features, { a: { feature: "nope", owner: "mark", kind: "ops" } }),
    );
    expect(found).toEqual(['a.feature: "nope" is not a feature']);
  });

  it("needs an owner, an expiry on release flags, and a reason for a second flag", () => {
    const found = problems(() =>
      defineFlags(features, {
        a: { feature: "tasks", owner: "", kind: "ops" },
        b: { feature: "billing", owner: "mark", kind: "release" },
        c: { feature: "billing", owner: "mark", kind: "ops" },
      }),
    );
    expect(found).toEqual([
      expect.stringMatching(/^a\.owner/),
      "b.expires: a release flag needs an expiry date",
      'c.splitReason: "billing" already has the flag b; say why this one is separate',
    ]);
  });

  it("finds a feature's flags by reverse lookup", () => {
    expect(flagsForFeature(flags, "wins")).toEqual(["wins_v2", "wins_kill"]);
    expect(flagsForFeature(flags, "tasks")).toEqual([]);
    expect(toRecords(features, flags).find((r) => r.id === "wins")?.flags).toEqual(["wins_v2", "wins_kill"]);
  });

  it("reports expired flags", () => {
    expect(expiredFlags(flags, "2026-11-30")).toEqual([]);
    expect(expiredFlags(flags, "2026-12-02")).toEqual(["wins_v2"]);
  });
});
