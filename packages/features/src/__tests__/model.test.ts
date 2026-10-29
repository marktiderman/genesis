import { describe, expect, it } from "vitest";
import { FeatureRegistryError, defineFeatures, defineFlags, expiredFlags, featureKind, featurePackageLayer, findFeatures, flagsForFeature, toRecords } from "../index";
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

describe("reuse fields", () => {
  const shipped = { ...base, status: "live", acceptance: ["It works."] } as const;

  it("accepts an idea with only the required fields", () => {
    expect(problems(() => defineFeatures({ chat: { ...base, status: "idea", keywords: ["dm", "inbox"] } }))).toEqual([]);
  });

  it("checks layer, platforms and entry by name", () => {
    const found = problems(() =>
      defineFeatures({
        // @ts-expect-error not a layer
        a: { ...base, layer: "widget" },
        // @ts-expect-error not a platform
        b: { ...base, platforms: { tv: "live" } },
        // @ts-expect-error not a status
        c: { ...base, entry: { web: "x" }, platforms: { web: "shipped" } },
      }),
    );
    expect(found.some((p) => p.startsWith("a.layer"))).toBe(true);
    expect(found.some((p) => p.startsWith("b.platforms"))).toBe(true);
    expect(found.some((p) => p.startsWith("c.platforms.web"))).toBe(true);
  });

  it("requires extends and requires to name other features", () => {
    expect(
      problems(() =>
        defineFeatures({
          a: { ...base, extends: "a", requires: ["a", "missing"] },
          b: { ...base, extends: "missing" },
        }),
      ),
    ).toEqual([
      'a.extends: a feature can\'t extend itself',
      "a.requires: a feature can't require itself",
      'a.requires: "missing" is not a feature',
      'b.extends: "missing" is not a feature',
    ]);
  });

  it("refuses a shipped feature that needs an unshipped one", () => {
    expect(problems(() => defineFeatures({ push: { ...base, status: "planned", horizon: "now" }, inbox: { ...shipped, requires: ["push"] } }))).toEqual([
      'inbox.requires: a live feature can\'t require "push", which is planned',
    ]);
    expect(problems(() => defineFeatures({ push: { ...base }, inbox: { ...base, requires: ["push"] } }))).toEqual([]);
  });

  it("finds a cycle through requires", () => {
    expect(problems(() => defineFeatures({ a: { ...base, requires: ["b"] }, b: { ...base, requires: ["c"] }, c: { ...base, requires: ["a"] } }))).toEqual([
      "c.requires: a cycle: a → b → c → a",
    ]);
  });
});

describe("findFeatures with reuse fields", () => {
  const catalog = defineFeatures({
    inbox: { ...base, name: "Inbox", keywords: ["chat", "dm"], layer: "block", platforms: { web: "live", native: "planned" }, slots: ["composer"] },
    settings: { ...base, name: "Settings", layer: "layout", apps: ["web", "native"], entry: { web: "@acme/ui/settings-row" } },
    palette: { ...base, name: "Command palette", layer: "pattern", status: "idea" },
  });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it("matches keywords as strongly as names, and entry and slots weakly", () => {
    expect(ids(findFeatures(catalog, "chat"))).toEqual(["inbox"]);
    expect(ids(findFeatures(catalog, "composer"))).toEqual(["inbox"]);
    expect(ids(findFeatures(catalog, "settings-row"))).toEqual(["settings"]);
  });

  it("filters by platform (platforms first, then apps), layer and status", () => {
    expect(ids(findFeatures(catalog, "", undefined, { platform: "native" }))).toEqual(["inbox", "settings"]);
    expect(ids(findFeatures(catalog, "", undefined, { layer: "layout" }))).toEqual(["settings"]);
    expect(ids(findFeatures(catalog, "", undefined, { status: "idea" }))).toEqual(["palette"]);
    expect(ids(findFeatures(catalog, "inbox", undefined, { platform: "server" }))).toEqual([]);
  });
});

describe("kind, and layer from the owning package", () => {
  const packages = [
    { name: "@acme/ui", dir: "packages/ui", layer: "foundation" as const },
    { name: "@acme/chat", dir: "packages/chat", layer: "primitive" as const },
  ];
  const catalog = defineFeatures({
    button: { ...base, name: "Button", kind: "element", entry: { web: "@acme/ui/button" } },
    old: { ...base, name: "Old card", layer: "primitive", links: { code: ["packages/ui/src/card.tsx"] } },
    thread: { ...base, name: "Thread", kind: "pattern", links: { code: ["packages/chat/src"] } },
    local: { ...base, name: "App screen", kind: "layout" },
  });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it("reads kind, and the deprecated layer field as a kind", () => {
    expect(ids(findFeatures(catalog, "", undefined, { kind: "element" }))).toEqual(["button", "old"]);
    expect(ids(findFeatures(catalog, "", undefined, { layer: "primitive" }))).toEqual(["button", "old"]);
    expect(toRecords(catalog).find((r) => r.id === "old")?.kind).toBe("element");
  });

  it("derives a feature's layer from its entry, else its code paths", () => {
    expect(featurePackageLayer(catalog.button, packages)).toBe("foundation");
    expect(featurePackageLayer(catalog.old, packages)).toBe("foundation");
    expect(featurePackageLayer(catalog.thread, packages)).toBe("primitive");
    expect(featurePackageLayer(catalog.local, packages)).toBeUndefined();
    expect(ids(findFeatures(catalog, "", undefined, { packageLayer: "primitive", packages }))).toEqual(["thread"]);
  });

  it("refuses a layer that disagrees with kind", () => {
    expect(problems(() => defineFeatures({ a: { ...base, kind: "element", layer: "pattern" } }))).toEqual([
      "a.layer: says pattern but kind says element; drop layer (deprecated), kind replaces it",
    ]);
    expect(featureKind({ kind: "element", layer: "primitive" })).toBe("element");
  });
});

describe("second review", () => {
  it("reports a schema-invalid entry once, without throwing in the relation scans", () => {
    const found = problems(() =>
      defineFeatures({
        // @ts-expect-error requires must be an array
        a: { ...base, requires: 5 },
        b: { ...base, requires: ["a"] },
      }),
    );
    expect(found.some((p) => p.startsWith("a.requires"))).toBe(true);
    expect(found.some((p) => p.includes('"a" is not a feature'))).toBe(false);
  });

  it("treats node in apps as the server platform", () => {
    const catalog = defineFeatures({ engine: { ...base, apps: ["web", "node"] } });
    expect(findFeatures(catalog, "", undefined, { platform: "server" }).map((r) => r.id)).toEqual(["engine"]);
  });
});
