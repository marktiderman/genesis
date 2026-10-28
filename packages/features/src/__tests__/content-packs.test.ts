/** @feat:content-packs */
import { describe, expect, it } from "vitest";
import { BlockError, ContentPackError, contentPackBlocks, contentPackProblems, defineBlock, defineContentPack, type ContentPackDef, type ContentPackSectionValidator } from "../blocks-entry";

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

// A block that owns meetings checks its own items; Genesis only knows keys.
const meetings: ContentPackSectionValidator = (items) =>
  items.flatMap((item) => {
    const { key, minutes } = item as { key: string; minutes?: unknown };
    return typeof minutes === "number" && minutes > 0 ? [] : [`${key}: minutes must be more than 0`];
  });
const meetingsBlock = defineBlock({ id: "meetings", contributes: { contentSection: meetings } });

const GENERIC = {
  id: "starter",
  name: "Starter",
  version: "1.0.0",
  publisher: "@acme/content",
  requires: ["meetings", "checklists"],
  labels: { "project.phase": "Stage" },
  sections: {
    meetings: [{ key: "weekly", name: "Weekly", minutes: 60 }],
    checklists: [{ key: "onboarding", steps: ["a", "b"] }],
  },
} as const satisfies ContentPackDef;

describe("content pack sections", () => {
  it("accepts any block's items, keyed, and needs the blocks it fills", () => {
    expect(defineContentPack(GENERIC)).toBe(GENERIC);
    expect(contentPackBlocks(GENERIC)).toEqual(["checklists", "meetings"]);
    expect(contentPackProblems({ ...GENERIC, requires: ["meetings"] })).toEqual([
      "content pack starter: fills the checklists block but doesn't list it in requires",
    ]);
  });

  it("checks every item's key whatever the block", () => {
    const bad = { ...GENERIC, sections: { meetings: [{ key: "a" }, { key: "a" }, { name: "no key" }], checklists: "nope" } } as unknown as ContentPackDef;
    expect(contentPackProblems(bad)).toEqual([
      'content pack starter.sections.meetings: the key "a" is used twice',
      'content pack starter.sections.meetings[2].key: "undefined" is not a key (lowercase, dots, dashes or underscores)',
      "content pack starter.sections.checklists: must be a list of items",
    ]);
  });

  it("runs the validator a block registers, or one given by block id", () => {
    const pack = { ...GENERIC, sections: { ...GENERIC.sections, meetings: [{ key: "weekly", minutes: 0 }] } } as ContentPackDef;
    const expected = ["content pack starter.sections.meetings: weekly: minutes must be more than 0"];
    expect(contentPackProblems(pack)).toEqual([]);
    expect(contentPackProblems(pack, { blocks: [meetingsBlock] })).toEqual(expected);
    expect(contentPackProblems(pack, { validators: { meetings } })).toEqual(expected);
    expect(() => defineContentPack(pack, { blocks: [meetingsBlock] })).toThrow(ContentPackError);
    // Options and the installed blocks together.
    expect(contentPackProblems(GENERIC, { installed: ["meetings"], blocks: [meetingsBlock] })).toEqual([
      "content pack starter: needs the checklists block, which isn't installed",
    ]);
  });

  it("is a block contribution defineBlock accepts", () => {
    expect(meetingsBlock.contributes?.contentSection).toBe(meetings);
    expect(() => defineBlock({ id: "x", contributes: { contentSections: meetings } as never })).toThrow(BlockError);
  });
});
