import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Registry, Switchboard } from "../index";
import {
  GitdataAdapter,
  attachGitdata,
  gitdataMdContract,
  gitdataResourceName,
} from "../gitdata";

function seedFeatures(dataRoot: string) {
  const dir = join(dataRoot, "features");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "GEN-900--alpha.md"),
    `---
kind: feature-record
id: GEN-900
slug: alpha
type: feature
parent: null
cleanse: pending
owns:
  - apps/sample/**
---

# Alpha

## The job
Does the alpha thing.

## Notes (inbox — AL-132)
- hello
`,
    "utf8",
  );
}

describe("GitdataAdapter", () => {
  it("lists, gets, updates frontmatter + job, and attachGitdata wires the registry", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "gitdata-"));
    seedFeatures(dataRoot);

    const resource = gitdataResourceName("features");
    const adapter = new GitdataAdapter({
      dataRoot,
      resources: { [resource]: { dir: "features" } },
    });
    const contract = gitdataMdContract(resource);

    const rows = await adapter.list(contract);
    expect(rows).toHaveLength(1);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      id: "GEN-900",
      slug: "alpha",
      title: "Alpha",
      cleanse: "pending",
    });
    expect(String(first!.job)).toMatch(/alpha thing/i);
    expect(first!.owns).toEqual(["apps/sample/**"]);

    const updated = await adapter.update(contract, "GEN-900", {
      cleanse: "ratified",
      job: "Updated job text for alpha.",
      title: "Alpha Prime",
    });
    expect(updated).toMatchObject({
      id: "GEN-900",
      cleanse: "ratified",
      title: "Alpha Prime",
    });
    expect(String(updated.job)).toMatch(/Updated job/);

    const disk = readFileSync(join(dataRoot, "features/GEN-900--alpha.md"), "utf8");
    expect(disk).toMatch(/cleanse: ratified/);
    expect(disk).toMatch(/# Alpha Prime/);
    expect(disk).toMatch(/Updated job text for alpha/);

    const registry = new Registry();
    const names = attachGitdata(registry, { dataRoot, tables: ["features"] });
    expect(names).toEqual([resource]);
    registry.setEnvironmentDefault("gitdata");
    const sb = new Switchboard(registry);
    const one = await sb.resource(resource).get("GEN-900");
    expect(one?.title).toBe("Alpha Prime");
  });

  it("reads single-quoted frontmatter literally, backslashes included", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "gitdata-"));
    const dir = join(dataRoot, "features");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "GEN-901--beta.md"),
      `---\nkind: feature-record\nid: GEN-901\nslug: beta\nsummary: 'C:\\temp\\new "quoted" it''s'\nplain: 'hello'\n---\n\n# Beta\n`,
      "utf8",
    );
    const resource = gitdataResourceName("features");
    const adapter = new GitdataAdapter({ dataRoot, resources: { [resource]: { dir: "features" } } });
    const [row] = await adapter.list(gitdataMdContract(resource));
    expect(row).toMatchObject({ id: "GEN-901", title: "Beta", plain: "hello" });
    expect(row!.summary).toBe('C:\\temp\\new "quoted" it\'s');
  });

  it("finds and replaces the title in linear time on a long run of spaces", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "gitdata-"));
    const dir = join(dataRoot, "features");
    mkdirSync(dir, { recursive: true });
    const spaces = " ".repeat(100_000);
    writeFileSync(
      join(dir, "GEN-902--gamma.md"),
      `---\nkind: feature-record\nid: GEN-902\nslug: gamma\n---\n\n#${spaces}\n#${spaces}x${spaces}\n`,
      "utf8",
    );
    const resource = gitdataResourceName("features");
    const adapter = new GitdataAdapter({ dataRoot, resources: { [resource]: { dir: "features" } } });
    const contract = gitdataMdContract(resource);
    const started = performance.now();
    const [row] = await adapter.list(contract);
    expect(row!.title).toBe("x");
    const updated = await adapter.update(contract, "GEN-902", { title: "Gamma $& $1", job: "Gamma job." });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(updated.title).toBe("Gamma $& $1");
    const disk = readFileSync(join(dir, "GEN-902--gamma.md"), "utf8");
    expect(disk).toContain("# Gamma $& $1\n\n## The job\nGamma job.");
  });
});
