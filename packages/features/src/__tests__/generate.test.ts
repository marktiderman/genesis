import { describe, expect, it } from "vitest";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START, readAgentsBlock, replaceAgentsBlock, toAgentsMarkdown, toJson } from "../index";
import { features, flags } from "./fixture";

describe("toJson", () => {
  it("is stable and carries flags", () => {
    const json = toJson(features, flags);
    expect(json).toBe(toJson(features, flags));
    const doc = JSON.parse(json);
    expect(doc.features.map((f: { id: string }) => f.id)).toEqual(["tasks", "wins", "billing"]);
    expect(doc.features[1].flags).toEqual(["wins_v2", "wins_kill"]);
    expect(doc.flags.wins_v2.expires).toBe("2026-12-01");
  });
});

describe("toAgentsMarkdown", () => {
  const block = toAgentsMarkdown(features, flags);

  it("is delimited by the markers and groups by status in lifecycle order", () => {
    expect(block.startsWith(AGENTS_BLOCK_START)).toBe(true);
    expect(block.endsWith(AGENTS_BLOCK_END)).toBe(true);
    expect(block.indexOf("### Planned")).toBeLessThan(block.indexOf("### Beta"));
    expect(block.indexOf("### Beta")).toBeLessThan(block.indexOf("### Live"));
    expect(block).not.toContain("### Building");
  });

  it("escapes pipes and lists flags and code", () => {
    expect(block).toContain("Every step forward, \\| recorded.");
    expect(block).toContain("`wins_v2`, `wins_kill`");
    expect(block).toContain("`src/tasks.ts`");
  });

  it("replaces only the marked block and appends one when missing", () => {
    const doc = `# Agents\n\nIntro.\n\n${AGENTS_BLOCK_START}\nold\n${AGENTS_BLOCK_END}\n\nOutro $& $1.\n`;
    const next = replaceAgentsBlock(doc, block);
    expect(next.startsWith("# Agents\n\nIntro.\n\n")).toBe(true);
    expect(next.endsWith("\n\nOutro $& $1.\n")).toBe(true);
    expect(readAgentsBlock(next)).toBe(block);
    expect(replaceAgentsBlock(next, block)).toBe(next);

    const appended = replaceAgentsBlock("# Agents", block);
    expect(appended).toBe(`# Agents\n\n${block}\n`);
    expect(replaceAgentsBlock("", block)).toBe(`${block}\n`);
  });
});
