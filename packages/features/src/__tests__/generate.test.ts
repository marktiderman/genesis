import { describe, expect, it } from "vitest";
import {
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  readAgentsBlock,
  replaceAgentsBlock,
  toAgentsMarkdown,
  toJson,
  toMarketingMarkdown,
  toOpenFeatureManifest,
  toSkillMarkdown,
} from "../index";
import { features, flags } from "./fixture";

describe("toJson", () => {
  it("is stable and carries flags", () => {
    const json = toJson(features, flags);
    expect(json).toBe(toJson(features, flags));
    const doc = JSON.parse(json);
    expect(doc.features.map((f: { id: string }) => f.id)).toEqual(["tasks", "wins", "billing"]);
    expect(doc.features[1].flags).toEqual(["wins.v2", "wins.kill"]);
    expect(doc.flags["wins.v2"].expires).toBe("2026-12-01");
  });
});

describe("toOpenFeatureManifest", () => {
  it("writes an OpenFeature CLI manifest", () => {
    const doc = JSON.parse(toOpenFeatureManifest({ ...flags, "x.n": { ...flags["wins.v2"], default: 1.5 } }, features));
    expect(doc.$schema).toMatch(/open-feature\/cli/);
    expect(doc.flags["wins.v2"]).toEqual({ flagType: "boolean", defaultValue: false, description: "release flag for Wins" });
    expect(doc.flags["x.n"].flagType).toBe("float");
  });
});

describe("toAgentsMarkdown", () => {
  const block = toAgentsMarkdown(features, flags, { command: "bun run features" });

  it("is a short pointer with counts, not a list", () => {
    expect(block.startsWith(AGENTS_BLOCK_START)).toBe(true);
    expect(block.endsWith(AGENTS_BLOCK_END)).toBe(true);
    expect(block).toContain("3 features (1 planned, 1 beta, 1 live), 2 flags");
    expect(block).toContain("`bun run features find <term>`");
    expect(block).toContain(".claude/skills/features/SKILL.md");
    expect(block).not.toContain("Every step forward");
    expect(block.split("\n").length).toBeLessThan(15);
  });

  it("replaces only the marked block and appends one when missing", () => {
    const doc = `# Agents\n\nIntro.\n\n${AGENTS_BLOCK_START}\nold\n${AGENTS_BLOCK_END}\n\nOutro $& $1.\n`;
    const next = replaceAgentsBlock(doc, block);
    expect(next.startsWith("# Agents\n\nIntro.\n\n")).toBe(true);
    expect(next.endsWith("\n\nOutro $& $1.\n")).toBe(true);
    expect(readAgentsBlock(next)).toBe(block);
    expect(replaceAgentsBlock(next, block)).toBe(next);
    expect(replaceAgentsBlock("# Agents", block)).toBe(`# Agents\n\n${block}\n`);
    expect(replaceAgentsBlock("", block)).toBe(`${block}\n`);
  });
});

describe("toMarketingMarkdown", () => {
  it("lists public, shipped features with a tagline, highlights first, by category", () => {
    const md = toMarketingMarkdown(features, { heading: "What it does" });
    expect(md).toContain("## What it does");
    expect(md.indexOf("**Tasks** — Never lose a next step.")).toBeLessThan(md.indexOf("### Coaching"));
    expect(md).toContain("**Wins** (beta) — Celebrate progress.");
    expect(md).not.toContain("Billing");
  });
});

describe("toSkillMarkdown", () => {
  it("is a skill with find, add, change and retire, and says to remove the code before the flag", () => {
    const skill = toSkillMarkdown({ source: "features.ts" });
    expect(skill).toMatch(/^---\nname: features\ndescription: /);
    for (const heading of ["## Find", "## Add", "## Change", "## Retire"]) expect(skill).toContain(heading);
    expect(skill.indexOf("Remove the code first")).toBeLessThan(skill.indexOf("Then remove its flags"));
  });
});

describe("toSkillMarkdown outputs", () => {
  it("names only what the build writes", () => {
    expect(toSkillMarkdown({ command: "bun run features", outputs: ["the AGENTS.md block", "`features.json`", "this skill"] })).toContain(
      "`bun run features build` generates the rest from it: the AGENTS.md block, `features.json`, this skill.",
    );
  });
});
