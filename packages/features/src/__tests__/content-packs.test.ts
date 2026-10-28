/** @feat:content-packs */
import { describe, expect, it } from "vitest";
import { ContentPackError, contentPackBlocks, contentPackProblems, defineContentPack, type ContentPackDef } from "../blocks-entry";

const PACK = {
  id: "weekly-team-rhythm",
  name: "Weekly team rhythm",
  version: "1.0.0",
  publisher: "@marktiderman/genesis-content",
  requires: ["sessions", "metrics", "pursuits"],
  labels: { "pursuit.quarter": "Quarterly goals" },
  sessionTypes: [{ key: "weekly", kind: "team", name: "Weekly meeting", agenda: [{ key: "check-in", title: "Check in", minutes: 5 }, { key: "issues", title: "Issues", minutes: 60 }] }],
  metricTemplates: [{ key: "revenue", name: "Revenue", unitType: "currency", cadence: "weekly", goalDirection: "up" }],
  fieldDefinitions: [{ key: "confidence", target: "work_items", label: "Confidence", field: { type: "choice" }, visibility: "tenant" }],
} as const satisfies ContentPackDef;

describe("defineContentPack", () => {
  it("returns a valid pack unchanged", () => {
    expect(defineContentPack(PACK)).toBe(PACK);
    expect(contentPackBlocks(PACK)).toEqual(["metrics", "pursuits", "sessions"]);
  });

  it("lists every shape problem at once", () => {
    const bad = {
      ...PACK,
      id: "Weekly",
      version: "1",
      requires: ["sessions"],
      labels: { "Bad Key": "" },
      sessionTypes: [
        { key: "weekly", kind: "team", name: "A", agenda: [{ key: "a", title: "A", minutes: 0 }, { key: "a", title: "B", minutes: 5 }] },
        { key: "weekly", kind: "team", name: "B", agenda: [] },
      ],
      fieldDefinitions: [{ key: "x", target: "nowhere", label: "X", field: {}, visibility: "public" }],
      roadmapTemplates: [{ key: "start", name: "Start", items: [{ key: "one", kind: "lesson", title: "One", ref: "missing", release: { rule: "now" } }] }],
    } as unknown as ContentPackDef;
    try {
      defineContentPack(bad);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContentPackError);
      const problems = (error as ContentPackError).problems.join("\n");
      for (const expected of [
        "id must be kebab-case",
        'version "1" isn\'t semver',
        'label key "Bad Key"',
        'the key "weekly" is used twice',
        'the key "a" is used twice',
        "minutes must be more than 0",
        'target "nowhere"',
        "field needs a genesis-forms type",
        "visibility must be tenant, app or private",
        'ref "missing" isn\'t another item',
        "fills the metrics block but doesn't list it in requires",
        "fills the roadmap block but doesn't list it in requires",
      ]) {
        expect(problems).toContain(expected);
      }
    }
  });

  it("refuses to install a pack whose blocks aren't all installed", () => {
    expect(contentPackProblems(PACK, ["sessions", "metrics", "pursuits"])).toEqual([]);
    expect(contentPackProblems(PACK, (id) => id !== "metrics")).toEqual([
      "content pack weekly-team-rhythm: needs the metrics block, which isn't installed",
    ]);
  });
});
