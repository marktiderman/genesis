import { describe, expect, it } from "vitest";
import { FeatureRegistryError, defineFeatures, defineFlags, expiredFlags, findFeatures, flagsForFeature, toRecords } from "../index";
import { features, flags, type FeatureId } from "./fixture";

const base = { name: "X", summary: "Does x.", status: "building", owner: "mark", apps: ["web"], audience: ["client"] } as const;
const flag = { owner: "mark", default: false, scopes: ["platform"] } as const;

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

  it("lists every field problem at once", () => {
    const found = problems(() =>
      defineFeatures({
        Bad: { ...base },
        ok: { ...base, status: "shipped" as never, apps: [], since: "2026-13-01" },
        paths: { ...base, links: { code: ["../outside", "/abs"], issue: "nope" } },
        vis: { ...base, visibility: "everyone" as never },
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
        expect.stringMatching(/^vis\.visibility/),
      ]),
    );
  });

  it("refuses unknown fields, so typos don't pass silently", () => {
    expect(problems(() => defineFeatures({ a: { ...base, ownr: "x" } as never }))).toHaveLength(1);
  });

  it("enforces the rules between fields", () => {
    expect(
      problems(() =>
        defineFeatures({
          a: { ...base, status: "planned" },
          b: { ...base, status: "live", horizon: "now" },
          c: { ...base, status: "beta" },
          d: { ...base, status: "planned", horizon: "later", claimedBy: "less" },
          e: { ...base, media: { alt: "nothing" } },
        }),
      ),
    ).toEqual([
      "a.horizon: a planned feature needs now, next or later",
      "b.horizon: only planned and building features are on the roadmap",
      "b.acceptance: a live feature needs at least one testable sentence",
      "c.acceptance: a beta feature needs at least one testable sentence",
      "d.claimedBy: only a building feature can be claimed",
      "e.media: needs an image or a video",
    ]);
  });

  it("keeps ids and aliases unique", () => {
    expect(problems(() => defineFeatures({ a: { ...base, aliases: ["old"] }, b: { ...base, aliases: ["old", "a"] } }))).toEqual([
      'b: "old" is already an alias of a',
      'b: "a" is already a feature id',
    ]);
  });

  it("accepts client visibility, plan access and issue references in all three forms", () => {
    for (const issue of ["#12", "owner/repo#12", "https://github.com/o/r/issues/12"]) {
      expect(problems(() => defineFeatures({ a: { ...base, visibility: "client:acme", access: { plan: "pro" }, links: { issue } } }))).toEqual([]);
    }
  });
});

describe("defineFlags", () => {
  it("makes an unknown feature a type error and a runtime error", () => {
    const found = problems(() =>
      // @ts-expect-error "nope" is not a FeatureId
      defineFlags(features, { a: { ...flag, feature: "nope", kind: "ops", runbook: "docs/x.md" } }),
    );
    expect(found).toEqual(['a.feature: "nope" is not a feature']);
  });

  it("needs an owner, expiry on release and experiment flags, a runbook on ops flags, and a reason for a second flag", () => {
    const found = problems(() =>
      defineFlags(features, {
        a: { ...flag, feature: "tasks", owner: "", kind: "permission" },
        b: { ...flag, feature: "billing", kind: "release" },
        c: { ...flag, feature: "billing", kind: "experiment", expires: "2026-11-01" },
        d: { ...flag, feature: "wins", kind: "ops" },
      }),
    );
    expect(found).toEqual([
      expect.stringMatching(/^a\.owner/),
      "b.expires: a release flag needs an expiry date",
      'c.splitReason: "billing" already has the flag b; say why this one is separate',
      "d.runbook: an ops flag needs a runbook",
    ]);
  });

  it("finds a feature's flags by reverse lookup", () => {
    expect(flagsForFeature(flags, "wins")).toEqual(["wins.v2", "wins.kill"]);
    expect(flagsForFeature(flags, "tasks")).toEqual([]);
    expect(toRecords(features, flags).find((r) => r.id === "wins")?.flags).toEqual(["wins.v2", "wins.kill"]);
  });

  it("reports expired flags", () => {
    expect(expiredFlags(flags, "2026-11-30")).toEqual([]);
    expect(expiredFlags(flags, "2026-12-02")).toEqual(["wins.v2"]);
  });
});

describe("toRecords and findFeatures", () => {
  it("fills visibility and access defaults", () => {
    const [tasks, , billing] = toRecords(features);
    expect(tasks).toMatchObject({ visibility: "public", access: "all" });
    expect(billing).toMatchObject({ visibility: "internal", access: { plan: "pro" } });
  });

  it("ranks id and name matches above summary and path matches", () => {
    expect(findFeatures(features, "win").map((r) => r.id)).toEqual(["wins"]);
    expect(findFeatures(features, "src/tasks").map((r) => r.id)).toEqual(["tasks"]);
    expect(findFeatures(features, "seats").map((r) => r.id)).toEqual(["billing"]);
    expect(findFeatures(features, "wins.kill", flags).map((r) => r.id)).toEqual(["wins"]);
    expect(findFeatures(features, "  ")).toEqual([]);
  });
});
